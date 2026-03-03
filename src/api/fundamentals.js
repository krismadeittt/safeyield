import { apiFetch } from './client';
import { getCachedFundamentals, setCachedFundamentals } from './cache';

/**
 * Fetch fundamentals for multiple tickers with caching. Chunks by 20.
 */
export async function fetchBatchFundamentals(tickers) {
  const uncached = tickers.filter(t => !getCachedFundamentals(t));

  if (!uncached.length) {
    const result = {};
    tickers.forEach(t => {
      const cached = getCachedFundamentals(t);
      if (cached) result[t] = cached;
    });
    return result;
  }

  const chunks = [];
  for (let i = 0; i < uncached.length; i += 20) {
    chunks.push(uncached.slice(i, i + 20));
  }

  const fetched = {};
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 500));
    try {
      const data = (await apiFetch(`/batch-fundamentals?symbols=${chunks[i].join(",")}`, 25000))?.results || {};
      for (const [ticker, fundamentals] of Object.entries(data)) {
        if (!fundamentals.error) {
          setCachedFundamentals(ticker, fundamentals);
          fetched[ticker] = fundamentals;
        }
      }
    } catch (err) {
      console.warn("Batch fundamentals chunk failed:", err.message);
    }
  }

  // Merge cached + freshly fetched
  tickers.forEach(t => {
    if (!fetched[t]) {
      const cached = getCachedFundamentals(t);
      if (cached) fetched[t] = cached;
    }
  });

  return fetched;
}

/**
 * Fetch full fundamentals for a single ticker.
 */
export async function fetchSingleFundamentals(ticker) {
  const cached = getCachedFundamentals(ticker);
  if (cached) return cached;

  const data = await apiFetch(`/fundamentals?symbol=${ticker}`, 15000);
  if (data && !data.error) {
    setCachedFundamentals(ticker, data);
  }
  return data;
}
