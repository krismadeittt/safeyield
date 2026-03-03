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
 * Calculate actual historical dividend income by year from real dividend data.
 * Returns { 2015: { annual, quarters: [q1..q4], months: [m0..m11] }, ... }
 */
export function calcHistoricalDividendsByYear(historyMap, holdings) {
  const result = {};

  holdings.forEach(h => {
    const hist = historyMap[h.ticker];
    if (!hist?.d?.length || !h.shares) return;

    hist.d.forEach(div => {
      const year = parseInt(div.d.substring(0, 4));
      const month = parseInt(div.d.substring(5, 7)) - 1; // 0-11
      const quarter = Math.floor(month / 3);
      const income = div.v * h.shares;

      if (!result[year]) {
        result[year] = { annual: 0, quarters: [0, 0, 0, 0], months: new Array(12).fill(0) };
      }
      result[year].annual += income;
      result[year].quarters[quarter] += income;
      result[year].months[month] += income;
    });
  });

  // Round all values
  Object.values(result).forEach(yr => {
    yr.annual = Math.round(yr.annual);
    yr.quarters = yr.quarters.map(v => Math.round(v));
    yr.months = yr.months.map(v => Math.round(v));
  });

  return result;
}

/**
 * Compute split-adjusted close prices from raw KV price data.
 *
 * KV stores raw `c` (unadjusted close) which has discontinuities at stock
 * splits (e.g., SCHD 3:1 split: $84 → $28). The `ac` (adjusted close)
 * handles splits smoothly. We detect splits by finding days where `c`
 * drops dramatically but `ac` stays stable, then normalize all `c` values
 * to the most recent (post-split) basis.
 *
 * @param {Array} prices - [{ d, c, ac }, ...]
 * @returns {Array<number>} - split-adjusted close for each price entry
 */
function computeSplitAdjustedClose(prices) {
  const n = prices.length;
  if (n === 0) return [];

  // Work backward from the most recent price.
  // Post-all-splits basis: most recent c is already correct (factor = 1).
  // When we detect a split going backward, pre-split c values are too high
  // and need to be divided by the split ratio.
  const adjustedC = new Array(n);
  let factor = 1;
  adjustedC[n - 1] = prices[n - 1].c;

  for (let i = n - 1; i > 0; i--) {
    const cPrev = prices[i - 1].c;
    const cCurr = prices[i].c;
    if (!cPrev || !cCurr) { adjustedC[i - 1] = cPrev / factor; continue; }

    const cRatio = cCurr / cPrev;
    const acCurr = prices[i].ac || cCurr;
    const acPrev = prices[i - 1].ac || cPrev;
    const acRatio = acCurr / acPrev;

    // Forward split: c drops significantly but ac is roughly stable
    if (cRatio < 0.7 && cRatio > 0.05 && acRatio > 0.85 && acRatio < 1.15) {
      const splitRatio = Math.round(1 / cRatio);
      if (splitRatio >= 2 && splitRatio <= 10) {
        factor *= splitRatio;
      }
    }
    // Reverse split: c jumps significantly but ac is roughly stable
    else if (cRatio > 1.5 && acRatio > 0.85 && acRatio < 1.15) {
      const reverseSplitRatio = Math.round(cRatio);
      if (reverseSplitRatio >= 2 && reverseSplitRatio <= 10) {
        factor /= reverseSplitRatio;
      }
    }

    adjustedC[i - 1] = cPrev / factor;
  }

  return adjustedC;
}

/**
 * Get yearly portfolio values from real historical price data.
 *
 * Uses growth-ratio approach: for each ticker, compute total return
 * (adjusted close) and price-only return (split-adjusted close) ratios
 * from the starting year forward. Split-adjusted close accounts for
 * stock splits but NOT dividend reinvestment, so DRIP value >= noDrip.
 *
 * @param {Object} historyMap - { ticker: { p: [...], d: [...] }, ... }
 * @param {Array} holdings - [{ ticker, shares, ... }, ...]
 * @param {number} portfolioValue - Current portfolio value (for anchoring)
 * @param {number} [maxYearsBack=20] - How many years of history to compute
 * @returns {Array} - [{ year, value, noDripValue }, ...]
 */
export function calcHistoricalPortfolioValues(historyMap, holdings, portfolioValue, maxYearsBack = 20) {
  const currentYear = new Date().getFullYear();

  // Pre-compute split-adjusted close prices for each ticker
  const splitAdjusted = {};
  Object.entries(historyMap).forEach(([ticker, data]) => {
    if (data?.p?.length) {
      splitAdjusted[ticker] = computeSplitAdjustedClose(data.p);
    }
  });

  // Helper: last trading day's price in a given year
  // Returns { ac: adjusted_close, c: split_adjusted_close }
  function getYearPrice(ticker, year) {
    const hist = historyMap[ticker];
    if (!hist?.p) return null;
    const yearStr = String(year);

    // Find the last price entry for this year
    const prices = hist.p;
    let lastIdx = -1;
    for (let i = prices.length - 1; i >= 0; i--) {
      if (prices[i].d.startsWith(yearStr)) { lastIdx = i; break; }
    }
    if (lastIdx === -1) return null;

    const last = prices[lastIdx];
    const sc = splitAdjusted[ticker]?.[lastIdx] ?? last.c;
    return { ac: last.ac || last.c, c: sc };
  }

  // Find earliest year with data, capped by maxYearsBack
  let minDataYear = currentYear;
  holdings.forEach(h => {
    const hist = historyMap[h.ticker];
    if (hist?.p?.length) {
      const firstYear = parseInt(hist.p[0].d.substring(0, 4));
      if (firstYear < minDataYear) minDataYear = firstYear;
    }
  });
  const startYear = Math.max(minDataYear, currentYear - maxYearsBack);

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
      weightedPrice += weight * (yearP.c / base.c);   // price-only return (split-adjusted)
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
    noDripValue: Math.round(startValue * r.priceGrowth), // price only (split-adjusted)
  }));
}
