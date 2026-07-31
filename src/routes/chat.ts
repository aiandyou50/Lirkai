import { Hono } from 'hono';
import { Env } from '../types';

const chat = new Hono<{ Bindings: Env }>();

// D1 재시도 헬퍼
async function d1Query<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  }
  throw new Error('Unreachable');
}

// 채널 목록
chat.get('/channels', async (c) => {
  try {
    const channels = await d1Query(() =>
      c.env.DB.prepare('SELECT * FROM channels WHERE status = ? ORDER BY name').bind('active').all()
    );
    return c.json(channels.results);
  } catch {
    return c.json({ error: '채널 목록을 불러올 수 없습니다' }, 500);
  }
});

// 채널 메시지 조회 (페이지네이션)
chat.get('/channels/:channel_id/messages', async (c) => {
  try {
    const channel_id = c.req.param('channel_id');
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
    const before = c.req.query('before');

    let query = `
      SELECT m.*, b.username, b.avatar_emoji
      FROM messages m JOIN bots b ON m.bot_id = b.id
      WHERE m.channel_id = ?
    `;
    const params: (string | number)[] = [channel_id];
    if (before) { query += ' AND m.id < ?'; params.push(parseInt(before)); }
    query += ' ORDER BY m.id DESC LIMIT ?';
    params.push(limit);

    const messages = await d1Query(() => c.env.DB.prepare(query).bind(...params).all());
    return c.json(messages.results.reverse());
  } catch {
    return c.json({ error: '메시지를 불러올 수 없습니다' }, 500);
  }
});

// 봇 메시지 전송 (REST)
chat.post('/channels/:channel_id/messages', async (c) => {
  try {
    const channel_id = c.req.param('channel_id');
    const { bot_id, content, type } = await c.req.json();
    if (!bot_id || !content) return c.json({ error: 'bot_id와 content가 필요합니다' }, 400);

    const bot = await d1Query(() =>
      c.env.DB.prepare('SELECT id, username FROM bots WHERE id = ?').bind(bot_id).first()
    );
    if (!bot) return c.json({ error: '봇을 찾을 수 없습니다' }, 404);

    const msg_type = type === 'think' ? 'THINK' : 'CHAT';
    const result = await d1Query(() =>
      c.env.DB.prepare('INSERT INTO messages (channel_id, bot_id, content, type) VALUES (?, ?, ?, ?)')
        .bind(channel_id, bot_id, content, msg_type).run()
    );
    const messageId = result.meta.last_row_id;

    // WebSocket 브로드캐스트
    const id = c.env.CHAT_ROOM.idFromName(`lirkai-${channel_id}`);
    const obj = c.env.CHAT_ROOM.get(id);
    obj.fetch(new Request('https://internal/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: messageId, channel_id, bot_id, username: bot.username, content, type: msg_type, created_at: new Date().toISOString() }),
    }));

    return c.json({ ok: true, id: messageId, bot_id, content, type: msg_type });
  } catch (error) {
    return c.json({ error: '메시지 전송 실패', detail: String(error) }, 500);
  }
});

// 리액션 추가
chat.post('/messages/:message_id/react', async (c) => {
  try {
    const message_id = parseInt(c.req.param('message_id'));
    const { emoji } = await c.req.json<{ emoji: string }>();
    if (!emoji) return c.json({ error: 'emoji는 필수입니다' }, 400);

    const cnt = await d1Query(() =>
      c.env.DB.prepare('SELECT COUNT(*) as cnt FROM reactions WHERE message_id = ? AND emoji = ?')
        .bind(message_id, emoji).first()
    );
    if ((cnt as any)?.cnt >= 10) return c.json({ message: '리액션이 이미 충분합니다' });

    await d1Query(() =>
      c.env.DB.prepare('INSERT INTO reactions (message_id, emoji) VALUES (?, ?)').bind(message_id, emoji).run()
    );
    return c.json({ message: '리액션이 추가되었습니다' });
  } catch {
    return c.json({ error: '리액션 추가에 실패했습니다' }, 500);
  }
});

// 리액션 조회
chat.get('/messages/:message_id/reactions', async (c) => {
  try {
    const message_id = parseInt(c.req.param('message_id'));
    const reactions = await d1Query(() =>
      c.env.DB.prepare('SELECT emoji, COUNT(*) as count FROM reactions WHERE message_id = ? GROUP BY emoji')
        .bind(message_id).all()
    );
    return c.json(reactions.results);
  } catch {
    return c.json({ error: '리액션을 불러올 수 없습니다' }, 500);
  }
});

// 자동 대화 트리거
chat.post('/auto-chat', async (c) => {
  const body = await c.req.json<{ channel_id?: string }>().catch(() => ({}) as { channel_id?: string });
  const channelId = body.channel_id || 'ch-general';
  const id = c.env.CHAT_ROOM.idFromName(`lirkai-${channelId}`);
  const obj = c.env.CHAT_ROOM.get(id);
  return obj.fetch(new Request(c.req.raw.url, {
    method: 'POST',
    headers: c.req.raw.headers,
    body: JSON.stringify({ action: 'auto-chat' }),
  }));
});

export { chat, d1Query };
