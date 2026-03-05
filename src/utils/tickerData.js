/**
 * Unified ticker data extraction — single source of truth for resolving
 * live API data vs static stock data. All display components should use
 * this to ensure consistent values across pages.
 *
 * Priority: live API data → static stock data → default
 *
 * @param {object} live - liveData[ticker] from API (may be null/undefined)
 * @param {object} stock - static holding/stock object
 * @returns {object} resolved metrics
 */
export function extractTickerMetrics(live, stock) {
  return {
    price: (live?.price > 0 ? live.price : null) || stock?.price || 0,
    divYield: (live?.divYield > 0 ? live.divYield : null) ?? stock?.yld ?? 0,
    annualDiv: (live?.annualDiv > 0 ? live.annualDiv : null) ?? stock?.div ?? 0,
    g5: live?.g5 ?? stock?.g5 ?? 0,
    payout: live?.payout ?? stock?.payout ?? null,
    streak: Math.max(live?.streak ?? 0, stock?.streak ?? 0),
    change: live?.change ?? 0,
    beta: live?.beta ?? 1.0,
  };
}
