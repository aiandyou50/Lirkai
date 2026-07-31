import { Hono } from 'hono';
import { Env } from '../types';
import { d1Query } from './chat';

const bots = new Hono<{ Bindings: Env }>();

// SHA-256 해시
async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// 봇 목록
bots.get('/', async (c) => {
  try {
    const result = await d1Query(() =>
      c.env.DB.prepare('SELECT id, username, persona, avatar_emoji, status FROM bots WHERE status = ?').bind('active').all()
    );
    return c.json(result.results);
  } catch {
    return c.json({ error: '봇 목록을 불러올 수 없습니다' }, 500);
  }
});

// 봇 등록 (username claim + secret_key)
bots.post('/', async (c) => {
  try {
    const { username, persona, avatar_emoji, secret } = await c.req.json<{
      username: string; persona: string; avatar_emoji?: string; secret?: string;
    }>();
    if (!username || !persona) return c.json({ error: 'username과 persona는 필수입니다' }, 400);

    const id = `bot-${username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const secretHash = secret ? await sha256(secret) : '';

    const existing = await d1Query(() =>
      c.env.DB.prepare('SELECT id, api_key_hash FROM bots WHERE username = ?').bind(username).first<{ id: string; api_key_hash: string }>()
    );

    if (existing) {
      if (existing.api_key_hash && existing.api_key_hash !== 'hash') {
        if (!secret) {
          return c.json({ error: '이미 사용 중인 이름입니다', suggestion: `${username}_${Math.floor(Math.random() * 90 + 10)}`, message: 'secret 키가 필요합니다' }, 409);
        }
        if (secretHash !== existing.api_key_hash) {
          return c.json({ error: 'secret이 일치하지 않습니다', suggestion: `${username}_${Math.floor(Math.random() * 90 + 10)}` }, 403);
        }
        await d1Query(() =>
          c.env.DB.prepare('UPDATE bots SET persona = ?, avatar_emoji = ? WHERE id = ?').bind(persona, avatar_emoji || '🤖', existing.id).run()
        );
        return c.json({ id: existing.id, username, message: '봇 인증 성공' });
      } else {
        await d1Query(() =>
          c.env.DB.prepare('UPDATE bots SET api_key_hash = ?, persona = ?, avatar_emoji = ? WHERE id = ?').bind(secretHash || 'hash', persona, avatar_emoji || '🤖', existing.id).run()
        );
        return c.json({ id: existing.id, username, message: '봇이 업데이트되었습니다' });
      }
    }

    await d1Query(() =>
      c.env.DB.prepare('INSERT INTO bots (id, username, persona, avatar_emoji, api_key_hash) VALUES (?, ?, ?, ?, ?)')
        .bind(id, username, persona, avatar_emoji || '🤖', secretHash || 'hash').run()
    );
    return c.json({ id, username, message: '봇이 등록되었습니다' }, 201);
  } catch {
    return c.json({ error: '봇 등록에 실패했습니다' }, 500);
  }
});

export { bots };
