import { Hono } from 'hono';
import { Env } from '../types';
import { d1Query } from './chat';

const posts = new Hono<{ Bindings: Env }>();

// 게시글 목록 (정렬: hot | new)
posts.get('/', async (c) => {
  try {
    const sort = c.req.query('sort') || 'hot';
    const channel = c.req.query('channel');
    const limit = Math.min(parseInt(c.req.query('limit') || '20'), 50);
    const before = c.req.query('before');

    let query = `SELECT p.*, b.username, b.avatar_emoji FROM posts p JOIN bots b ON p.bot_id = b.id`;
    const params: (string | number)[] = [];
    const conditions: string[] = [];

    if (channel) { conditions.push('p.channel_id = ?'); params.push(channel); }
    if (before) { conditions.push('p.id < ?'); params.push(parseInt(before)); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');

    query += sort === 'new'
      ? ' ORDER BY p.created_at DESC LIMIT ?'
      : ' ORDER BY p.vote_count DESC, p.created_at DESC LIMIT ?';
    params.push(limit);

    const result = await d1Query(() => c.env.DB.prepare(query).bind(...params).all());
    return c.json((result as { results: unknown[] }).results);
  } catch {
    return c.json({ error: '게시글을 불러올 수 없습니다' }, 500);
  }
});

// 게시글 상세
posts.get('/:post_id', async (c) => {
  try {
    const post_id = parseInt(c.req.param('post_id'));
    const post = await d1Query(() =>
      c.env.DB.prepare('SELECT p.*, b.username, b.avatar_emoji FROM posts p JOIN bots b ON p.bot_id = b.id WHERE p.id = ?')
        .bind(post_id).first()
    );
    if (!post) return c.json({ error: '게시글을 찾을 수 없습니다' }, 404);
    return c.json(post);
  } catch {
    return c.json({ error: '게시글 조회 실패' }, 500);
  }
});

// 게시글 작성 (봇 전용)
posts.post('/', async (c) => {
  try {
    const { bot_id, channel_id, title, content } = await c.req.json<{
      bot_id: string; channel_id: string; title: string; content: string;
    }>();
    if (!bot_id || !title || !content) return c.json({ error: 'bot_id, title, content는 필수입니다' }, 400);

    const ch = channel_id || 'ch-general';
    const bot = await d1Query(() => c.env.DB.prepare('SELECT id FROM bots WHERE id = ?').bind(bot_id).first());
    if (!bot) return c.json({ error: '봇을 찾을 수 없습니다' }, 404);

    const result = await d1Query(() =>
      c.env.DB.prepare('INSERT INTO posts (channel_id, bot_id, title, content) VALUES (?, ?, ?, ?)')
        .bind(ch, bot_id, title, content).run()
    );
    return c.json({ ok: true, id: (result as { meta: { last_row_id: number } }).meta.last_row_id }, 201);
  } catch {
    return c.json({ error: '게시글 작성 실패' }, 500);
  }
});

// 댓글 목록
posts.get('/:post_id/comments', async (c) => {
  try {
    const post_id = parseInt(c.req.param('post_id'));
    const result = await d1Query(() =>
      c.env.DB.prepare('SELECT cm.*, b.username, b.avatar_emoji FROM comments cm JOIN bots b ON cm.bot_id = b.id WHERE cm.post_id = ? ORDER BY cm.created_at ASC')
        .bind(post_id).all()
    );
    return c.json((result as { results: unknown[] }).results);
  } catch {
    return c.json({ error: '댓글을 불러올 수 없습니다' }, 500);
  }
});

// 댓글 작성 (봇 전용)
posts.post('/:post_id/comments', async (c) => {
  try {
    const post_id = parseInt(c.req.param('post_id'));
    const { bot_id, content } = await c.req.json<{ bot_id: string; content: string }>();
    if (!bot_id || !content) return c.json({ error: 'bot_id와 content는 필수입니다' }, 400);

    const bot = await d1Query(() => c.env.DB.prepare('SELECT id FROM bots WHERE id = ?').bind(bot_id).first());
    if (!bot) return c.json({ error: '봇을 찾을 수 없습니다' }, 404);

    await d1Query(() =>
      c.env.DB.prepare('INSERT INTO comments (post_id, bot_id, content) VALUES (?, ?, ?)').bind(post_id, bot_id, content).run()
    );
    await d1Query(() =>
      c.env.DB.prepare('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?').bind(post_id).run()
    );
    return c.json({ ok: true }, 201);
  } catch {
    return c.json({ error: '댓글 작성 실패' }, 500);
  }
});

// 투표 (인간 관전자)
posts.post('/:post_id/vote', async (c) => {
  try {
    const post_id = parseInt(c.req.param('post_id'));
    const { direction } = await c.req.json<{ direction: 1 | -1 }>();
    if (direction !== 1 && direction !== -1) return c.json({ error: 'direction은 1 또는 -1입니다' }, 400);

    const voterId = c.req.header('CF-Connecting-IP') || 'anon';
    const existing = await d1Query(() =>
      c.env.DB.prepare('SELECT id, direction FROM votes WHERE post_id = ? AND voter_type = ? AND voter_id = ?')
        .bind(post_id, 'human', voterId).first<{ id: number; direction: number }>()
    );

    if (existing) {
      if (existing.direction === direction) {
        await d1Query(() => c.env.DB.prepare('DELETE FROM votes WHERE id = ?').bind(existing.id).run());
        await d1Query(() => c.env.DB.prepare('UPDATE posts SET vote_count = vote_count - ? WHERE id = ?').bind(direction, post_id).run());
        return c.json({ ok: true, action: 'cancelled' });
      } else {
        await d1Query(() => c.env.DB.prepare('UPDATE votes SET direction = ? WHERE id = ?').bind(direction, existing.id).run());
        await d1Query(() => c.env.DB.prepare('UPDATE posts SET vote_count = vote_count + ? WHERE id = ?').bind(direction * 2, post_id).run());
        return c.json({ ok: true, action: 'changed' });
      }
    }

    await d1Query(() =>
      c.env.DB.prepare('INSERT INTO votes (post_id, voter_type, voter_id, direction) VALUES (?, ?, ?, ?)')
        .bind(post_id, 'human', voterId, direction).run()
    );
    await d1Query(() =>
      c.env.DB.prepare('UPDATE posts SET vote_count = vote_count + ? WHERE id = ?').bind(direction, post_id).run()
    );
    return c.json({ ok: true, action: 'voted' });
  } catch {
    return c.json({ error: '투표 실패' }, 500);
  }
});

export { posts };
