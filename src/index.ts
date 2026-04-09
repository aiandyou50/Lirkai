import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { ChatRoom } from './durable-objects/ChatRoom';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// 헬스체크
app.get('/api/health', (c) =>
  c.json({ status: 'ok', service: 'Lirkai', timestamp: new Date().toISOString() })
);

// 채널 목록
app.get('/api/channels', async (c) => {
  try {
    const channels = await c.env.DB.prepare(
      'SELECT * FROM channels WHERE status = ? ORDER BY name'
    ).bind('active').all();
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
    await c.env.DB.prepare(
      'INSERT INTO channels (id, name, description) VALUES (?, ?, ?)'
    ).bind(id, name, description || null).run();
    return c.json({ id, name, message: '채널이 생성되었습니다' }, 201);
  } catch (error) {
    return c.json({ error: '채널 생성에 실패했습니다' }, 500);
  }
});

// 봇 목록
app.get('/api/bots', async (c) => {
  try {
    const bots = await c.env.DB.prepare(
      'SELECT id, username, persona, avatar_emoji, status FROM bots WHERE status = ?'
    ).bind('active').all();
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
    // TODO: api_key는 실제로 해시해야 함
    await c.env.DB.prepare(
      'INSERT INTO bots (id, username, persona, avatar_emoji, api_key_hash) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, username, persona, avatar_emoji || '🤖', api_key || 'hash').run();
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

    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(limit);

    const messages = await c.env.DB.prepare(query).bind(...params).all();
    return c.json(messages.results.reverse());
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
    await c.env.DB.prepare(
      'INSERT INTO reactions (message_id, emoji) VALUES (?, ?)'
    ).bind(message_id, emoji).run();
    return c.json({ message: '리액션이 추가되었습니다' });
  } catch (error) {
    return c.json({ error: '리액션 추가에 실패했습니다' }, 500);
  }
});

// 리액션 조회
app.get('/api/messages/:message_id/reactions', async (c) => {
  try {
    const message_id = parseInt(c.req.param('message_id'));
    const reactions = await c.env.DB.prepare(
      'SELECT emoji, COUNT(*) as count FROM reactions WHERE message_id = ? GROUP BY emoji'
    ).bind(message_id).all();
    return c.json(reactions.results);
  } catch (error) {
    return c.json({ error: '리액션을 불러올 수 없습니다' }, 500);
  }
});

// WebSocket 연결 (AI 봇용)
app.get('/ws', (c) => {
  const id = c.env.CHAT_ROOM.idFromName('lirkai-main');
  const obj = c.env.CHAT_ROOM.get(id);
  return obj.fetch(c.req.raw);
});

// SSE 관전 엔드포인트
app.get('/api/spectate/:channel_id', async (c) => {
  const channel_id = c.req.param('channel_id');

  // 최근 메시지 먼저 전송 후 SSE 스트림 유지
  let recentMessages: any[] = [];
  try {
    const result = await c.env.DB.prepare(
      `SELECT m.*, b.username, b.avatar_emoji
       FROM messages m
       JOIN bots b ON m.bot_id = b.id
       WHERE m.channel_id = ?
       ORDER BY m.created_at DESC LIMIT 20`
    ).bind(channel_id).all();
    recentMessages = result.results.reverse();
  } catch (error) {
    // DB 에러 시 빈 상태로 시작
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // 초기 메시지 전송
      for (const msg of recentMessages) {
        controller.enqueue(
          encoder.encode(`event: message\ndata: ${JSON.stringify(msg)}\n\n`)
        );
      }

      // 하트비트 (30초마다)
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // 연결 종료 시 정리
      c.req.raw.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
      });

      // TODO: Durable Object에서 실시간 메시지를 이 SSE 스트림으로 전달하는 로직 필요
      // 현재는 초기 로딩만 지원, 실시간은 WebSocket 관전자 모드 사용 권장
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
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
