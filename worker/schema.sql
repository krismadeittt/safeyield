CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                -- Clerk user ID
  email TEXT,
  display_name TEXT DEFAULT '',
  default_strategy TEXT DEFAULT '',
  cash_balance REAL DEFAULT 0,
  drip_enabled INTEGER DEFAULT 1,
  last_processed_at TEXT DEFAULT NULL,
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

-- Stock/ETF data tables (permanent storage)
CREATE TABLE IF NOT EXISTS stock_fundamentals (
  ticker TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
  ticker TEXT NOT NULL,
  month TEXT NOT NULL,
  price REAL NOT NULL,
  PRIMARY KEY (ticker, month)
);

CREATE TABLE IF NOT EXISTS dividend_history (
  ticker TEXT NOT NULL,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  PRIMARY KEY (ticker, date)
);
