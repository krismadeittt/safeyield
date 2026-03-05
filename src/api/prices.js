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
  // Endpoint supports max 20 tickers per request
  for (let i = 0; i < tickers.length; i += 20) {
    const chunk = tickers.slice(i, i + 20);
    try {
      const symbols = chunk.join(',');
      const data = await apiFetch(`/daily-prices?symbols=${symbols}&from=${from}&to=${to}`, 30000);
      if (data?.results) {
        Object.assign(results, data.results);
      }
    } catch {
      // Continue with remaining chunks
    }
  }
  return results;
}
