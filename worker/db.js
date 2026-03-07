// D1 CRUD helpers for users, holdings, and watchlist

export async function getOrCreateUser(db, userId, email) {
  let user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) {
    await db.prepare(
      'INSERT INTO users (id, email) VALUES (?, ?)'
    ).bind(userId, email || '').run();
    user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  }
  return user;
}

export async function updateUserProfile(db, userId, { displayName, defaultStrategy, targetBalance, cashBalance, dripEnabled, lastProcessedAt, vizType, cashApy, cashCompounding, retirementMode } = {}) {
  // Build partial update — only SET fields that were actually provided
  var sets = [];
  var vals = [];
  if (displayName !== undefined) { sets.push('display_name = ?'); vals.push(displayName || ''); }
  if (defaultStrategy !== undefined) { sets.push('default_strategy = ?'); vals.push(defaultStrategy || ''); }
  if (targetBalance !== undefined) { sets.push('target_balance = ?'); vals.push(targetBalance || 0); }
  if (cashBalance !== undefined) { sets.push('cash_balance = ?'); vals.push(cashBalance || 0); }
  if (dripEnabled !== undefined) { sets.push('drip_enabled = ?'); vals.push(dripEnabled ? 1 : 0); }
  if (lastProcessedAt !== undefined) { sets.push('last_processed_at = ?'); vals.push(lastProcessedAt); }
  if (vizType !== undefined) { sets.push('viz_type = ?'); vals.push(vizType); }
  if (cashApy !== undefined) { sets.push('cash_apy = ?'); vals.push(cashApy || 0); }
  if (cashCompounding !== undefined) { sets.push('cash_compounding = ?'); vals.push(cashCompounding || 'none'); }
  if (retirementMode !== undefined) { sets.push('retirement_mode = ?'); vals.push(retirementMode); }
  if (sets.length === 0) {
    return db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  }
  sets.push("updated_at = datetime('now')");
  vals.push(userId);
  await db.prepare('UPDATE users SET ' + sets.join(', ') + ' WHERE id = ?').bind(...vals).run();
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
}

export async function getHoldings(db, userId) {
  const { results } = await db.prepare(
    'SELECT ticker, name, sector, shares, cost_basis, yield_override FROM holdings WHERE user_id = ? ORDER BY created_at'
  ).bind(userId).all();
  return results || [];
}

export async function saveHoldings(db, userId, holdings) {
  // Batch delete + insert (full sync)
  const stmts = [
    db.prepare('DELETE FROM holdings WHERE user_id = ?').bind(userId),
  ];
  for (const h of holdings) {
    stmts.push(
      db.prepare(
        'INSERT INTO holdings (user_id, ticker, name, sector, shares, cost_basis, yield_override) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(userId, h.ticker, h.name || '', h.sector || '', h.shares || 0, h.cost_basis || 0, h.yield_override ?? null)
    );
  }
  await db.batch(stmts);
}

export async function upsertHolding(db, userId, holding) {
  await db.prepare(
    `INSERT INTO holdings (user_id, ticker, name, sector, shares, cost_basis, yield_override)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, ticker) DO UPDATE SET
       name = excluded.name,
       sector = excluded.sector,
       shares = excluded.shares,
       cost_basis = excluded.cost_basis,
       yield_override = excluded.yield_override,
       updated_at = datetime('now')`
  ).bind(
    userId, holding.ticker, holding.name || '', holding.sector || '',
    holding.shares || 0, holding.cost_basis || 0, holding.yield_override ?? null
  ).run();
}

export async function deleteHolding(db, userId, ticker) {
  await db.prepare(
    'DELETE FROM holdings WHERE user_id = ? AND ticker = ?'
  ).bind(userId, ticker).run();
}

export async function saveProcessedState(db, userId, holdings, cashBalance, lastProcessedAt) {
  const stmts = [
    db.prepare("UPDATE users SET cash_balance = ?, last_processed_at = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(cashBalance || 0, lastProcessedAt, userId),
  ];
  for (const h of holdings) {
    stmts.push(
      db.prepare("UPDATE holdings SET shares = ?, cost_basis = ?, updated_at = datetime('now') WHERE user_id = ? AND ticker = ?")
        .bind(h.shares || 0, h.cost_basis || 0, userId, h.ticker)
    );
  }
  await db.batch(stmts);
}

export async function getWatchlist(db, userId) {
  const { results } = await db.prepare(
    'SELECT ticker, name, added_at FROM watchlist WHERE user_id = ? ORDER BY added_at DESC'
  ).bind(userId).all();
  return results || [];
}

export async function addToWatchlist(db, userId, ticker, name) {
  await db.prepare(
    `INSERT INTO watchlist (user_id, ticker, name) VALUES (?, ?, ?)
     ON CONFLICT(user_id, ticker) DO NOTHING`
  ).bind(userId, ticker, name || '').run();
}

export async function removeFromWatchlist(db, userId, ticker) {
  await db.prepare(
    'DELETE FROM watchlist WHERE user_id = ? AND ticker = ?'
  ).bind(userId, ticker).run();
}

// ── Stock data helpers (D1 permanent storage) ──

export async function getFundamentals(db, ticker, maxAgeDays) {
  maxAgeDays = maxAgeDays || 7;
  const row = await db.prepare(
    'SELECT data, updated_at FROM stock_fundamentals WHERE ticker = ?'
  ).bind(ticker).first();
  if (!row) return null;
  // Check freshness
  const age = (Date.now() - new Date(row.updated_at).getTime()) / 86400000;
  if (age > maxAgeDays) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

export async function saveFundamentals(db, ticker, data) {
  const json = JSON.stringify(data);
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT OR REPLACE INTO stock_fundamentals (ticker, data, updated_at) VALUES (?, ?, ?)'
  ).bind(ticker, json, now).run();
}

export async function getPriceHistory(db, ticker) {
  const { results } = await db.prepare(
    'SELECT month, price FROM price_history WHERE ticker = ? ORDER BY month'
  ).bind(ticker).all();
  return results || [];
}

export async function savePriceHistory(db, ticker, prices) {
  // prices = [{month: "2024-01", price: 185.5}, ...]
  if (!prices || prices.length === 0) return;
  const stmts = prices.map(p =>
    db.prepare(
      'INSERT OR REPLACE INTO price_history (ticker, month, price) VALUES (?, ?, ?)'
    ).bind(ticker, p.month, p.price)
  );
  // D1 batch limit is ~100 statements, split if needed
  for (let i = 0; i < stmts.length; i += 80) {
    await db.batch(stmts.slice(i, i + 80));
  }
}

export async function getDividendHistory(db, ticker) {
  const { results } = await db.prepare(
    'SELECT date, amount FROM dividend_history WHERE ticker = ? ORDER BY date'
  ).bind(ticker).all();
  return results || [];
}

export async function saveDividendHistory(db, ticker, dividends) {
  // dividends = [{date: "2024-01-15", amount: 0.24}, ...]
  if (!dividends || dividends.length === 0) return;
  const stmts = dividends.map(d =>
    db.prepare(
      'INSERT OR IGNORE INTO dividend_history (ticker, date, amount) VALUES (?, ?, ?)'
    ).bind(ticker, d.date, d.amount)
  );
  for (let i = 0; i < stmts.length; i += 80) {
    await db.batch(stmts.slice(i, i + 80));
  }
}

export async function getLatestPriceMonth(db, ticker) {
  const row = await db.prepare(
    'SELECT MAX(month) as latest FROM price_history WHERE ticker = ?'
  ).bind(ticker).first();
  return row ? row.latest : null;
}

export async function getLatestDividendDate(db, ticker) {
  const row = await db.prepare(
    'SELECT MAX(date) as latest FROM dividend_history WHERE ticker = ?'
  ).bind(ticker).first();
  return row ? row.latest : null;
}

// ── Portfolio snapshot helpers ──

export async function getSnapshots(db, userId, from, to, limit) {
  limit = Math.min(limit || 2000, 2000);
  const { results } = await db.prepare(
    'SELECT date, total_value, cash_value, holdings_value, total_div_income, holdings_snapshot FROM portfolio_snapshots WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC LIMIT ?'
  ).bind(userId, from, to, limit).all();
  return results || [];
}

export async function getLatestSnapshot(db, userId) {
  return db.prepare(
    'SELECT date, total_value, cash_value, holdings_value, total_div_income, holdings_snapshot FROM portfolio_snapshots WHERE user_id = ? ORDER BY date DESC LIMIT 1'
  ).bind(userId).first();
}

export async function saveSnapshots(db, userId, snapshots) {
  if (!snapshots || snapshots.length === 0) return;
  const stmts = snapshots.map(s =>
    db.prepare(
      'INSERT OR REPLACE INTO portfolio_snapshots (user_id, date, total_value, cash_value, holdings_value, total_div_income, holdings_snapshot) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      userId, s.date, s.total_value || 0, s.cash_value || 0,
      s.holdings_value || 0, s.total_div_income || 0,
      typeof s.holdings_snapshot === 'string' ? s.holdings_snapshot : JSON.stringify(s.holdings_snapshot)
    )
  );
  for (let i = 0; i < stmts.length; i += 80) {
    await db.batch(stmts.slice(i, i + 80));
  }
}

export async function deleteSnapshots(db, userId) {
  await db.prepare('DELETE FROM portfolio_snapshots WHERE user_id = ?').bind(userId).run();
}

// ── Daily price cache helpers ──

export async function getDailyPrices(db, tickers, from, to) {
  if (!tickers?.length) return [];
  // Build query for multiple tickers
  const placeholders = tickers.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT ticker, date, close, adj_close FROM daily_prices WHERE ticker IN (${placeholders}) AND date >= ? AND date <= ? ORDER BY ticker, date`
  ).bind(...tickers, from, to).all();
  return results || [];
}

export async function saveDailyPrices(db, prices) {
  if (!prices || prices.length === 0) return;
  const stmts = prices.map(p =>
    db.prepare(
      'INSERT OR REPLACE INTO daily_prices (ticker, date, close, adj_close) VALUES (?, ?, ?, ?)'
    ).bind(p.ticker, p.date, p.close, p.adj_close ?? null)
  );
  for (let i = 0; i < stmts.length; i += 80) {
    await db.batch(stmts.slice(i, i + 80));
  }
}

export async function getCachedPriceDates(db, tickers, from, to) {
  if (!tickers?.length) return new Set();
  const placeholders = tickers.map(() => '?').join(',');
  const { results } = await db.prepare(
    `SELECT DISTINCT ticker || ':' || date as key FROM daily_prices WHERE ticker IN (${placeholders}) AND date >= ? AND date <= ?`
  ).bind(...tickers, from, to).all();
  return new Set((results || []).map(r => r.key));
}

export async function getAllUsersWithHoldings(db) {
  const { results } = await db.prepare(
    'SELECT DISTINCT h.user_id, u.cash_balance FROM holdings h JOIN users u ON h.user_id = u.id'
  ).all();
  return results || [];
}

export async function getAllHoldingsGrouped(db) {
  const { results } = await db.prepare(
    'SELECT user_id, ticker, shares FROM holdings ORDER BY user_id'
  ).all();
  const grouped = {};
  for (const r of (results || [])) {
    if (!grouped[r.user_id]) grouped[r.user_id] = [];
    grouped[r.user_id].push({ ticker: r.ticker, shares: r.shares });
  }
  return grouped;
}

// ── Retirement plan helpers ──

export async function getRetirementPlan(db, userId) {
  return db.prepare(
    'SELECT * FROM retirement_plans WHERE user_id = ?'
  ).bind(userId).first();
}

export async function upsertRetirementPlan(db, userId, plan) {
  await db.prepare(
    `INSERT INTO retirement_plans (user_id, date_of_birth, retirement_date, life_expectancy_age, monthly_income_needed)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       date_of_birth = excluded.date_of_birth,
       retirement_date = excluded.retirement_date,
       life_expectancy_age = excluded.life_expectancy_age,
       monthly_income_needed = excluded.monthly_income_needed,
       updated_at = datetime('now')`
  ).bind(
    userId,
    plan.date_of_birth,
    plan.retirement_date,
    plan.life_expectancy_age,
    plan.monthly_income_needed
  ).run();
  return getRetirementPlan(db, userId);
}

export async function deleteRetirementPlan(db, userId) {
  await db.prepare('DELETE FROM retirement_plans WHERE user_id = ?').bind(userId).run();
}
