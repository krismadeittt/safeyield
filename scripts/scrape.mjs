#!/usr/bin/env node
/**
 * SafeYield Bulk Scraper
 * Fetches fundamentals, price history, and dividend history for all tickers
 * from EODHD API and inserts into D1 database.
 *
 * Usage:
 *   EODHD_KEY=your_key node scripts/scrape.mjs [--validate] [--skip-existing] [--start TICKER]
 *
 * Rate limited: ~14 req/sec (70ms between calls, ~840/min under EODHD's 1,000/min cap)
 * Resume-friendly: skips tickers already scraped today (with --skip-existing)
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const WORKER_DIR = join(PROJECT_ROOT, 'worker');
const OUTPUT_DIR = join(__dirname, 'output');

const EODHD_BASE = 'https://eodhd.com/api';
const DB_NAME = 'safeyield-db';
const RATE_LIMIT_MS = 30; // ~33 req/sec (~2000/min — EODHD allows bursts)
const D1_BATCH_SIZE = 25; // flush SQL to D1 every N tickers
const CONCURRENCY = 5;    // parallel ticker workers

// ── CLI args ──
const args = process.argv.slice(2);
const VALIDATE = args.includes('--validate');
const SKIP_EXISTING = args.includes('--skip-existing');
const startIdx = args.indexOf('--start');
const START_TICKER = startIdx !== -1 ? args[startIdx + 1] : null;
const FUNDAMENTALS_ONLY = args.includes('--fundamentals-only');
const HISTORY_ONLY = args.includes('--history-only');
const DIVIDENDS_ONLY = args.includes('--dividends-only');

// ── API Key ──
const KEY = process.env.EODHD_KEY;
if (!KEY) {
  console.error('ERROR: Set EODHD_KEY environment variable');
  process.exit(1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });

// ── Helpers ──
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Global rate limiter — chain promises so API calls are properly spaced
let apiChain = Promise.resolve();
function rateLimitedFetch(url) {
  const p = apiChain.then(async () => {
    await sleep(RATE_LIMIT_MS);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url.split('?')[0]}`);
    return res.json();
  });
  // Chain next call after this one (regardless of success/failure)
  apiChain = p.catch(() => {});
  return p;
}

async function fetchJSON(url) {
  return rateLimitedFetch(url);
}

function escapeSQL(str) {
  if (str == null) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

// ── Batched D1 writes ──
let sqlBuffer = [];

function d1Queue(sql) {
  sqlBuffer.push(sql);
}

function d1Flush() {
  if (sqlBuffer.length === 0) return;
  const allSQL = sqlBuffer.join('\n');
  sqlBuffer = [];
  const tmpFile = join(__dirname, '.tmp_sql.sql');
  writeFileSync(tmpFile, allSQL);
  try {
    execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file ${tmpFile}`, {
      cwd: WORKER_DIR,
      stdio: 'pipe',
      timeout: 120000,
    });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : e.message;
    if (!stderr.includes('UNIQUE constraint')) {
      console.error('  D1 flush error:', stderr.slice(0, 300));
      throw e;
    }
  }
}

function d1Execute(sql) {
  d1Queue(sql);
}

// ── parseFundamentals (same logic as worker) ──
function sf(v, scale) {
  scale = scale || 1;
  var n = parseFloat(v);
  return (!isNaN(n) && n !== 0) ? n * scale : null;
}

function round(v, d) {
  return v != null ? parseFloat(v.toFixed(d || 2)) : null;
}

function parseFundamentals(raw) {
  if (!raw || typeof raw !== 'object') return {};

  var G  = raw.General         || {};
  var H  = raw.Highlights      || {};
  var SD = raw.SplitsDividends || {};
  var ET = raw.ETF_Data        || {};
  var SS = raw.SharesStats     || {};
  var TE = raw.Technicals      || {};
  var FI = raw.Financials      || {};

  var isETF = G.Type === 'ETF';

  var divYield = null;
  var etfY = parseFloat(ET.Yield);
  if (!isNaN(etfY) && etfY > 0) divYield = etfY;
  if (divYield == null) {
    var sy = parseFloat(SD.ForwardAnnualDividendYield);
    var hy = parseFloat(H.DividendYield);
    var y2 = (!isNaN(sy) && sy > 0) ? sy : ((!isNaN(hy) && hy > 0) ? hy : null);
    if (y2 !== null) divYield = y2 * 100;
  }

  var fwd = parseFloat(SD.ForwardAnnualDividendRate);
  var hlDiv = parseFloat(H.DividendShare);
  var annualDiv = (!isNaN(fwd) && fwd > 0) ? fwd : ((!isNaN(hlDiv) && hlDiv > 0) ? hlDiv : null);

  var pr = parseFloat(H.PayoutRatio);
  var payout = (!isNaN(pr) && pr > 0) ? pr * 100 : null;

  var incQ = (FI.Income_Statement && FI.Income_Statement.quarterly) || {};
  var balQ = (FI.Balance_Sheet    && FI.Balance_Sheet.quarterly)    || {};
  var cfQ  = (FI.Cash_Flow        && FI.Cash_Flow.quarterly)        || {};
  var incY = (FI.Income_Statement && FI.Income_Statement.yearly) || {};
  var balY = (FI.Balance_Sheet    && FI.Balance_Sheet.yearly)    || {};
  var cfY  = (FI.Cash_Flow        && FI.Cash_Flow.yearly)        || {};

  var revenue = sf(H.RevenueTTM);
  var eps = sf(H.EarningsShare);
  if (payout == null && annualDiv > 0 && eps > 0) {
    payout = (annualDiv / eps) * 100;
  }

  var marketCap = H.MarketCapitalization ? Math.round(parseFloat(H.MarketCapitalization) / 1e9) : null;

  // Compute g5 and streak from annual DPS
  var balEntries = Object.entries(balY).sort((a, b) => a[0] < b[0] ? -1 : 1);
  var cfEntries = Object.entries(cfY).sort((a, b) => a[0] < b[0] ? -1 : 1);
  var sharesMap = {};
  balEntries.forEach(e => {
    var s = parseFloat((e[1] || {}).commonStockSharesOutstanding);
    if (!isNaN(s) && s > 0) sharesMap[e[0]] = s;
  });
  var dps = [];
  cfEntries.slice(-20).forEach(entry => {
    var divPaid = parseFloat((entry[1] || {}).dividendsPaid);
    var s = sharesMap[entry[0]];
    if (!isNaN(divPaid) && s) {
      dps.push({ date: entry[0], value: round(Math.abs(divPaid) / s, 4) });
    }
  });

  var g5 = computeG5(dps);
  var streak = computeStreak(dps);

  // Fallbacks
  if (annualDiv == null && dps.length > 0) {
    var lastDps = dps[dps.length - 1].value;
    if (lastDps > 0) annualDiv = lastDps;
  }
  if (divYield == null && annualDiv > 0) {
    var h52 = sf(H['52WeekHigh']);
    var l52 = sf(H['52WeekLow']);
    if (h52 && l52) {
      divYield = (annualDiv / ((h52 + l52) / 2)) * 100;
    }
  }

  return {
    name:      G.Name   || null,
    sector:    G.Sector || null,
    isETF:     isETF,
    divYield:  round(divYield, 3),
    annualDiv: round(annualDiv, 4),
    payout:    round(payout, 1),
    marketCap: marketCap,
    g5:        g5,
    streak:    streak,
    eps:       eps,
    revenue:   revenue,
  };
}

function computeG5(dps) {
  if (!dps || dps.length < 2) return null;
  var recent = dps.slice(-6);
  if (recent.length < 2) return null;
  var first = recent[0].value;
  var last = recent[recent.length - 1].value;
  if (!first || first <= 0 || !last || last <= 0) return null;
  var years = recent.length - 1;
  var cagr = (Math.pow(last / first, 1 / years) - 1) * 100;
  return round(cagr, 1);
}

function computeStreak(dps) {
  if (!dps || dps.length < 2) return 0;
  var streak = 0;
  for (var i = dps.length - 1; i > 0; i--) {
    if (dps[i].value > dps[i - 1].value) streak++;
    else break;
  }
  return streak;
}

// ── Load tickers ──
const tickers = JSON.parse(readFileSync(join(__dirname, 'tickers.json'), 'utf8'));
let allTickers = [...tickers.stocks, ...tickers.etfs];

// If --start, skip until we find the ticker
if (START_TICKER) {
  const idx = allTickers.indexOf(START_TICKER.toUpperCase());
  if (idx === -1) {
    console.error(`Ticker ${START_TICKER} not found in list`);
    process.exit(1);
  }
  allTickers = allTickers.slice(idx);
  console.log(`Resuming from ${START_TICKER}, ${allTickers.length} tickers remaining`);
}

// ── Validate tickers against EODHD exchange list ──
async function validateTickers() {
  console.log('Validating tickers against EODHD exchange list...');
  const symbols = await fetchJSON(`${EODHD_BASE}/exchange-symbol-list/US?api_token=${KEY}&fmt=json`);
  const validSet = new Set(symbols.map(s => s.Code));
  console.log(`Exchange has ${validSet.size} symbols`);

  const invalid = allTickers.filter(t => !validSet.has(t) && !validSet.has(t.replace('.', '-')));
  if (invalid.length > 0) {
    console.log(`WARNING: ${invalid.length} tickers not found on EODHD:`, invalid.slice(0, 20).join(', '));
    console.log('These will be skipped during scraping.');
  }
  // Filter to valid only
  allTickers = allTickers.filter(t => validSet.has(t) || validSet.has(t.replace('.', '-')));
  console.log(`${allTickers.length} valid tickers to scrape`);
}

// ── Main scrape function for one ticker ──
async function scrapeTicker(ticker, index, total) {
  const code = ticker.includes('.') ? ticker : ticker + '.US';
  const prefix = `[${index + 1}/${total}] ${ticker}:`;

  try {
    // 1. Fundamentals
    if (!HISTORY_ONLY && !DIVIDENDS_ONLY) {
      console.log(`${prefix} Fetching fundamentals...`);
      const raw = await fetchJSON(`${EODHD_BASE}/fundamentals/${code}?api_token=${KEY}`);
      await sleep(RATE_LIMIT_MS);

      const parsed = parseFundamentals(raw);
      parsed.ticker = ticker;

      // Save local backup
      writeFileSync(join(OUTPUT_DIR, `${ticker}.json`), JSON.stringify(parsed, null, 2));

      // Save full raw parsed data to D1
      const dataJson = JSON.stringify(parsed);
      const now = new Date().toISOString();
      const sql = `INSERT OR REPLACE INTO stock_fundamentals (ticker, data, updated_at) VALUES (${escapeSQL(ticker)}, ${escapeSQL(dataJson)}, ${escapeSQL(now)});`;
      d1Execute(sql);
    }

    // 2. Price history (20 years)
    if (!FUNDAMENTALS_ONLY && !DIVIDENDS_ONLY) {
      console.log(`${prefix} Fetching price history...`);
      const priceData = await fetchJSON(
        `${EODHD_BASE}/eod/${code}?api_token=${KEY}&fmt=json&period=m&from=2004-01-01`
      );
      await sleep(RATE_LIMIT_MS);

      if (Array.isArray(priceData) && priceData.length > 0) {
        // Batch insert prices — build multi-value INSERT
        const values = priceData
          .map(d => {
            const month = d.date ? d.date.slice(0, 7) : null;
            const price = parseFloat(d.adjusted_close || d.close || 0);
            if (!month || price <= 0) return null;
            return `(${escapeSQL(ticker)}, ${escapeSQL(month)}, ${price.toFixed(2)})`;
          })
          .filter(Boolean);

        if (values.length > 0) {
          // Split into batches of 200 to stay under SQL size limits
          for (let i = 0; i < values.length; i += 200) {
            const batch = values.slice(i, i + 200);
            const sql = `INSERT OR REPLACE INTO price_history (ticker, month, price) VALUES ${batch.join(',\n')};`;
            d1Execute(sql);
          }
          console.log(`${prefix} Saved ${values.length} price points`);
        }
      }
    }

    // 3. Dividend history (20 years)
    if (!FUNDAMENTALS_ONLY && !HISTORY_ONLY) {
      console.log(`${prefix} Fetching dividend history...`);
      const divData = await fetchJSON(
        `${EODHD_BASE}/div/${code}?api_token=${KEY}&fmt=json&from=2004-01-01`
      );
      await sleep(RATE_LIMIT_MS);

      if (Array.isArray(divData) && divData.length > 0) {
        const values = divData
          .map(d => {
            const date = d.date;
            const amount = parseFloat(d.value);
            if (!date || isNaN(amount) || amount <= 0) return null;
            return `(${escapeSQL(ticker)}, ${escapeSQL(date)}, ${amount.toFixed(4)})`;
          })
          .filter(Boolean);

        if (values.length > 0) {
          const sql = `INSERT OR IGNORE INTO dividend_history (ticker, date, amount) VALUES ${values.join(',\n')};`;
          d1Execute(sql);
          console.log(`${prefix} Saved ${values.length} dividend payments`);
        }
      }
    }

    return true;
  } catch (e) {
    console.error(`${prefix} ERROR: ${e.message}`);
    return false;
  }
}

// ── Check which tickers were already scraped today ──
async function getScrapedToday() {
  if (!SKIP_EXISTING) return new Set();

  try {
    const today = new Date().toISOString().slice(0, 10);
    const tmpFile = join(__dirname, '.tmp_check.sql');
    writeFileSync(tmpFile, `SELECT ticker FROM stock_fundamentals WHERE updated_at >= '${today}';`);
    const result = execSync(
      `npx wrangler d1 execute ${DB_NAME} --remote --file ${tmpFile} --json`,
      { cwd: WORKER_DIR, stdio: 'pipe', timeout: 30000 }
    );
    const parsed = JSON.parse(result.toString());
    const tickers = new Set();
    if (parsed && parsed[0] && parsed[0].results) {
      parsed[0].results.forEach(r => tickers.add(r.ticker));
    }
    console.log(`Found ${tickers.size} tickers already scraped today`);
    return tickers;
  } catch (e) {
    console.log('Could not check existing data, starting fresh');
    return new Set();
  }
}

// ── Main ──
async function main() {
  console.log('SafeYield Bulk Scraper');
  console.log('=====================');
  console.log(`Total tickers: ${allTickers.length}`);
  console.log(`Mode: ${FUNDAMENTALS_ONLY ? 'fundamentals-only' : HISTORY_ONLY ? 'history-only' : DIVIDENDS_ONLY ? 'dividends-only' : 'full'}`);

  if (VALIDATE) {
    await validateTickers();
  }

  const scrapedToday = await getScrapedToday();

  let success = 0, fail = 0, skipped = 0;
  const startTime = Date.now();

  // Build work queue (filter out already-scraped)
  const workQueue = [];
  for (let i = 0; i < allTickers.length; i++) {
    const ticker = allTickers[i];
    if (scrapedToday.has(ticker)) {
      skipped++;
      continue;
    }
    workQueue.push({ ticker, index: i });
  }
  if (skipped > 0) console.log(`Skipped ${skipped} already-scraped tickers`);
  console.log(`Processing ${workQueue.length} tickers with concurrency=${CONCURRENCY}\n`);

  let cursor = 0;
  async function worker() {
    while (cursor < workQueue.length) {
      const idx = cursor++;
      const { ticker, index } = workQueue[idx];
      const ok = await scrapeTicker(ticker, index, allTickers.length);
      if (ok) success++;
      else fail++;

      const processed = success + fail;
      // Flush batched SQL to D1 periodically
      if (processed % D1_BATCH_SIZE === 0 && sqlBuffer.length > 0) {
        console.log(`  Flushing ${sqlBuffer.length} SQL statements to D1...`);
        d1Flush();
      }
      // Progress logging every 50 tickers
      if (processed % 50 === 0) {
        const elapsed = ((Date.now() - startTime) / 60000).toFixed(1);
        const remaining = workQueue.length - processed;
        console.log(`\n=== Progress: ${success} ok, ${fail} failed, ${skipped} skipped | ${elapsed}min elapsed | ~${remaining} remaining ===\n`);
      }
    }
  }

  // Launch concurrent workers
  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) workers.push(worker());
  await Promise.all(workers);

  // Final flush
  if (sqlBuffer.length > 0) {
    console.log(`  Final flush: ${sqlBuffer.length} SQL statements...`);
    d1Flush();
  }

  const totalTime = ((Date.now() - startTime) / 60000).toFixed(1);
  console.log('\n=====================');
  console.log(`Done! ${success} succeeded, ${fail} failed, ${skipped} skipped`);
  console.log(`Total time: ${totalTime} minutes`);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
