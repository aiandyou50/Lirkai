import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { ChatRoom } from './durable-objects/ChatRoom';

const app = new Hono<{ Bindings: Env }>();

// CORS 설정: lirkai.com만 허용
const ALLOWED_ORIGINS = [
  'https://lirkai.com',
  'https://www.lirkai.com',
];

app.use('*', cors({
  origin: (origin) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return origin;
    return '';
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// IP별 SSE 연결 수 추적
const sseConnections = new Map<string, number>();
const MAX_SSE_PER_IP = 5;

// D1 재시도 헬퍼
async function d1Query<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 200 * (i + 1))); // 백오프
    }
  }
  throw new Error('Unreachable');
}
// SPA 라우팅: /bot-guide → index.html (클라이언트 라우터가 처리)
app.get('/bot-guide', (c) => {
  return c.redirect('/#/bot-guide');
});

app.get('/api/health', (c) =>
  c.json({ status: 'ok', service: 'Lirkai', timestamp: new Date().toISOString() })
);

// 채널 목록
app.get('/api/channels', async (c) => {
  try {
    const channels = await d1Query(() =>
      c.env.DB.prepare(
        'SELECT * FROM channels WHERE status = ? ORDER BY name'
      ).bind('active').all()
    );
    return c.json(channels.results);
  } catch (error) {
    return c.json({ error: '채널 목록을 불러올 수 없습니다' }, 500);
  }
});

// 채널 생성
app.post('/api/channels', async (c) => {
  try {
    const { name, description } = await c.req.json<{ name: string; description?: string }>();
    if (!name || name.trim().length === 0) {
      return c.json({ error: '채널 이름은 필수입니다' }, 400);
    }
    const id = `ch-${name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
    await d1Query(() =>
      c.env.DB.prepare(
        'INSERT INTO channels (id, name, description) VALUES (?, ?, ?)'
      ).bind(id, name, description || null).run()
    );
    return c.json({ id, name, message: '채널이 생성되었습니다' }, 201);
  } catch (error) {
    return c.json({ error: '채널 생성에 실패했습니다' }, 500);
  }
});

// 봇 목록
app.get('/api/bots', async (c) => {
  try {
    const bots = await d1Query(() =>
      c.env.DB.prepare(
        'SELECT id, username, persona, avatar_emoji, status FROM bots WHERE status = ?'
      ).bind('active').all()
    );
    return c.json(bots.results);
  } catch (error) {
    return c.json({ error: '봇 목록을 불러올 수 없습니다' }, 500);
  }
});

// 봇 등록
app.post('/api/bots', async (c) => {
  try {
    const { username, persona, avatar_emoji, api_key } = await c.req.json<{
      username: string;
      persona: string;
      avatar_emoji?: string;
      api_key?: string;
    }>();
    if (!username || !persona) {
      return c.json({ error: 'username과 persona는 필수입니다' }, 400);
    }
    const id = `bot-${username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    await d1Query(() =>
      c.env.DB.prepare(
        'INSERT INTO bots (id, username, persona, avatar_emoji, api_key_hash) VALUES (?, ?, ?, ?, ?)'
      ).bind(id, username, persona, avatar_emoji || '🤖', api_key || 'hash').run()
    );
    return c.json({ id, username, message: '봇이 등록되었습니다' }, 201);
  } catch (error) {
    return c.json({ error: '봇 등록에 실패했습니다' }, 500);
  }
});

// 채널 메시지 조회 (관전자용, 페이지네이션)
app.get('/api/channels/:channel_id/messages', async (c) => {
  try {
    const channel_id = c.req.param('channel_id');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const before = c.req.query('before');

    let query = `
      SELECT m.*, b.username, b.avatar_emoji
      FROM messages m
      JOIN bots b ON m.bot_id = b.id
      WHERE m.channel_id = ?
    `;
    const params: (string | number)[] = [channel_id];

    if (before) {
      query += ' AND m.id < ?';
      params.push(parseInt(before));
    }

    query += ' ORDER BY m.id DESC LIMIT ?';
    params.push(limit);

    const messages = await d1Query(() =>
      c.env.DB.prepare(query).bind(...params).all()
    );
    const results = messages.results.reverse();
    return c.json(results);
  } catch (error) {
    return c.json({ error: '메시지를 불러올 수 없습니다' }, 500);
  }
});

// 리액션 추가 (관전자용)
app.post('/api/messages/:message_id/react', async (c) => {
  try {
    const message_id = parseInt(c.req.param('message_id'));
    const { emoji } = await c.req.json<{ emoji: string }>();
    if (!emoji) {
      return c.json({ error: 'emoji는 필수입니다' }, 400);
    }
    await d1Query(() =>
      c.env.DB.prepare(
        'INSERT INTO reactions (message_id, emoji) VALUES (?, ?)'
      ).bind(message_id, emoji).run()
    );
    return c.json({ message: '리액션이 추가되었습니다' });
  } catch (error) {
    return c.json({ error: '리액션 추가에 실패했습니다' }, 500);
  }
});

// 리액션 조회
app.get('/api/messages/:message_id/reactions', async (c) => {
  try {
    const message_id = parseInt(c.req.param('message_id'));
    const reactions = await d1Query(() =>
      c.env.DB.prepare(
        'SELECT emoji, COUNT(*) as count FROM reactions WHERE message_id = ? GROUP BY emoji'
      ).bind(message_id).all()
    );
    return c.json(reactions.results);
  } catch (error) {
    return c.json({ error: '리액션을 불러올 수 없습니다' }, 500);
  }
});

// WebSocket 연결 — Keyless, WSS 강제
app.get('/ws', (c) => {
  const url = new URL(c.req.url);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!isLocal && url.protocol === 'http:') {
    return c.text('426 Upgrade Required: WSS (WebSocket Secure) only', 426);
  }
  const id = c.env.CHAT_ROOM.idFromName('lirkai-main');
  const obj = c.env.CHAT_ROOM.get(id);
  return obj.fetch(c.req.raw);
});

// 자동 대화 트리거 (Cron 또는 수동 호출)
app.post('/api/auto-chat', async (c) => {
  const id = c.env.CHAT_ROOM.idFromName('lirkai-main');
  const obj = c.env.CHAT_ROOM.get(id);
  return obj.fetch(new Request(c.req.raw.url, {
    method: 'POST',
    headers: c.req.raw.headers,
    body: JSON.stringify({ action: 'auto-chat' }),
  }));
});

// SSE 관전 엔드포인트
app.get('/api/spectate/:channel_id', async (c) => {
  const channel_id = c.req.param('channel_id');

  // IP 기반 연결 제한 (5개)
  const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
  const currentConns = sseConnections.get(clientIP) || 0;
  if (currentConns >= MAX_SSE_PER_IP) {
    return c.json({ error: '연결 제한 초과 (최대 5개)' }, 429);
  }
  sseConnections.set(clientIP, currentConns + 1);

  // 최근 메시지 로드 (재시도 포함)
  let recentMessages: any[] = [];
  try {
    const result = await d1Query(() =>
      c.env.DB.prepare(
        `SELECT m.*, b.username, b.avatar_emoji
         FROM messages m
         JOIN bots b ON m.bot_id = b.id
         WHERE m.channel_id = ?
         ORDER BY m.created_at DESC LIMIT 20`
      ).bind(channel_id).all()
    );
    recentMessages = result.results.reverse();
  } catch (error) {
    // DB 에러 시 빈 상태로 시작
  }

  const encoder = new TextEncoder();
  let lastActivity = Date.now();

  const stream = new ReadableStream({
    start(controller) {
      // 초기 메시지 전송
      for (const msg of recentMessages) {
        controller.enqueue(
          encoder.encode(`event: message\ndata: ${JSON.stringify(msg)}\n\n`)
        );
      }

      // 하트비트 (30초) + 10분 비활성 타임아웃
      const heartbeat = setInterval(() => {
        try {
          if (Date.now() - lastActivity > 10 * 60 * 1000) {
            // 10분간 활동 없으면 연결 종료
            clearInterval(heartbeat);
            controller.close();
            const conns = sseConnections.get(clientIP) || 1;
            sseConnections.set(clientIP, Math.max(0, conns - 1));
            return;
          }
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
          lastActivity = Date.now();
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // 클라이언트 연결 종료 시 정리
      c.req.raw.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        const conns = sseConnections.get(clientIP) || 1;
        sseConnections.set(clientIP, Math.max(0, conns - 1));
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

// 정적 파일 서빙 (개발용, 프로덕션에서는 Cloudflare Pages 권장)
app.get('/', async (c) => {
  // NOTE: Cloudflare Workers에서는 Assets 바인딩 또는 Pages 사용
  // 개발 중에는 wrangler dev --assets public 사용
  return c.redirect('/index.html');
});

export default app;
export { ChatRoom };
