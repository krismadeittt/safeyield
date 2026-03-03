import { HISTORY_WORKER_URL } from '../config';

const cache = {};

/**
 * Fetch full history (prices + dividends) for a ticker.
 * Returns { s, t, r, p: [...], d: [...] } or null.
 */
export async function fetchHistory(ticker) {
  if (cache[ticker]) return cache[ticker];
  try {
    const res = await fetch(`${HISTORY_WORKER_URL}/history/${ticker}`);
    if (!res.ok) return null;
    const data = await res.json();
    cache[ticker] = data;
    return data;
  } catch {
    return null;
  }
}

/**
 * Fetch price history only.
 */
export async function fetchPriceHistory(ticker) {
  const data = await fetchHistory(ticker);
  return data?.p || [];
}

/**
 * Fetch dividend history only.
 */
export async function fetchDividendHistory(ticker) {
  const data = await fetchHistory(ticker);
  return data?.d || [];
}

/**
 * Fetch history for multiple tickers in parallel.
 * Returns { AAPL: {...}, JNJ: {...}, ... }
 */
export async function fetchBatchHistory(tickers) {
  const results = {};
  const uncached = tickers.filter(t => {
    if (cache[t]) { results[t] = cache[t]; return false; }
    return true;
  });

  if (uncached.length === 0) return results;

  // Fetch in parallel, max 10 concurrent
  const chunks = [];
  for (let i = 0; i < uncached.length; i += 10) {
    chunks.push(uncached.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const fetches = chunk.map(async ticker => {
      const data = await fetchHistory(ticker);
      if (data) results[ticker] = data;
    });
    await Promise.all(fetches);
  }

  return results;
}

/**
 * Get yearly portfolio values from real historical price data.
 *
 * Uses growth-ratio approach: for each ticker, compute total return
 * (adjusted close) and price-only return (raw close) ratios from the
 * starting year forward. This ensures DRIP value >= noDrip value at
 * every point, since total return always >= price return.
 *
 * @param {Object} historyMap - { ticker: { p: [...], d: [...] }, ... }
 * @param {Array} holdings - [{ ticker, shares, ... }, ...]
 * @param {number} portfolioValue - Current portfolio value (for anchoring)
 * @returns {Array} - [{ year, value, noDripValue }, ...]
 */
export function calcHistoricalPortfolioValues(historyMap, holdings, portfolioValue) {
  const currentYear = new Date().getFullYear();

  // Helper: last trading day's price in a given year
  function getYearPrice(ticker, year) {
    const hist = historyMap[ticker];
    if (!hist?.p) return null;
    const yearStr = String(year);
    const yearPrices = hist.p.filter(p => p.d.startsWith(yearStr));
    if (yearPrices.length === 0) return null;
    const last = yearPrices[yearPrices.length - 1];
    return { ac: last.ac || last.c, c: last.c };
  }

  // Find earliest year with data
  let minDataYear = currentYear;
  holdings.forEach(h => {
    const hist = historyMap[h.ticker];
    if (hist?.p?.length) {
      const firstYear = parseInt(hist.p[0].d.substring(0, 4));
      if (firstYear < minDataYear) minDataYear = firstYear;
    }
  });
  const startYear = Math.max(minDataYear, currentYear - 20);

  // Only use tickers that have price data at the start year
  const basePrices = {};
  const validHoldings = holdings.filter(h => {
    const p = getYearPrice(h.ticker, startYear);
    if (p && p.ac > 0 && p.c > 0) { basePrices[h.ticker] = p; return true; }
    return false;
  });
  if (validHoldings.length === 0) return [];

  // Year by year: compute weighted growth ratios from startYear
  const results = [];
  for (let year = startYear; year <= currentYear; year++) {
    let weightedTotal = 0;
    let weightedPrice = 0;
    let totalWeight = 0;

    validHoldings.forEach(h => {
      const base = basePrices[h.ticker];
      const yearP = getYearPrice(h.ticker, year);
      if (!yearP) return;

      const weight = (h.shares || 0) * base.c; // weight by starting dollar value
      weightedTotal += weight * (yearP.ac / base.ac); // total return (includes divs)
      weightedPrice += weight * (yearP.c / base.c);   // price-only return
      totalWeight += weight;
    });

    if (totalWeight > 0) {
      results.push({
        year,
        totalGrowth: weightedTotal / totalWeight,
        priceGrowth: weightedPrice / totalWeight,
      });
    }
  }

  if (results.length === 0) return [];

  // Anchor: last year's DRIP value = portfolioValue
  const last = results[results.length - 1];
  const startValue = last.totalGrowth > 0 ? portfolioValue / last.totalGrowth : portfolioValue;

  return results.map(r => ({
    year: r.year,
    value: Math.round(startValue * r.totalGrowth),       // with DRIP (always >= noDripValue)
    noDripValue: Math.round(startValue * r.priceGrowth), // price only
  }));
}
