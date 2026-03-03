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
 * Takes holdings and returns yearly values going back as far as data allows.
 *
 * @param {Object} historyMap - { ticker: { p: [...], d: [...] }, ... }
 * @param {Array} holdings - [{ ticker, shares, ... }, ...]
 * @param {number} portfolioValue - Current portfolio value (for anchoring)
 * @returns {Array} - [{ year, value, noDripValue }, ...]
 */
export function calcHistoricalPortfolioValues(historyMap, holdings, portfolioValue) {
  const currentYear = new Date().getFullYear();
  const years = [];

  // Get the range of years we have data for
  let minYear = currentYear;
  let maxYear = 2006; // earliest data
  holdings.forEach(h => {
    const hist = historyMap[h.ticker];
    if (hist?.p?.length) {
      const firstYear = parseInt(hist.p[0].d.substring(0, 4));
      const lastYear = parseInt(hist.p[hist.p.length - 1].d.substring(0, 4));
      if (firstYear < minYear) minYear = firstYear;
      if (lastYear > maxYear) maxYear = lastYear;
    }
  });

  // For each year, calculate the portfolio value using actual prices
  // Use December 31st (or closest trading day) prices
  for (let year = Math.max(minYear, currentYear - 20); year <= currentYear; year++) {
    let totalValue = 0;
    let totalNoDripValue = 0;
    let hasData = false;

    holdings.forEach(h => {
      const hist = historyMap[h.ticker];
      if (!hist?.p) return;

      // Find the last price in this year
      const yearPrices = hist.p.filter(p => p.d.startsWith(String(year)));
      if (yearPrices.length === 0) return;

      hasData = true;
      const lastPrice = yearPrices[yearPrices.length - 1];
      const adjustedClose = lastPrice.ac || lastPrice.c;

      // Use adjusted close for DRIP value (includes reinvested dividends)
      // Use raw close for no-DRIP value
      const currentPrice = hist.p[hist.p.length - 1];
      const currentAC = currentPrice.ac || currentPrice.c;
      const currentClose = currentPrice.c;

      // Scale shares by the ratio of current value to keep portfolio anchored
      const shareValue = h.shares || 0;

      // DRIP value uses adjusted close (accounts for dividend reinvestment)
      totalValue += shareValue * adjustedClose;

      // No-DRIP uses close price (raw, no dividend reinvestment adjustment)
      totalNoDripValue += shareValue * lastPrice.c;
    });

    if (hasData) {
      years.push({
        year,
        value: Math.round(totalValue),
        noDripValue: Math.round(totalNoDripValue),
      });
    }
  }

  // Scale all values so the current year matches portfolioValue
  if (years.length > 0) {
    const lastEntry = years[years.length - 1];
    const scale = lastEntry.value > 0 ? portfolioValue / lastEntry.value : 1;
    years.forEach(y => {
      y.value = Math.round(y.value * scale);
      y.noDripValue = Math.round(y.noDripValue * scale);
    });
  }

  return years;
}
