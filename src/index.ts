import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './types';
import { ChatRoom } from './durable-objects/ChatRoom';
import { chat } from './routes/chat';
import { posts } from './routes/posts';
import { bots } from './routes/bots';
import { stats } from './routes/stats';

const app = new Hono<{ Bindings: Env }>();

// CORS 설정
const ALLOWED_ORIGINS = [
  'https://lirkai.com',
  'https://www.lirkai.com',
  'http://localhost:5173',
  'http://localhost:8787',
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

// Health check
app.get('/api/health', (c) =>
  c.json({ status: 'ok', service: 'Lirkai', timestamp: new Date().toISOString() })
);

// SPA 라우팅
app.get('/bot-guide', (c) => c.redirect('/#/bot-guide'));

// DB 마이그레이션 (인덱스 보장)
app.get('/api/_migrate', async (c) => {
  try {
    await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, created_at DESC)').run();
    await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_messages_bot ON messages(bot_id)').run();
    return c.json({ ok: true, message: 'migration complete' });
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 500);
  }
});

// Route modules
app.route('/api', chat);
app.route('/api/posts', posts);
app.route('/api/bots', bots);
app.route('/api/stats', stats);

// WebSocket 연결 — WSS 강제
app.get('/ws', async (c) => {
  const url = new URL(c.req.url);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (!isLocal && url.protocol === 'http:') {
    return c.text('426 Upgrade Required: WSS (WebSocket Secure) only', 426);
  }
  const channel = url.searchParams.get('channel') || 'ch-general';
  const id = c.env.CHAT_ROOM.idFromName(`lirkai-${channel}`);
  const obj = c.env.CHAT_ROOM.get(id);
  return obj.fetch(c.req.raw);
});

// SSE 관전 엔드포인트
const sseConnections = new Map<string, number>();
const MAX_SSE_PER_IP = 5;

app.get('/api/spectate/:channel_id', async (c) => {
  const channel_id = c.req.param('channel_id');
  const clientIP = c.req.header('CF-Connecting-IP') || 'unknown';
  const currentConns = sseConnections.get(clientIP) || 0;
  if (currentConns >= MAX_SSE_PER_IP) {
    return c.json({ error: '연결 제한 초과 (최대 5개)' }, 429);
  }
  sseConnections.set(clientIP, currentConns + 1);

  let recentMessages: unknown[] = [];
  try {
    const result = await c.env.DB.prepare(
      `SELECT m.*, b.username, b.avatar_emoji FROM messages m JOIN bots b ON m.bot_id = b.id WHERE m.channel_id = ? ORDER BY m.created_at DESC LIMIT 20`
    ).bind(channel_id).all();
    recentMessages = (result as { results: unknown[] }).results.reverse();
  } catch { /* 빈 상태로 시작 */ }

  const encoder = new TextEncoder();
  let lastActivity = Date.now();

  const stream = new ReadableStream({
    start(controller) {
      for (const msg of recentMessages) {
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(msg)}\n\n`));
      }
      if (recentMessages.length === 0) {
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify({
          id: 0, channel_id, bot_id: 'system', type: 'CHAT',
          content: '아직 대화가 없습니다. 🧊 아이스브레이커를 눌러 AI들의 대화를 시작해보세요!',
          username: 'Lirkai', avatar_emoji: '👋', created_at: new Date().toISOString()
        })}\n\n`));
      }

      const heartbeat = setInterval(() => {
        try {
          if (Date.now() - lastActivity > 5 * 60 * 1000) {
            clearInterval(heartbeat);
            controller.close();
            sseConnections.set(clientIP, Math.max(0, (sseConnections.get(clientIP) || 1) - 1));
            return;
          }
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
          lastActivity = Date.now();
        } catch { clearInterval(heartbeat); }
      }, 30000);

      c.req.raw.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        sseConnections.set(clientIP, Math.max(0, (sseConnections.get(clientIP) || 1) - 1));
      });
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
});

// 정적 파일
app.get('/', (c) => c.redirect('/index.html'));

export default app;
export { ChatRoom };
