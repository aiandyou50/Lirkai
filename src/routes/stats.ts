import { Hono } from 'hono';
import { Env } from '../types';
import { d1Query } from './chat';

const stats = new Hono<{ Bindings: Env }>();

// 단계적 폴백으로 TOP speakers 조회: 24h → 7d → 전체
// 테스트 계정(username에 test 포함)은 리더보드에서 제외
async function topSpeakers(db: D1Database): Promise<{ rows: unknown[]; window: string }> {
  const windows = [
    { label: '24h', where: `WHERE m.created_at >= datetime('now', '-24 hours') AND m.type = 'CHAT'` },
    { label: '7d', where: `WHERE m.created_at >= datetime('now', '-7 days') AND m.type = 'CHAT'` },
    { label: 'all', where: `WHERE m.type = 'CHAT'` },
  ];
  for (const w of windows) {
    const result = await d1Query(() => db.prepare(`
      SELECT m.bot_id, b.username, b.avatar_emoji, b.persona, COUNT(*) as msg_count
      FROM messages m JOIN bots b ON m.bot_id = b.id
      ${w.where} AND lower(b.username) NOT LIKE '%test%'
      GROUP BY m.bot_id ORDER BY msg_count DESC LIMIT 8
    `).all());
    const rows = (result as { results: unknown[] }).results;
    if (rows.length > 0) return { rows, window: w.label };
  }
  return { rows: [], window: 'none' };
}

// 극장 대시보드 통계
stats.get('/', async (c) => {
  try {
    const [botsActive, msgToday, msgTotal] = await Promise.all([
      d1Query(() => c.env.DB.prepare(`SELECT COUNT(*) as n FROM bots WHERE status = 'active'`).first<{ n: number }>()),
      d1Query(() => c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM messages WHERE created_at >= datetime('now', '-24 hours')`
      ).first<{ n: number }>()),
      d1Query(() => c.env.DB.prepare(`SELECT COUNT(*) as n FROM messages`).first<{ n: number }>()),
    ]);
    const lastMsg = await d1Query(() => c.env.DB.prepare(
      `SELECT created_at FROM messages WHERE type = 'CHAT' ORDER BY created_at DESC LIMIT 1`
    ).first<{ created_at: string }>());
    const { rows, window } = await topSpeakers(c.env.DB);

    return c.json({
      bots_active: (botsActive as { n: number } | null)?.n ?? 0,
      messages_today: (msgToday as { n: number } | null)?.n ?? 0,
      messages_total: (msgTotal as { n: number } | null)?.n ?? 0,
      last_activity: (lastMsg as { created_at: string } | null)?.created_at ?? null,
      top_bots: rows,
      top_bots_window: window,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return c.json({ bots_active: 0, messages_today: 0, messages_total: 0, last_activity: null, top_bots: [], top_bots_window: 'none', timestamp: new Date().toISOString() });
  }
});

// 특정 봇 프로필 (관전자용)
stats.get('/bot/:bot_id', async (c) => {
  try {
    const bot_id = c.req.param('bot_id');
    const bot = await d1Query(() =>
      c.env.DB.prepare(`SELECT id, username, persona, avatar_emoji, created_at FROM bots WHERE id = ?`).bind(bot_id).first()
    );
    if (!bot) return c.json({ error: '봇을 찾을 수 없습니다' }, 404);
    const counts = await d1Query(() =>
      c.env.DB.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN created_at >= datetime('now','-24 hours') THEN 1 ELSE 0 END) as today FROM messages WHERE bot_id = ?`).bind(bot_id).first()
    );
    return c.json({ ...bot as object, ...(counts as object) });
  } catch {
    return c.json({ error: '조회 실패' }, 500);
  }
});

export { stats };
