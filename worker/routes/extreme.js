// Extreme Detail Mode route handlers
import {
  getTaxProfile, upsertTaxProfile, deleteTaxProfile,
  saveCSVImport, getCSVImports,
  getReconciliation, confirmReconciliation, saveReconciliationBatch,
} from '../db-extreme.js';
import { validateString, validateNumber, validateEnum, validateDate, validateTicker, sanitizeText } from '../validate.js';
import { logAudit } from '../audit.js';

function json(data, origin, status, cache) {
  status = status || 200;
  cache = cache || 0;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=" + cache + ", s-maxage=" + cache,
    },
  });
}

function errResp(msg, origin, status) {
  return json({ error: msg }, origin, status || 400, 0);
}

function getClientIP(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Real-IP') || null;
}

// Split a CSV line respecting quoted fields
function splitCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// Parse CSV text into rows with auto-detected columns
function parseCSV(text) {
  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
  if (lines.length < 2) return { headers: [], rows: [], format: null };

  var headers = splitCSVLine(lines[0]).map(function(h) { return h.toLowerCase().replace(/['"]/g, ''); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var vals = splitCSVLine(lines[i]);
    if (vals.length === headers.length) {
      var row = {};
      for (var j = 0; j < headers.length; j++) row[headers[j]] = vals[j];
      rows.push(row);
    }
  }

  // Detect format
  var format = null;
  var hSet = new Set(headers);
  if (hSet.has('action') || hSet.has('type')) format = 'transactions';
  else if (hSet.has('cost basis per share') || hSet.has('cost_basis') || hSet.has('account type') || hSet.has('account_type')) format = 'holdings';
  else if (hSet.has('amount') && hSet.has('date')) format = 'dividends';

  return { headers: headers, rows: rows, format: format };
}

// Find column by fuzzy matching
function findCol(headers, candidates) {
  for (var c = 0; c < candidates.length; c++) {
    for (var h = 0; h < headers.length; h++) {
      if (headers[h].includes(candidates[c])) return headers[h];
    }
  }
  return null;
}

export async function handleExtremeRoute(path, method, request, env, auth, origin) {
  var db = env.DB;
  var userId = auth.userId;
  var ip = getClientIP(request);

  // ── TAX PROFILE ──

  if (path === "/user/extreme/tax-profile" && method === "GET") {
    var profile = await getTaxProfile(db, userId);
    return json({ result: profile }, origin, 200, 0);
  }

  if (path === "/user/extreme/tax-profile" && method === "POST") {
    var body;
    try { body = await request.json(); } catch { return errResp("Invalid JSON body", origin, 400); }

    // Validate rates
    var rateFields = ['federal_rate', 'state_rate', 'local_rate', 'qualified_rate', 'ordinary_rate', 'reit_rate', 'ltcg_rate', 'stcg_rate'];
    for (var rf = 0; rf < rateFields.length; rf++) {
      var field = rateFields[rf];
      if (body[field] !== undefined) {
        var rv = validateNumber(body[field], field, { min: 0, max: 100 });
        if (!rv.valid) return errResp(rv.error, origin, 400);
        body[field] = rv.value;
      }
    }

    if (body.filing_status) {
      var fv = validateEnum(body.filing_status, 'filing_status', ['single', 'married_joint', 'married_separate', 'head_of_household']);
      if (!fv.valid) return errResp(fv.error, origin, 400);
    }

    if (body.state_code) {
      var sv = validateString(body.state_code, 'state_code', { maxLen: 5 });
      if (!sv.valid) return errResp(sv.error, origin, 400);
      body.state_code = sv.value;
    }

    var saved = await upsertTaxProfile(db, userId, body);
    await logAudit(db, userId, 'upsert', 'tax_profile', saved.id, ip);
    return json({ result: saved }, origin, 200, 0);
  }

  if (path === "/user/extreme/tax-profile" && method === "DELETE") {
    await deleteTaxProfile(db, userId);
    await logAudit(db, userId, 'delete', 'tax_profile', null, ip);
    return json({ ok: true }, origin, 200, 0);
  }

  // ── CSV UPLOAD ──

  if (path === "/user/extreme/csv/upload" && method === "POST") {
    var csvBody;
    try { csvBody = await request.json(); } catch { return errResp("Invalid JSON body", origin, 400); }

    if (!csvBody.content || typeof csvBody.content !== 'string') {
      return errResp("Missing CSV content", origin, 400);
    }

    // MATH AUDIT FIX: limit was 14MB but error said 10MB — align to 10MB
    if (csvBody.content.length > 10 * 1024 * 1024) {
      return errResp("File exceeds 10MB limit", origin, 400);
    }

    var filename = sanitizeText(csvBody.filename || 'upload.csv').substring(0, 200);
    var parsed = parseCSV(csvBody.content);

    if (parsed.rows.length === 0) {
      return errResp("CSV has no data rows", origin, 400);
    }
    if (parsed.rows.length > 10000) {
      return errResp("CSV exceeds 10,000 row limit", origin, 400);
    }

    // Process based on detected format
    var errors = [];
    var successCount = 0;
    var tickerCol = findCol(parsed.headers, ['ticker', 'symbol', 'code']);
    var dateCol = findCol(parsed.headers, ['date', 'ex_date', 'ex-date', 'payment_date', 'purchase_date', 'purchase date']);
    var amountCol = findCol(parsed.headers, ['amount', 'dividend', 'div']);
    var sharesCol = findCol(parsed.headers, ['shares', 'quantity', 'qty']);
    var priceCol = findCol(parsed.headers, ['price', 'cost basis per share', 'cost_basis', 'cost basis']);

    if (!tickerCol) {
      return errResp("Could not detect ticker/symbol column. Expected: ticker, symbol, or code", origin, 400);
    }

    var processedRows = [];
    for (var ri = 0; ri < parsed.rows.length; ri++) {
      var row = parsed.rows[ri];
      var ticker = (row[tickerCol] || '').toUpperCase().trim();
      var tv = validateTicker(ticker, 'ticker');
      if (!tv.valid) {
        errors.push({ row: ri + 2, message: 'Invalid ticker: ' + ticker });
        continue;
      }

      var processedRow = { ticker: tv.value, row_index: ri + 2 };

      if (dateCol && row[dateCol]) {
        var dateStr = row[dateCol].trim();
        // Handle MM/DD/YYYY format
        var mdyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mdyMatch) {
          dateStr = mdyMatch[3] + '-' + mdyMatch[1].padStart(2, '0') + '-' + mdyMatch[2].padStart(2, '0');
        }
        var dv = validateDate(dateStr, 'date');
        if (!dv.valid) {
          errors.push({ row: ri + 2, message: dv.error });
          continue;
        }
        processedRow.date = dv.value;
      }

      if (amountCol && row[amountCol]) {
        var amt = parseFloat(row[amountCol].replace(/[$,]/g, ''));
        if (isFinite(amt) && amt > 0) processedRow.amount = amt;
      }

      if (sharesCol && row[sharesCol]) {
        var sh = parseFloat(row[sharesCol].replace(/,/g, ''));
        if (isFinite(sh) && sh > 0) processedRow.shares = sh;
      }

      if (priceCol && row[priceCol]) {
        var pr = parseFloat(row[priceCol].replace(/[$,]/g, ''));
        if (isFinite(pr) && pr > 0) processedRow.price = pr;
      }

      processedRows.push(processedRow);
      successCount++;
    }

    // Save import record
    var importId = await saveCSVImport(db, userId, {
      filename: filename,
      row_count: parsed.rows.length,
      success_count: successCount,
      error_count: errors.length,
      errors: errors.slice(0, 50), // Cap error list
      status: errors.length === parsed.rows.length ? 'failed' : 'completed',
    });

    await logAudit(db, userId, 'csv_upload', 'csv_import', importId, ip);

    return json({
      result: {
        import_id: importId,
        format_detected: parsed.format,
        row_count: parsed.rows.length,
        success_count: successCount,
        error_count: errors.length,
        errors: errors.slice(0, 50),
        rows: processedRows,
      }
    }, origin, 200, 0);
  }

  if (path === "/user/extreme/csv/uploads" && method === "GET") {
    var reqUrl = new URL(request.url);
    var limit = parseInt(reqUrl.searchParams.get('limit') || '20', 10);
    var imports = await getCSVImports(db, userId, limit);
    return json({ result: imports }, origin, 200, 0);
  }

  // ── RECONCILIATION ──

  if (path === "/user/extreme/reconciliation" && method === "GET") {
    var rUrl = new URL(request.url);
    var filters = {
      status: rUrl.searchParams.get('status') || null,
      from: rUrl.searchParams.get('from') || null,
      to: rUrl.searchParams.get('to') || null,
      ticker: rUrl.searchParams.get('ticker') || null,
      limit: parseInt(rUrl.searchParams.get('limit') || '200', 10),
    };
    var records = await getReconciliation(db, userId, filters);
    return json({ result: records }, origin, 200, 0);
  }

  if (path === "/user/extreme/reconciliation/generate" && method === "POST") {
    var genBody;
    try { genBody = await request.json(); } catch { return errResp("Invalid JSON body", origin, 400); }

    // Expects { holdings: [{ticker, shares, holding_id}], dividends: [{ticker, ex_date, payment_date, amount}] }
    var holdings = genBody.holdings;
    var dividends = genBody.dividends;

    if (!Array.isArray(holdings) || !Array.isArray(dividends)) {
      return errResp("holdings and dividends arrays required", origin, 400);
    }

    var sharesMap = {};
    for (var hi = 0; hi < holdings.length; hi++) {
      sharesMap[holdings[hi].ticker] = { shares: holdings[hi].shares || 0, holding_id: holdings[hi].holding_id || '' };
    }

    var reconcRecords = [];
    for (var di = 0; di < dividends.length; di++) {
      var div = dividends[di];
      var t = (div.ticker || '').toUpperCase();
      if (!sharesMap[t]) continue;
      var holding = sharesMap[t];
      reconcRecords.push({
        holding_id: holding.holding_id,
        ticker: t,
        ex_date: div.ex_date,
        payment_date: div.payment_date || null,
        expected_amount: div.amount || 0,
        expected_total: (div.amount || 0) * (holding.shares || 0),
      });
    }

    if (reconcRecords.length > 0) {
      await saveReconciliationBatch(db, userId, reconcRecords);
      await logAudit(db, userId, 'generate', 'reconciliation', null, ip);
    }

    return json({ result: { generated: reconcRecords.length } }, origin, 200, 0);
  }

  // PATCH /user/extreme/reconciliation/:id/confirm
  var confirmMatch = path.match(/^\/user\/extreme\/reconciliation\/([^/]+)\/confirm$/);
  if (confirmMatch && method === "PATCH") {
    var recId = confirmMatch[1];
    var cBody;
    try { cBody = await request.json(); } catch { return errResp("Invalid JSON body", origin, 400); }

    if (cBody.actual_amount !== undefined) {
      var av = validateNumber(cBody.actual_amount, 'actual_amount', { min: 0, max: 1e9 });
      if (!av.valid) return errResp(av.error, origin, 400);
    }
    if (cBody.actual_total !== undefined) {
      var atv = validateNumber(cBody.actual_total, 'actual_total', { min: 0, max: 1e12 });
      if (!atv.valid) return errResp(atv.error, origin, 400);
    }

    // MATH AUDIT FIX: use validated values instead of raw cBody
    var updated = await confirmReconciliation(
      db, userId, recId,
      cBody.actual_amount !== undefined ? av.value : null,
      cBody.actual_total !== undefined ? atv.value : null,
      cBody.notes ? sanitizeText(cBody.notes) : null
    );
    if (!updated) return errResp("Record not found", origin, 404);

    await logAudit(db, userId, 'confirm', 'reconciliation', recId, ip);
    return json({ result: updated }, origin, 200, 0);
  }

  if (path === "/user/extreme/reconciliation/bulk-confirm" && method === "POST") {
    var bulkBody;
    try { bulkBody = await request.json(); } catch { return errResp("Invalid JSON body", origin, 400); }

    if (!Array.isArray(bulkBody.confirmations)) {
      return errResp("confirmations array required", origin, 400);
    }

    // MATH AUDIT FIX: validate bulk confirm amounts like single confirm
    var bulkResults = [];
    for (var bi = 0; bi < bulkBody.confirmations.length && bi < 500; bi++) {
      var c = bulkBody.confirmations[bi];
      if (!c.id) continue;
      var bulkAmt = null;
      var bulkTotal = null;
      if (c.actual_amount !== undefined) {
        var bav = validateNumber(c.actual_amount, 'actual_amount', { min: 0, max: 1e9 });
        if (!bav.valid) { bulkResults.push({ id: c.id, updated: false, error: bav.error }); continue; }
        bulkAmt = bav.value;
      }
      if (c.actual_total !== undefined) {
        var btv = validateNumber(c.actual_total, 'actual_total', { min: 0, max: 1e12 });
        if (!btv.valid) { bulkResults.push({ id: c.id, updated: false, error: btv.error }); continue; }
        bulkTotal = btv.value;
      }
      var result = await confirmReconciliation(
        db, userId, c.id,
        bulkAmt, bulkTotal,
        c.notes ? sanitizeText(c.notes) : null
      );
      bulkResults.push({ id: c.id, updated: !!result });
    }

    await logAudit(db, userId, 'bulk_confirm', 'reconciliation', null, ip);
    return json({ result: { confirmed: bulkResults.filter(function(r) { return r.updated; }).length, results: bulkResults } }, origin, 200, 0);
  }

  // Not matched
  return null;
}
