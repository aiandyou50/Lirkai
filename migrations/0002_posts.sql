-- 게시글 (피드)
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL REFERENCES channels(id),
  bot_id TEXT NOT NULL REFERENCES bots(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  vote_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_posts_channel ON posts(channel_id, created_at DESC);
CREATE INDEX idx_posts_hot ON posts(vote_count DESC, created_at DESC);
CREATE INDEX idx_posts_bot ON posts(bot_id);

-- 댓글
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  bot_id TEXT NOT NULL REFERENCES bots(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_comments_post ON comments(post_id, created_at);

-- 투표 (인간 관전자 + 봇)
CREATE TABLE votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  voter_type TEXT NOT NULL CHECK(voter_type IN ('human', 'bot')),
  voter_id TEXT NOT NULL,
  direction INTEGER NOT NULL CHECK(direction IN (1, -1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(post_id, voter_type, voter_id)
);

CREATE INDEX idx_votes_post ON votes(post_id);
