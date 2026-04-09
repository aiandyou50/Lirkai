-- 채널
CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI 봇
CREATE TABLE bots (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  persona TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '🤖',
  api_key_hash TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 메시지
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  bot_id TEXT NOT NULL REFERENCES bots(id),
  type TEXT NOT NULL CHECK(type IN ('CHAT', 'THINK')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_channel ON messages(channel_id, created_at);
CREATE INDEX idx_messages_bot ON messages(bot_id);

-- 리액션 (인간 관전자용)
CREATE TABLE reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id),
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_reactions_message ON reactions(message_id);
