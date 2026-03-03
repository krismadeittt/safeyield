import { MONTHLY_PAYERS, QUARTERLY_ETFS, GROUP_A, GROUP_B, GROUP_C } from '../data/dividendCalendar';

/**
 * Returns how many times per year a ticker pays dividends.
 * Monthly payers (O, MAIN, etc.) return 12, unless they're index-style ETFs.
 */
export function getPaymentFrequency(ticker) {
  const t = (ticker || "").toUpperCase();
  if (MONTHLY_PAYERS.has(t) && !QUARTERLY_ETFS.has(t)) return 12;
  return 4;
}

/**
 * Returns array of month indices (0-11) when a ticker pays dividends.
 */
export function getDividendMonths(ticker) {
  const t = (ticker || "").toUpperCase();
  if (MONTHLY_PAYERS.has(t) && getPaymentFrequency(t) === 12) {
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }
  if (GROUP_A.has(t)) return [0, 3, 6, 9];   // Jan, Apr, Jul, Oct
  if (GROUP_B.has(t)) return [1, 4, 7, 10];  // Feb, May, Aug, Nov
  if (GROUP_C.has(t)) return [2, 5, 8, 11];  // Mar, Jun, Sep, Dec
  return [1, 4, 7, 10]; // default to Group B
}

/**
 * Calculates per-month dividend income across entire portfolio.
 * Returns array of 12 monthly totals (rounded).
 */
export function calcMonthlyIncome(holdings) {
  const monthly = new Array(12).fill(0);
  holdings.forEach(h => {
    if (!h.div || !h.shares) return;
    const freq = getPaymentFrequency(h.ticker);
    const perPayment = (h.div * h.shares) / freq;
    getDividendMonths(h.ticker).forEach(mo => {
      monthly[mo] += perPayment;
    });
  });
  return monthly.map(v => Math.round(v));
}
