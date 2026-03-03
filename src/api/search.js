import { apiFetch } from './client';

/**
 * Search for tickers/companies via the worker API.
 * @returns {Array<{ticker: string, exchange: string, name: string}>}
 */
export async function searchTickers(query) {
  const data = await apiFetch(`/search?q=${encodeURIComponent(query)}`);
  return (data?.results || [])
    .filter(r => r.exchange === "US" || r.exchange === "NYSE" || r.exchange === "NASDAQ")
    .map(r => ({ ticker: r.ticker, name: r.name, exchange: r.exchange }))
    .slice(0, 8);
}
