// D1 CRUD helpers for Extreme Detail Mode tables

// ── Tax Profile ──

export async function getTaxProfile(db, userId) {
  return db.prepare(
    'SELECT * FROM user_tax_profiles WHERE user_id = ? ORDER BY created_at LIMIT 1'
  ).bind(userId).first();
}

export async function upsertTaxProfile(db, userId, profile) {
  // MATH AUDIT FIX: merge with existing profile so partial updates don't zero omitted fields
  var existing = await getTaxProfile(db, userId) || {};
  var merged = {
    profile_name: profile.profile_name !== undefined ? profile.profile_name : (existing.profile_name || 'Default'),
    federal_rate: profile.federal_rate !== undefined ? profile.federal_rate : (existing.federal_rate || 0),
    state_rate: profile.state_rate !== undefined ? profile.state_rate : (existing.state_rate || 0),
    local_rate: profile.local_rate !== undefined ? profile.local_rate : (existing.local_rate || 0),
    qualified_rate: profile.qualified_rate !== undefined ? profile.qualified_rate : (existing.qualified_rate || 0),
    ordinary_rate: profile.ordinary_rate !== undefined ? profile.ordinary_rate : (existing.ordinary_rate || 0),
    reit_rate: profile.reit_rate !== undefined ? profile.reit_rate : (existing.reit_rate || 0),
    ltcg_rate: profile.ltcg_rate !== undefined ? profile.ltcg_rate : (existing.ltcg_rate || 0),
    stcg_rate: profile.stcg_rate !== undefined ? profile.stcg_rate : (existing.stcg_rate || 0),
    filing_status: profile.filing_status !== undefined ? profile.filing_status : (existing.filing_status || 'single'),
    country: profile.country !== undefined ? profile.country : (existing.country || 'US'),
    state_code: profile.state_code !== undefined ? profile.state_code : (existing.state_code || null),
  };

  await db.prepare(
    `INSERT INTO user_tax_profiles (id, user_id, profile_name, federal_rate, state_rate, local_rate, qualified_rate, ordinary_rate, reit_rate, ltcg_rate, stcg_rate, filing_status, country, state_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, profile_name) DO UPDATE SET
       federal_rate = excluded.federal_rate,
       state_rate = excluded.state_rate,
       local_rate = excluded.local_rate,
       qualified_rate = excluded.qualified_rate,
       ordinary_rate = excluded.ordinary_rate,
       reit_rate = excluded.reit_rate,
       ltcg_rate = excluded.ltcg_rate,
       stcg_rate = excluded.stcg_rate,
       filing_status = excluded.filing_status,
       country = excluded.country,
       state_code = excluded.state_code,
       updated_at = datetime('now')`
  ).bind(
    crypto.randomUUID().replace(/-/g, ''),
    userId,
    merged.profile_name,
    merged.federal_rate,
    merged.state_rate,
    merged.local_rate,
    merged.qualified_rate,
    merged.ordinary_rate,
    merged.reit_rate,
    merged.ltcg_rate,
    merged.stcg_rate,
    merged.filing_status,
    merged.country,
    merged.state_code
  ).run();
  return getTaxProfile(db, userId);
}

export async function deleteTaxProfile(db, userId) {
  await db.prepare('DELETE FROM user_tax_profiles WHERE user_id = ?').bind(userId).run();
}

// ── CSV Imports ──

export async function saveCSVImport(db, userId, record) {
  var id = crypto.randomUUID().replace(/-/g, '');
  await db.prepare(
    'INSERT INTO csv_imports (id, user_id, filename, row_count, success_count, error_count, errors, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id, userId, record.filename || 'upload.csv',
    record.row_count || 0, record.success_count || 0,
    record.error_count || 0, JSON.stringify(record.errors || []),
    record.status || 'completed'
  ).run();
  return id;
}

export async function getCSVImports(db, userId, limit) {
  limit = Math.min(limit || 20, 100);
  const { results } = await db.prepare(
    'SELECT * FROM csv_imports WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).bind(userId, limit).all();
  return results || [];
}

// ── Dividend Reconciliation ──

export async function getReconciliation(db, userId, filters) {
  var sql = 'SELECT * FROM dividend_reconciliation WHERE user_id = ?';
  var params = [userId];

  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.from) {
    sql += ' AND ex_date >= ?';
    params.push(filters.from);
  }
  if (filters.to) {
    sql += ' AND ex_date <= ?';
    params.push(filters.to);
  }
  if (filters.ticker) {
    sql += ' AND ticker = ?';
    params.push(filters.ticker);
  }

  sql += ' ORDER BY ex_date DESC LIMIT ?';
  params.push(Math.min(filters.limit || 200, 500));

  const { results } = await db.prepare(sql).bind(...params).all();
  return results || [];
}

export async function getReconciliationById(db, userId, id) {
  return db.prepare(
    'SELECT * FROM dividend_reconciliation WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first();
}

export async function saveReconciliationBatch(db, userId, records) {
  if (!records || records.length === 0) return;
  var stmts = records.map(function(r) {
    return db.prepare(
      `INSERT INTO dividend_reconciliation (id, user_id, holding_id, ticker, ex_date, payment_date, expected_amount, expected_total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
       ON CONFLICT DO NOTHING`
    ).bind(
      crypto.randomUUID().replace(/-/g, ''),
      userId, r.holding_id || '', r.ticker,
      r.ex_date, r.payment_date || null,
      r.expected_amount || 0, r.expected_total || 0
    );
  });
  for (var i = 0; i < stmts.length; i += 80) {
    await db.batch(stmts.slice(i, i + 80));
  }
}

export async function confirmReconciliation(db, userId, id, actualAmount, actualTotal, notes) {
  var row = await getReconciliationById(db, userId, id);
  if (!row) return null;

  var variancePct = null;
  var status = 'confirmed';
  if (row.expected_total && row.expected_total > 0 && actualTotal !== null) {
    variancePct = ((actualTotal - row.expected_total) / row.expected_total) * 100;
    variancePct = Math.round(variancePct * 100) / 100;
    if (Math.abs(variancePct) > 2) status = 'variance';
  }

  await db.prepare(
    `UPDATE dividend_reconciliation SET
       actual_amount = ?, actual_total = ?, variance_pct = ?,
       status = ?, confirmed_at = datetime('now'), notes = ?,
       updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`
  ).bind(
    actualAmount, actualTotal, variancePct, status,
    notes || null, id, userId
  ).run();

  return getReconciliationById(db, userId, id);
}
