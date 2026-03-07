/**
 * CSV Parser for SafeYield
 * Supports 3 formats:
 *   A) Brokerage Transaction Export (Date, Action, Ticker, Shares, Price, Amount, Fees, Account)
 *   B) Simple Holdings (Ticker, Shares, Cost Basis Per Share, Account Type, Purchase Date)
 *   C) Dividend History (Date, Ticker, Amount, Type)
 */

const COLUMN_ALIASES = {
  ticker: ['ticker', 'symbol', 'code', 'stock'],
  date: ['date', 'ex_date', 'ex-date', 'payment_date', 'purchase_date', 'purchase date', 'trade date', 'trade_date'],
  amount: ['amount', 'dividend', 'div', 'total', 'net amount', 'net_amount'],
  shares: ['shares', 'quantity', 'qty', 'units'],
  price: ['price', 'cost basis per share', 'cost_basis', 'cost basis', 'unit price', 'unit_price', 'avg price', 'avg_price'],
  action: ['action', 'transaction type', 'transaction_type', 'activity'],
  account: ['account', 'account type', 'account_type'],
  fees: ['fees', 'commission', 'fee'],
};

function findColumn(headers, fieldName) {
  var aliases = COLUMN_ALIASES[fieldName] || [fieldName];
  for (var a = 0; a < aliases.length; a++) {
    for (var h = 0; h < headers.length; h++) {
      if (headers[h] === aliases[a]) return headers[h];
    }
  }
  return null;
}

function parseCSVLine(line) {
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

function normalizeDate(val) {
  if (!val) return null;
  val = val.trim();
  var month, day, year;
  // MM/DD/YYYY
  var mdy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) { month = parseInt(mdy[1], 10); day = parseInt(mdy[2], 10); year = mdy[3]; }
  // YYYY-MM-DD
  if (!year) {
    var ymd = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) { year = ymd[1]; month = parseInt(ymd[2], 10); day = parseInt(ymd[3], 10); }
  }
  // M-D-YYYY
  if (!year) {
    var mdy2 = val.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (mdy2) { month = parseInt(mdy2[1], 10); day = parseInt(mdy2[2], 10); year = mdy2[3]; }
  }
  if (!year) return null;
  // MATH AUDIT FIX: reject semantically invalid dates (month 13, day 32, Feb 30)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  var isoStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  var d = new Date(isoStr + 'T00:00:00Z');
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== isoStr) return null;
  return isoStr;
}

function parseAmount(val) {
  if (!val || typeof val !== 'string') return null;
  var cleaned = val.replace(/[$,\s]/g, '');
  var n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

/**
 * Detect the CSV format based on headers
 * @returns {'transactions'|'holdings'|'dividends'|'unknown'}
 */
function detectFormat(headers) {
  var hSet = new Set(headers);
  var hasAction = findColumn(headers, 'action') !== null;
  var hasShares = findColumn(headers, 'shares') !== null;
  var hasPrice = findColumn(headers, 'price') !== null;
  var hasAmount = findColumn(headers, 'amount') !== null;

  if (hasAction && hasShares) return 'transactions';
  if (hasShares && hasPrice && !hasAction) return 'holdings';
  if (hasAmount && !hasShares && !hasPrice) return 'dividends';
  if (hasShares) return 'holdings';
  if (hasAmount) return 'dividends';
  return 'unknown';
}

/**
 * Parse CSV text into structured data
 * @param {string} text - raw CSV text
 * @returns {{ format, headers, rows: [{...}], errors: [{row, message}] }}
 */
export function parseCSV(text) {
  if (!text || typeof text !== 'string') {
    return { format: 'unknown', headers: [], rows: [], errors: [{ row: 0, message: 'Empty CSV content' }] };
  }

  var lines = text.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
  if (lines.length < 2) {
    return { format: 'unknown', headers: [], rows: [], errors: [{ row: 0, message: 'CSV must have a header row and at least one data row' }] };
  }

  var headerVals = parseCSVLine(lines[0]);
  var headers = headerVals.map(function(h) { return h.toLowerCase().replace(/['"]/g, '').trim(); });
  var format = detectFormat(headers);

  var tickerCol = findColumn(headers, 'ticker');
  if (!tickerCol) {
    return { format: format, headers: headers, rows: [], errors: [{ row: 1, message: 'No ticker/symbol column found' }] };
  }

  var dateCol = findColumn(headers, 'date');
  var amountCol = findColumn(headers, 'amount');
  var sharesCol = findColumn(headers, 'shares');
  var priceCol = findColumn(headers, 'price');
  var actionCol = findColumn(headers, 'action');
  var accountCol = findColumn(headers, 'account');

  var rows = [];
  var errors = [];

  for (var i = 1; i < lines.length; i++) {
    var vals = parseCSVLine(lines[i]);
    if (vals.length < 2) continue; // Skip near-empty lines

    var row = {};
    for (var j = 0; j < headers.length && j < vals.length; j++) {
      row[headers[j]] = vals[j];
    }

    // Validate ticker
    var ticker = (row[tickerCol] || '').toUpperCase().trim();
    if (!ticker || !/^[A-Z0-9]{1,5}(\.[A-Z]{1,4})?$/.test(ticker)) {
      errors.push({ row: i + 1, message: 'Invalid ticker: "' + (row[tickerCol] || '') + '"' });
      continue;
    }

    var parsed = { ticker: ticker };

    if (dateCol && row[dateCol]) {
      var date = normalizeDate(row[dateCol]);
      if (!date) {
        errors.push({ row: i + 1, message: 'Invalid date: "' + row[dateCol] + '"' });
        continue;
      }
      // Reject future dates
      if (date > new Date().toISOString().slice(0, 10)) {
        errors.push({ row: i + 1, message: 'Future date not allowed: ' + date });
        continue;
      }
      parsed.date = date;
    }

    if (amountCol && row[amountCol]) {
      var amount = parseAmount(row[amountCol]);
      if (amount !== null) parsed.amount = amount;
    }

    if (sharesCol && row[sharesCol]) {
      var shares = parseAmount(row[sharesCol]);
      if (shares !== null && shares > 0) parsed.shares = shares;
    }

    if (priceCol && row[priceCol]) {
      var price = parseAmount(row[priceCol]);
      if (price !== null && price > 0) parsed.price = price;
    }

    if (actionCol && row[actionCol]) {
      parsed.action = row[actionCol].toUpperCase().trim();
    }

    if (accountCol && row[accountCol]) {
      parsed.account = row[accountCol].trim();
    }

    rows.push(parsed);
  }

  return { format: format, headers: headers, rows: rows, errors: errors };
}

/**
 * Convert parsed CSV rows to reconciliation-ready dividend data
 * @param {Array} rows - parsed CSV rows with date, ticker, amount
 * @returns {Array} - [{ticker, ex_date, amount}]
 */
export function csvToDividendActuals(rows) {
  return rows
    .filter(function(r) { return r.ticker && r.date && r.amount; })
    .map(function(r) {
      return { ticker: r.ticker, ex_date: r.date, amount: r.amount };
    });
}

/**
 * Convert parsed CSV rows to holdings format
 * @param {Array} rows - parsed CSV rows with ticker, shares, price
 * @returns {Array} - [{ticker, shares, cost_basis}]
 */
export function csvToHoldings(rows) {
  return rows
    .filter(function(r) { return r.ticker && r.shares; })
    .map(function(r) {
      return { ticker: r.ticker, shares: r.shares, cost_basis: r.price || 0, account: r.account || '' };
    });
}
