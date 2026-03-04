#!/usr/bin/env node
/**
 * Generate static data files (stocks.js, etfs.js) from D1 stock_fundamentals table.
 * Run after scraping to update the frontend fallback data.
 *
 * Usage: node scripts/generate-static.mjs
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const WORKER_DIR = join(PROJECT_ROOT, 'worker');
const DB_NAME = 'safeyield-db';

function d1Query(sql) {
  const tmpFile = join(__dirname, '.tmp_query.sql');
  writeFileSync(tmpFile, sql);
  const result = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --file ${tmpFile} --json`,
    { cwd: WORKER_DIR, stdio: 'pipe', timeout: 60000 }
  );
  const parsed = JSON.parse(result.toString());
  return (parsed && parsed[0] && parsed[0].results) || [];
}

console.log('Fetching fundamentals from D1...');
const rows = d1Query('SELECT ticker, data FROM stock_fundamentals ORDER BY ticker;');
console.log(`Got ${rows.length} tickers from D1`);

// Load tickers.json to know which are stocks vs ETFs
const tickers = JSON.parse(readFileSync(join(__dirname, 'tickers.json'), 'utf8'));
const stockSet = new Set(tickers.stocks);
const etfSet = new Set(tickers.etfs);

const stocks = [];
const etfs = {};

for (const row of rows) {
  let data;
  try {
    data = JSON.parse(row.data);
  } catch {
    continue;
  }

  const ticker = row.ticker;
  const isETF = data.isETF || etfSet.has(ticker);
  const isStock = stockSet.has(ticker);

  if (isETF || (!isStock && data.isETF)) {
    // ETF entry
    etfs[ticker] = {
      name: data.name || ticker,
      yld: data.divYield != null ? data.divYield : 0,
      div: data.annualDiv != null ? data.annualDiv : 0,
      g5: data.g5 != null ? data.g5 : 0,
      sector: 'ETF',
      payout: null,
    };
  } else {
    // Stock entry
    stocks.push({
      ticker: ticker,
      name: data.name || ticker,
      sector: data.sector || 'Unknown',
      yld: data.divYield != null ? data.divYield : 0,
      div: data.annualDiv != null ? data.annualDiv : 0,
      payout: data.payout != null ? data.payout : 0,
      g5: data.g5 != null ? data.g5 : 0,
      streak: data.streak != null ? data.streak : 0,
      cap: data.marketCap != null ? data.marketCap : 0,
    });
  }
}

// Sort stocks by market cap descending
stocks.sort((a, b) => (b.cap || 0) - (a.cap || 0));

// Generate stocks.js
const stocksContent = `export const STOCK_UNIVERSE = ${JSON.stringify(stocks)};\n`;
writeFileSync(join(PROJECT_ROOT, 'src/data/stocks.js'), stocksContent);
console.log(`Generated stocks.js with ${stocks.length} entries`);

// Generate etfs.js
const etfContent = `export const ETF_DATABASE = ${JSON.stringify(etfs, null, 2)};\n`;
writeFileSync(join(PROJECT_ROOT, 'src/data/etfs.js'), etfContent);
console.log(`Generated etfs.js with ${Object.keys(etfs).length} entries`);
