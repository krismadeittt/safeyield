#!/usr/bin/env node
/**
 * Fetch historical data from EODHD API for 23 missing NOBL tickers
 * and upload them to Cloudflare KV.
 *
 * Usage:
 *   node scripts/seed-missing-tickers.js --key=YOUR_EODHD_API_KEY
 *   EODHD_KEY=YOUR_KEY node scripts/seed-missing-tickers.js
 *   node scripts/seed-missing-tickers.js --key=YOUR_KEY --auto
 *
 * Options:
 *   --key=<key>   EODHD API key (or set EODHD_KEY env var)
 *   --auto        Automatically run wrangler kv:bulk put after generating files
 *   --dry-run     Fetch data and write files but skip wrangler upload
 *
 * Prerequisites:
 *   - Node.js 18+ (for native fetch)
 *   - wrangler installed (npx wrangler) if using --auto
 *   - KV namespace already created (ID: e4b018e2817c4346a0f7119db9eb54c4)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MISSING_TICKERS = [
  'MKC', 'HRL', 'GIS', 'BEN', 'CINF', 'MMC', 'DOV', 'SWK', 'NDSN', 'PPG',
  'ALB', 'AMCR', 'ESS', 'FRT', 'VFC', 'CHRW', 'EXPD', 'WBA', 'CLX', 'GPC',
  'ECL', 'BRO', 'AOS',
];

const KV_NAMESPACE_ID = 'e4b018e2817c4346a0f7119db9eb54c4';
const DATE_FROM = '2005-01-01';
const DATE_TO = '2026-12-31';
const REQUEST_DELAY_MS = 500;
const MAX_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MB per wrangler bulk upload chunk

const PROJECT_ROOT = path.join(__dirname, '..');
const WORKER_DIR = path.join(PROJECT_ROOT, 'worker', 'history-kv');
const TMP_DIR = path.join(PROJECT_ROOT, '.kv-upload-tmp');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (const arg of args) {
    if (arg.startsWith('--key=')) {
      flags.key = arg.slice('--key='.length);
    } else if (arg === '--auto') {
      flags.auto = true;
    } else if (arg === '--dry-run') {
      flags.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      flags.help = true;
    }
  }
  return flags;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch JSON from a URL with retries.
 */
async function fetchJSON(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = attempt * 1000;
      console.warn(`    Attempt ${attempt} failed (${err.message}), retrying in ${wait}ms...`);
      await sleep(wait);
    }
  }
}

/**
 * Build the EODHD EOD price URL for a ticker.
 */
function eodURL(ticker, apiKey) {
  return `https://eodhd.com/api/eod/${ticker}.US?api_token=${apiKey}&fmt=json&from=${DATE_FROM}&to=${DATE_TO}`;
}

/**
 * Build the EODHD dividends URL for a ticker.
 */
function divURL(ticker, apiKey) {
  return `https://eodhd.com/api/div/${ticker}.US?api_token=${apiKey}&fmt=json&from=${DATE_FROM}&to=${DATE_TO}`;
}

/**
 * Transform raw EODHD price data into KV schema price array.
 * EODHD returns: { date, open, high, low, close, adjusted_close, volume }
 * KV schema:     { d: date, c: close, ac: adjusted_close }
 */
function transformPrices(rawPrices) {
  if (!Array.isArray(rawPrices)) return [];
  return rawPrices.map(p => ({
    d: p.date,
    c: p.close,
    ac: p.adjusted_close,
  }));
}

/**
 * Transform raw EODHD dividend data into KV schema dividend array.
 * EODHD returns: { date, value }
 * KV schema:     { d: date, v: value }
 */
function transformDividends(rawDivs) {
  if (!Array.isArray(rawDivs)) return [];
  return rawDivs
    .filter(d => d.value > 0)
    .map(d => ({
      d: d.date,
      v: d.value,
    }));
}

/**
 * Split an array of KV entries into chunks that fit under MAX_CHUNK_BYTES.
 */
function chunkEntries(entries) {
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;

  for (const entry of entries) {
    const entrySize = entry.key.length + entry.value.length + 50;
    if (currentSize + entrySize > MAX_CHUNK_BYTES && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(entry);
    currentSize += entrySize;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs();

  if (flags.help) {
    console.log(`
Usage:
  node scripts/seed-missing-tickers.js --key=YOUR_EODHD_API_KEY [--auto] [--dry-run]

Options:
  --key=<key>   EODHD API key (or set EODHD_KEY env var)
  --auto        Automatically run wrangler kv:bulk put after generating files
  --dry-run     Fetch data and write files but skip wrangler upload
  --help, -h    Show this help message
`);
    process.exit(0);
  }

  const apiKey = flags.key || process.env.EODHD_KEY;
  if (!apiKey) {
    console.error('ERROR: No API key provided.');
    console.error('  Pass --key=YOUR_KEY or set the EODHD_KEY environment variable.');
    process.exit(1);
  }

  console.log('=== SafeYield: Seed Missing NOBL Tickers ===');
  console.log(`Tickers to fetch: ${MISSING_TICKERS.length}`);
  console.log(`Date range: ${DATE_FROM} to ${DATE_TO}`);
  console.log(`KV namespace: ${KV_NAMESPACE_ID}`);
  console.log('');

  // -------------------------------------------------------------------------
  // Step 1: Fetch data from EODHD for each ticker
  // -------------------------------------------------------------------------
  const tickerData = [];
  const errors = [];

  for (let i = 0; i < MISSING_TICKERS.length; i++) {
    const ticker = MISSING_TICKERS[i];
    const progress = `[${i + 1}/${MISSING_TICKERS.length}]`;

    console.log(`${progress} Fetching ${ticker}...`);

    try {
      // Fetch EOD prices
      console.log(`  -> EOD prices...`);
      const rawPrices = await fetchJSON(eodURL(ticker, apiKey));
      const prices = transformPrices(rawPrices);
      console.log(`     ${prices.length} price records`);

      // Delay between requests
      await sleep(REQUEST_DELAY_MS);

      // Fetch dividends
      console.log(`  -> Dividends...`);
      const rawDivs = await fetchJSON(divURL(ticker, apiKey));
      const dividends = transformDividends(rawDivs);
      console.log(`     ${dividends.length} dividend records`);

      const entry = {
        s: ticker,
        t: 'stock',
        r: 1,
        p: prices,
        d: dividends,
      };

      tickerData.push(entry);
      console.log(`  OK: ${ticker} (${prices.length} prices, ${dividends.length} dividends)`);
    } catch (err) {
      console.error(`  FAILED: ${ticker} - ${err.message}`);
      errors.push({ ticker, error: err.message });
    }

    // Delay before next ticker (skip delay after last ticker)
    if (i < MISSING_TICKERS.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log('');
  console.log(`--- Fetch complete ---`);
  console.log(`  Successful: ${tickerData.length}/${MISSING_TICKERS.length}`);
  if (errors.length > 0) {
    console.log(`  Failed: ${errors.length}`);
    errors.forEach(e => console.log(`    - ${e.ticker}: ${e.error}`));
  }

  if (tickerData.length === 0) {
    console.error('\nNo data fetched. Exiting.');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 2: Fetch existing _tickers index and merge
  // -------------------------------------------------------------------------
  console.log('\nFetching existing _tickers index from KV...');

  let existingIndex = [];
  try {
    const result = execSync(
      `npx wrangler kv key get --namespace-id=${KV_NAMESPACE_ID} --remote "_tickers"`,
      { cwd: WORKER_DIR, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    existingIndex = JSON.parse(result);
    console.log(`  Found ${existingIndex.length} existing tickers in index`);
  } catch (err) {
    console.warn('  Could not fetch existing _tickers index (may not exist yet).');
    console.warn('  Will create a new index with only the new tickers.');
  }

  // Remove any existing entries for the new tickers (in case of partial previous runs)
  const newTickerSet = new Set(tickerData.map(d => d.s));
  const filteredIndex = existingIndex.filter(entry => !newTickerSet.has(entry.s));

  // Add new ticker index entries
  const newIndexEntries = tickerData.map(d => ({
    s: d.s,
    t: d.t,
    r: d.r,
    divCount: d.d.length,
    priceCount: d.p.length,
  }));

  const mergedIndex = [...filteredIndex, ...newIndexEntries];
  // Sort alphabetically by symbol for consistency
  mergedIndex.sort((a, b) => a.s.localeCompare(b.s));

  console.log(`  Merged index: ${mergedIndex.length} total tickers`);

  // -------------------------------------------------------------------------
  // Step 3: Build KV entries and write bulk upload JSON files
  // -------------------------------------------------------------------------
  console.log('\nBuilding KV entries...');

  const kvEntries = [];

  // Add updated _tickers index
  kvEntries.push({
    key: '_tickers',
    value: JSON.stringify(mergedIndex),
  });

  // Add each ticker's data
  for (const entry of tickerData) {
    kvEntries.push({
      key: entry.s,
      value: JSON.stringify({
        s: entry.s,
        t: entry.t,
        r: entry.r,
        p: entry.p,
        d: entry.d,
      }),
    });
  }

  console.log(`  Total KV entries: ${kvEntries.length} (1 index + ${tickerData.length} tickers)`);

  // Create temp directory
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }

  // Split into chunks
  const chunks = chunkEntries(kvEntries);
  console.log(`  Split into ${chunks.length} chunk(s) for upload`);

  // Write chunk files
  const chunkFiles = [];
  for (let i = 0; i < chunks.length; i++) {
    const filePath = path.join(TMP_DIR, `seed-chunk-${i}.json`);
    fs.writeFileSync(filePath, JSON.stringify(chunks[i]));
    const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
    console.log(`    seed-chunk-${i}.json: ${chunks[i].length} entries, ${sizeMB} MB`);
    chunkFiles.push(filePath);
  }

  console.log(`\nChunk files written to ${TMP_DIR}`);

  // -------------------------------------------------------------------------
  // Step 4: Upload via wrangler (or print instructions)
  // -------------------------------------------------------------------------
  if (flags.dryRun) {
    console.log('\n--dry-run specified. Skipping upload.');
    console.log('Chunk files are preserved in:', TMP_DIR);
    console.log('\nTo upload manually, run:');
    chunkFiles.forEach(f => {
      console.log(`  npx wrangler kv:bulk put --namespace-id=${KV_NAMESPACE_ID} "${f}"`);
    });
    process.exit(0);
  }

  if (!flags.auto) {
    console.log('\nTo upload to KV, run these commands:');
    console.log('');
    chunkFiles.forEach(f => {
      console.log(`  npx wrangler kv:bulk put --namespace-id=${KV_NAMESPACE_ID} "${f}"`);
    });
    console.log('');
    console.log('Or re-run this script with --auto to upload automatically:');
    console.log(`  node scripts/seed-missing-tickers.js --key=YOUR_KEY --auto`);
    console.log('');
    console.log('After uploading, you can delete the temp files:');
    console.log(`  rm -rf ${TMP_DIR}`);
    process.exit(0);
  }

  // --auto: run wrangler for each chunk
  console.log('\n--- Uploading to KV (--auto) ---');
  let uploadFailed = false;

  for (let i = 0; i < chunkFiles.length; i++) {
    const filePath = chunkFiles[i];
    console.log(`\nUploading chunk ${i + 1}/${chunkFiles.length}...`);
    try {
      execSync(
        `npx wrangler kv bulk put --namespace-id=${KV_NAMESPACE_ID} --remote "${filePath}"`,
        { cwd: WORKER_DIR, stdio: 'inherit' }
      );
      console.log(`  Chunk ${i} uploaded successfully.`);
    } catch (err) {
      console.error(`  Chunk ${i} upload FAILED: ${err.message}`);
      uploadFailed = true;
      break;
    }
  }

  if (uploadFailed) {
    console.error('\nUpload failed. Temp files preserved for retry:', TMP_DIR);
    console.error('You can retry the remaining chunks manually.');
    process.exit(1);
  }

  // -------------------------------------------------------------------------
  // Step 5: Clean up temp files
  // -------------------------------------------------------------------------
  console.log('\nCleaning up temp files...');
  for (const f of chunkFiles) {
    try {
      fs.unlinkSync(f);
    } catch (_) {
      // ignore
    }
  }
  try {
    fs.rmdirSync(TMP_DIR);
  } catch (_) {
    // directory may not be empty if other scripts wrote files
  }

  console.log('Temp files removed.');

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------
  console.log('\n=== Done ===');
  console.log(`Successfully seeded ${tickerData.length} tickers into KV.`);
  if (errors.length > 0) {
    console.log(`\nNote: ${errors.length} ticker(s) failed to fetch and were skipped:`);
    errors.forEach(e => console.log(`  - ${e.ticker}: ${e.error}`));
    process.exit(2); // partial success
  }
}

// Run
main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
