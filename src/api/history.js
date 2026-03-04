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
 * Group actual dividend payments by period key (weekly/monthly/yearly).
 * Returns Map<periodKey, totalIncome> using same period keys as calcHistoricalPortfolioValues.
 */
export function calcDividendsByPeriod(historyMap, holdings, granularity = 'monthly') {
  const result = {};

  holdings.forEach(h => {
    const hist = historyMap[h.ticker];
    if (!hist?.d?.length || !h.shares) return;

    hist.d.forEach(div => {
      const key = periodKey(div.d, granularity);
      const income = div.v * h.shares;
      result[key] = (result[key] || 0) + income;
    });
  });

  // Round
  for (const key of Object.keys(result)) {
    result[key] = Math.round(result[key]);
  }

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
 * Compute period key for a date string based on granularity.
 * yearly: "2024", monthly: "2024-01", weekly: Monday date "2024-01-01"
 */
function periodKey(dateStr, granularity) {
  if (granularity === 'yearly') return dateStr.substring(0, 4);
  if (granularity === 'monthly') return dateStr.substring(0, 7);
  // Weekly: key = ISO Monday of that week
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + mondayOffset);
  return d.toISOString().substring(0, 10);
}

/**
 * Get portfolio values from real historical price data at the requested granularity.
 *
 * Uses growth-ratio approach: for each ticker, group daily prices by period
 * (weekly/monthly/yearly), take the last closing price per period, then compute
 * weighted total return (adjusted close) and price-only return (split-adjusted close).
 *
 * @param {Object} historyMap - { ticker: { p: [...], d: [...] }, ... }
 * @param {Array} holdings - [{ ticker, shares, ... }, ...]
 * @param {number} portfolioValue - Current portfolio value (for anchoring)
 * @param {number} [maxYearsBack=20] - How many years of history to compute
 * @param {string} [granularity='monthly'] - 'weekly', 'monthly', or 'yearly'
 * @returns {Array} - [{ date, year, value, noDripValue }, ...]
 */
export function calcHistoricalPortfolioValues(historyMap, holdings, portfolioValue, maxYearsBack = 20, granularity = 'monthly') {
  const currentYear = new Date().getFullYear();

  // Pre-compute split-adjusted close prices for each ticker
  const splitAdjusted = {};
  Object.entries(historyMap).forEach(([ticker, data]) => {
    if (data?.p?.length) {
      splitAdjusted[ticker] = computeSplitAdjustedClose(data.p);
    }
  });

  // Group each ticker's daily prices into periods, keeping last entry per period
  const tickerGroups = {}; // { TICKER: { periodKey: { date, ac, c } } }
  const cutoffYear = currentYear - maxYearsBack;

  holdings.forEach(h => {
    const hist = historyMap[h.ticker];
    if (!hist?.p?.length) return;
    const prices = hist.p;
    const adj = splitAdjusted[h.ticker] || [];
    const groups = {};

    for (let i = 0; i < prices.length; i++) {
      const date = prices[i].d;
      if (parseInt(date.substring(0, 4)) < cutoffYear) continue;
      const key = periodKey(date, granularity);
      // Always overwrite — last entry in period wins (latest closing price)
      groups[key] = {
        date,
        ac: prices[i].ac || prices[i].c,
        c: adj[i] ?? prices[i].c,
      };
    }
    tickerGroups[h.ticker] = groups;
  });

  // Collect all unique period keys, sorted
  const allPeriods = new Set();
  Object.values(tickerGroups).forEach(groups => {
    Object.keys(groups).forEach(k => allPeriods.add(k));
  });
  const sortedPeriods = [...allPeriods].sort();
  if (sortedPeriods.length < 2) return [];

  const startPeriod = sortedPeriods[0];

  // Only use tickers that have data at the start period
  const basePrices = {};
  const validHoldings = holdings.filter(h => {
    const p = tickerGroups[h.ticker]?.[startPeriod];
    if (p && p.ac > 0 && p.c > 0) { basePrices[h.ticker] = p; return true; }
    return false;
  });
  if (validHoldings.length === 0) return [];

  // For each period, compute weighted growth ratios
  const results = [];
  for (const period of sortedPeriods) {
    let weightedTotal = 0;
    let weightedPrice = 0;
    let totalWeight = 0;
    let latestDate = '';

    validHoldings.forEach(h => {
      const base = basePrices[h.ticker];
      const periodP = tickerGroups[h.ticker]?.[period];
      if (!periodP) return;

      const weight = (h.shares || 0) * base.c;
      weightedTotal += weight * (periodP.ac / base.ac);
      weightedPrice += weight * (periodP.c / base.c);
      totalWeight += weight;
      if (periodP.date > latestDate) latestDate = periodP.date;
    });

    if (totalWeight > 0) {
      results.push({
        period,
        date: latestDate,
        year: parseInt(latestDate.substring(0, 4)),
        totalGrowth: weightedTotal / totalWeight,
        priceGrowth: weightedPrice / totalWeight,
      });
    }
  }

  if (results.length === 0) return [];

  // Anchor: last period's DRIP value = portfolioValue
  const last = results[results.length - 1];
  const startValue = last.totalGrowth > 0 ? portfolioValue / last.totalGrowth : portfolioValue;

  return results.map(r => ({
    date: r.date,
    year: r.year,
    value: Math.round(startValue * r.totalGrowth),
    noDripValue: Math.round(startValue * r.priceGrowth),
  }));
}
