#!/usr/bin/env node
/**
 * Upload historical stock/ETF data to Cloudflare KV.
 *
 * Usage:
 *   node scripts/upload-history-kv.js /path/to/eodhd_top_stocks_etfs.json
 *
 * This script:
 * 1. Reads the big JSON file
 * 2. Splits it into per-ticker entries
 * 3. Writes bulk upload JSON files (wrangler kv:bulk put has a 10MB limit)
 * 4. Runs wrangler kv:bulk put for each chunk
 *
 * Prerequisites:
 * - wrangler must be installed (npx wrangler)
 * - KV namespace must be created first:
 *   npx wrangler kv:namespace create HISTORY
 * - Update worker/history-kv/wrangler.toml with the namespace ID
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node scripts/upload-history-kv.js <path-to-json>');
  process.exit(1);
}

console.log('Reading', inputFile, '...');
const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
console.log(`Loaded ${data.length} entries`);

// Create temp directory for bulk upload chunks
const tmpDir = path.join(__dirname, '..', '.kv-upload-tmp');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

// Build ticker index
const tickerIndex = data.map(d => ({
  s: d.s,
  t: d.t,
  r: d.r,
  divCount: d.d?.length || 0,
  priceCount: d.p?.length || 0,
}));

// Build KV entries: each ticker as a key, plus _tickers index
const kvEntries = [];

// Add ticker index
kvEntries.push({
  key: '_tickers',
  value: JSON.stringify(tickerIndex),
});

// Add each ticker's data
data.forEach(entry => {
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
});

console.log(`Total KV entries: ${kvEntries.length}`);

// Split into chunks of ~8MB for wrangler kv:bulk put
const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
const chunks = [];
let currentChunk = [];
let currentSize = 0;

kvEntries.forEach(entry => {
  const entrySize = entry.key.length + entry.value.length + 50; // overhead for JSON wrapper
  if (currentSize + entrySize > MAX_CHUNK_BYTES && currentChunk.length > 0) {
    chunks.push(currentChunk);
    currentChunk = [];
    currentSize = 0;
  }
  currentChunk.push(entry);
  currentSize += entrySize;
});
if (currentChunk.length > 0) chunks.push(currentChunk);

console.log(`Split into ${chunks.length} chunks for upload`);

// Write chunks to disk
chunks.forEach((chunk, i) => {
  const filePath = path.join(tmpDir, `chunk-${i}.json`);
  fs.writeFileSync(filePath, JSON.stringify(chunk));
  const sizeMB = (fs.statSync(filePath).size / 1024 / 1024).toFixed(1);
  console.log(`  chunk-${i}.json: ${chunk.length} entries, ${sizeMB}MB`);
});

console.log('\n--- Chunk files written to', tmpDir);
console.log('\nTo upload, run these commands from the worker/history-kv directory:');
console.log('(Replace KV_NAMESPACE_ID with your actual namespace ID)\n');

chunks.forEach((_, i) => {
  const filePath = path.resolve(tmpDir, `chunk-${i}.json`);
  console.log(`npx wrangler kv:bulk put --namespace-id=KV_NAMESPACE_ID "${filePath}"`);
});

console.log('\nOr run with --auto flag to upload automatically (requires wrangler.toml to be configured)');

if (process.argv.includes('--auto')) {
  // Read namespace ID from wrangler.toml
  const tomlPath = path.join(__dirname, '..', 'worker', 'history-kv', 'wrangler.toml');
  const toml = fs.readFileSync(tomlPath, 'utf8');
  const nsMatch = toml.match(/id\s*=\s*"([^"]+)"/);
  if (!nsMatch || nsMatch[1].includes('REPLACE')) {
    console.error('\nERROR: KV namespace ID not set in wrangler.toml. Create it first:');
    console.error('  cd worker/history-kv && npx wrangler kv:namespace create HISTORY');
    process.exit(1);
  }
  const nsId = nsMatch[1];
  console.log(`\nUploading to KV namespace: ${nsId}`);

  chunks.forEach((_, i) => {
    const filePath = path.resolve(tmpDir, `chunk-${i}.json`);
    console.log(`\nUploading chunk ${i + 1}/${chunks.length}...`);
    try {
      execSync(`npx wrangler kv:bulk put --namespace-id=${nsId} "${filePath}"`, {
        cwd: path.join(__dirname, '..', 'worker', 'history-kv'),
        stdio: 'inherit',
      });
      console.log(`  ✓ chunk ${i} uploaded`);
    } catch (err) {
      console.error(`  ✗ chunk ${i} failed:`, err.message);
      process.exit(1);
    }
  });

  console.log('\n✓ All data uploaded to KV!');

  // Cleanup
  chunks.forEach((_, i) => {
    fs.unlinkSync(path.join(tmpDir, `chunk-${i}.json`));
  });
  fs.rmdirSync(tmpDir);
  console.log('Temp files cleaned up.');
}
