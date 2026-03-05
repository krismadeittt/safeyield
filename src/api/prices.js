import { apiFetch } from './client';

/**
 * Fetch daily closing prices for multiple tickers in a date range.
 * Uses the /daily-prices route which caches permanently in D1.
 * @param {string[]} tickers
 * @param {string} from - YYYY-MM-DD
 * @param {string} to - YYYY-MM-DD
 * @returns {Object} { TICKER: [{date, close, adj_close}, ...], ... }
 */
export async function fetchDailyPrices(tickers, from, to) {
  if (!tickers?.length || !from) return {};
  const results = {};
  const failedChunks = [];
  // Endpoint supports max 20 tickers per request
  for (let i = 0; i < tickers.length; i += 20) {
    const chunk = tickers.slice(i, i + 20);
    try {
      const params = new URLSearchParams({
        symbols: chunk.join(','),
        from,
      });
      if (to) params.set('to', to);
      const data = await apiFetch(`/daily-prices?${params.toString()}`, 30000);
      if (data?.results) {
        Object.assign(results, data.results);
      }
    } catch (err) {
      failedChunks.push({ tickers: chunk, error: err.message || String(err) });
    }
  }
  if (failedChunks.length > 0) {
    const failedTickers = failedChunks.flatMap(c => c.tickers);
    throw new Error(`Failed to fetch daily prices for: ${failedTickers.join(', ')}. Partial results returned for ${Object.keys(results).length} tickers.`);
  }
  return results;
}
