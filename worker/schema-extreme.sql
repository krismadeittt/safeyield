-- ============================================================
-- EXTREME DETAIL MODE TABLES
-- ============================================================

-- User tax profile for after-tax calculations
CREATE TABLE IF NOT EXISTS user_tax_profiles (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  profile_name TEXT NOT NULL DEFAULT 'Default',
  federal_rate REAL NOT NULL DEFAULT 0,
  state_rate REAL NOT NULL DEFAULT 0,
  local_rate REAL NOT NULL DEFAULT 0,
  qualified_rate REAL NOT NULL DEFAULT 0,
  ordinary_rate REAL NOT NULL DEFAULT 0,
  reit_rate REAL NOT NULL DEFAULT 0,
  ltcg_rate REAL NOT NULL DEFAULT 0,
  stcg_rate REAL NOT NULL DEFAULT 0,
  filing_status TEXT DEFAULT 'single',
  country TEXT NOT NULL DEFAULT 'US',
  state_code TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, profile_name)
);
CREATE INDEX IF NOT EXISTS idx_tax_profiles_user ON user_tax_profiles(user_id);

-- Dividend reconciliation: expected vs actual
CREATE TABLE IF NOT EXISTS dividend_reconciliation (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  holding_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  ex_date TEXT NOT NULL,
  payment_date TEXT,
  expected_amount REAL,
  expected_total REAL,
  actual_amount REAL DEFAULT NULL,
  actual_total REAL DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  variance_pct REAL DEFAULT NULL,
  confirmed_at TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_user ON dividend_reconciliation(user_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_status ON dividend_reconciliation(user_id, status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_date ON dividend_reconciliation(user_id, ex_date);

-- Dividend safety scoring and alerts
CREATE TABLE IF NOT EXISTS dividend_safety_scores (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  ticker TEXT NOT NULL,
  score INTEGER NOT NULL,
  grade TEXT NOT NULL,
  payout_ratio_earnings REAL,
  payout_ratio_fcf REAL,
  debt_to_equity REAL,
  interest_coverage REAL,
  consecutive_years_paid INTEGER,
  consecutive_years_grown INTEGER,
  fcf_trend TEXT,
  earnings_trend TEXT,
  revenue_trend TEXT,
  risk_factors TEXT DEFAULT '[]',
  last_cut_date TEXT DEFAULT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_safety_ticker ON dividend_safety_scores(ticker);

-- Safety alerts sent to users
CREATE TABLE IF NOT EXISTS safety_alerts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT DEFAULT '{}',
  read_at TEXT DEFAULT NULL,
  dismissed_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON safety_alerts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_alerts_unread ON safety_alerts(user_id, read_at);

-- Tax-loss harvesting candidates
CREATE TABLE IF NOT EXISTS tlh_candidates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  holding_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  purchase_date TEXT NOT NULL,
  purchase_price REAL NOT NULL,
  current_price REAL NOT NULL,
  shares REAL NOT NULL,
  unrealized_loss REAL NOT NULL,
  loss_pct REAL NOT NULL,
  holding_period_days INTEGER NOT NULL,
  is_short_term INTEGER NOT NULL DEFAULT 0,
  estimated_tax_savings REAL DEFAULT NULL,
  wash_sale_risk INTEGER NOT NULL DEFAULT 0,
  substitute_tickers TEXT DEFAULT '[]',
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tlh_user ON tlh_candidates(user_id);

-- International withholding tax treaties
CREATE TABLE IF NOT EXISTS withholding_treaties (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  source_country TEXT NOT NULL,
  investor_country TEXT NOT NULL,
  treaty_rate REAL NOT NULL,
  default_rate REAL NOT NULL,
  qualified_rate REAL DEFAULT NULL,
  reit_rate REAL DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  effective_date TEXT DEFAULT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_treaty_countries ON withholding_treaties(source_country, investor_country);

-- User's international holdings tax tracking
CREATE TABLE IF NOT EXISTS intl_tax_tracking (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  holding_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  source_country TEXT NOT NULL,
  gross_dividend REAL NOT NULL,
  withholding_amount REAL NOT NULL,
  withholding_rate REAL NOT NULL,
  treaty_rate REAL DEFAULT NULL,
  reclaimable_amount REAL DEFAULT 0,
  tax_year INTEGER NOT NULL,
  payment_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_intl_tax_user ON intl_tax_tracking(user_id, tax_year);

-- What-if scenarios
CREATE TABLE IF NOT EXISTS whatif_scenarios (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  scenario_type TEXT NOT NULL,
  parameters TEXT NOT NULL DEFAULT '{}',
  results TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_whatif_user ON whatif_scenarios(user_id);

-- FIRE planning goals
CREATE TABLE IF NOT EXISTS fire_goals (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  monthly_expenses REAL NOT NULL,
  target_monthly_income REAL NOT NULL,
  safety_margin_pct REAL NOT NULL DEFAULT 10,
  include_social_security INTEGER NOT NULL DEFAULT 0,
  social_security_amount REAL DEFAULT 0,
  social_security_start_age INTEGER DEFAULT 67,
  include_pension INTEGER NOT NULL DEFAULT 0,
  pension_amount REAL DEFAULT 0,
  inflation_rate REAL NOT NULL DEFAULT 3.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fire_user ON fire_goals(user_id);

-- REIT-specific data cache
CREATE TABLE IF NOT EXISTS reit_data (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  ticker TEXT NOT NULL,
  ffo_per_share REAL,
  affo_per_share REAL,
  ffo_payout_ratio REAL,
  affo_payout_ratio REAL,
  nav_per_share REAL,
  price_to_ffo REAL,
  price_to_affo REAL,
  price_to_nav REAL,
  distribution_ordinary_pct REAL DEFAULT 0,
  distribution_cap_gains_pct REAL DEFAULT 0,
  distribution_roc_pct REAL DEFAULT 0,
  qbi_eligible INTEGER DEFAULT 0,
  sector TEXT DEFAULT NULL,
  property_count INTEGER DEFAULT NULL,
  occupancy_rate REAL DEFAULT NULL,
  computed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reit_ticker ON reit_data(ticker);

-- CSV import tracking
CREATE TABLE IF NOT EXISTS csv_imports (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_csv_user ON csv_imports(user_id);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT DEFAULT NULL,
  ip_address TEXT DEFAULT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, timestamp);
