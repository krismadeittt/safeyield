import { apiFetch } from './client';
import { getCachedQuote, setCachedQuote } from './cache';
import { ETF_DATABASE } from '../data/etfs';
import { ARISTOCRATS } from '../data/aristocrats';

/**
 * Fetch real-time quote for a single ticker.
 */
export async function fetchQuote(ticker) {
  return (await apiFetch(`/quote?symbol=${ticker}`))?.result || null;
}

/**
 * Batch fetch real-time prices for multiple tickers.
 */
export async function fetchBatchPrices(tickers) {
  return (await apiFetch(`/batch?symbols=${tickers.join(",")}`, 15000))?.results || {};
}

/**
 * Build fallback data from static ETF/Aristocrat database when API is unavailable.
 */
function buildFallback(ticker, entry) {
  const estimatedPrice = entry.div > 0 && entry.yld > 0 ? entry.div / (entry.yld / 100) : 0;
  return {
    name: entry.name,
    sector: entry.sector || null,
    price: estimatedPrice,
    change: 0,
    divYield: entry.yld || null,
    annualDiv: entry.div || null,
    payout: entry.payout ?? null,
  };
}

/**
 * Fetch enriched data for a single ticker with caching.
 * Tries API first, falls back to static data.
 */
export async function fetchEnrichedQuote(ticker) {
  const t = ticker.toUpperCase();
  const cached = getCachedQuote(t);
  if (cached) return cached;

  const staticEntry = ETF_DATABASE[t] || ARISTOCRATS.find(a => a.ticker === t) || null;

  try {
    const result = await fetchQuote(t);
    if (result && result.price > 0) {
      const data = {
        name: result.name || staticEntry?.name || t,
        sector: result.sector || staticEntry?.sector || null,
        price: result.price,
        change: result.change || 0,
        divYield: result.divYield ?? staticEntry?.yld ?? null,
        annualDiv: result.annualDiv ?? staticEntry?.div ?? null,
        payout: result.payout ?? staticEntry?.payout ?? null,
        g5: result.g5 ?? staticEntry?.g5 ?? null,
        streak: result.streak ?? staticEntry?.streak ?? null,
        marketCap: result.marketCap || null,
        week52High: result.week52High || null,
        week52Low: result.week52Low || null,
      };
      setCachedQuote(t, data);
      return data;
    }
    return staticEntry ? buildFallback(t, staticEntry) : null;
  } catch (err) {
    console.warn(`fetchEnrichedQuote(${t}):`, err.message);
    return staticEntry ? buildFallback(t, staticEntry) : null;
  }
}

/**
 * Batch price update for portfolio holdings. Chunks by 50.
 */
export async function fetchBatchUpdate(tickers) {
  try {
    const chunks = [];
    for (let i = 0; i < tickers.length; i += 50) {
      chunks.push(tickers.slice(i, i + 50));
    }
    const results = {};
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 300));
      try {
        const prices = await fetchBatchPrices(chunks[i]);
        for (const [key, val] of Object.entries(prices)) {
          const t = key.toUpperCase();
          const staticEntry = ETF_DATABASE[t] || ARISTOCRATS.find(a => a.ticker === t) || null;
          // Only set price/change from batch — dividend metrics come from fundamentals
          const existing = getCachedQuote(t);
          results[t] = {
            ...existing,
            ticker: t,
            name: existing?.name || staticEntry?.name || t,
            sector: existing?.sector || staticEntry?.sector || null,
            price: val.price || 0,
            change: val.change || 0,
          };
          setCachedQuote(t, results[t]);
        }
      } catch (err) {
        console.warn("Batch chunk failed:", err.message);
      }
    }
    return results;
  } catch (err) {
    console.warn("fetchBatchUpdate failed:", err.message);
    return {};
  }
}
