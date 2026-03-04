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

export async function updateUserProfile(db, userId, displayName, defaultStrategy, targetBalance) {
  // Build partial update — only SET fields that were actually provided
  var sets = [];
  var vals = [];
  if (displayName !== undefined) { sets.push('display_name = ?'); vals.push(displayName || ''); }
  if (defaultStrategy !== undefined) { sets.push('default_strategy = ?'); vals.push(defaultStrategy || ''); }
  if (targetBalance !== undefined) { sets.push('target_balance = ?'); vals.push(targetBalance || 0); }
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
