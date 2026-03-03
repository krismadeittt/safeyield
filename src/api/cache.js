const QUOTE_TTL = 5 * 60000;        // 5 minutes
const FUNDAMENTALS_TTL = 60 * 60000; // 60 minutes

const quoteCache = {};
const fundamentalsCache = {};

export function getCachedQuote(ticker) {
  const entry = quoteCache[ticker];
  if (entry && Date.now() - entry.ts < QUOTE_TTL) return entry.data;
  return null;
}

export function setCachedQuote(ticker, data) {
  quoteCache[ticker] = { data, ts: Date.now() };
}

export function getCachedFundamentals(ticker) {
  const entry = fundamentalsCache[ticker];
  if (entry && Date.now() - entry.ts < FUNDAMENTALS_TTL) return entry.data;
  return null;
}

export function setCachedFundamentals(ticker, data) {
  fundamentalsCache[ticker] = { data, ts: Date.now() };
}

export function getAllCachedFundamentals(tickers) {
  const result = {};
  tickers.forEach(t => {
    const cached = getCachedFundamentals(t);
    if (cached) result[t] = cached;
  });
  return result;
}
