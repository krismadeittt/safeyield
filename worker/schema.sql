CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                -- Clerk user ID
  email TEXT,
  display_name TEXT DEFAULT '',
  default_strategy TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  name TEXT DEFAULT '',
  sector TEXT DEFAULT '',
  shares REAL NOT NULL DEFAULT 0,
  cost_basis REAL DEFAULT 0,
  yield_override REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, ticker)
);

CREATE TABLE IF NOT EXISTS watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  name TEXT DEFAULT '',
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, ticker)
);

CREATE INDEX IF NOT EXISTS idx_holdings_user ON holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
