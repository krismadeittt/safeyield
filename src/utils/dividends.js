import { MONTHLY_PAYERS, QUARTERLY_ETFS, GROUP_A, GROUP_B, GROUP_C } from '../data/dividendCalendar';

/**
 * Derive payment frequency and months from actual dividend history data.
 * Input: [[yearMonth, amount], ...] e.g. [[202312, 0.24], [202403, 0.24]]
 * Output: { freq: 4, months: [1, 4, 7, 10] } or null if insufficient data.
 */
export function deriveDividendSchedule(divEntries) {
  if (!divEntries?.length || divEntries.length < 2) return null;

  // Filter to last 24 months of data
  const sorted = [...divEntries].sort((a, b) => a[0] - b[0]);
  const latestYm = sorted[sorted.length - 1][0];
  const cutoffYm = latestYm - 200; // roughly 24 months back (e.g. 202403 - 200 = 202203)
  const recent = sorted.filter(e => e[0] >= cutoffYm);
  if (recent.length < 2) return null;

  // Count occurrences per month (0-indexed)
  const monthCounts = new Array(12).fill(0);
  recent.forEach(([ym]) => {
    const month = (ym % 100) - 1; // convert 1-12 to 0-11
    if (month >= 0 && month < 12) monthCounts[month]++;
  });

  const activeMonths = monthCounts
    .map((count, idx) => ({ idx, count }))
    .filter(m => m.count > 0)
    .sort((a, b) => b.count - a.count); // most frequent first

  const uniqueCount = activeMonths.length;

  if (uniqueCount === 0) return null;

  // Determine frequency and payment months
  if (uniqueCount >= 10) {
    // Monthly payer
    return { freq: 12, months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
  }
  if (uniqueCount >= 3 && uniqueCount <= 5) {
    // Quarterly — take the 4 most frequent months
    const months = activeMonths.slice(0, 4).map(m => m.idx).sort((a, b) => a - b);
    return { freq: months.length, months };
  }
  if (uniqueCount === 2) {
    // Semi-annual
    const months = activeMonths.map(m => m.idx).sort((a, b) => a - b);
    return { freq: 2, months };
  }
  if (uniqueCount === 1) {
    // Annual
    return { freq: 1, months: [activeMonths[0].idx] };
  }
  // 6-9 unique months — likely monthly with gaps; treat as monthly
  return { freq: uniqueCount, months: activeMonths.map(m => m.idx).sort((a, b) => a - b) };
}

/**
 * Returns how many times per year a ticker pays dividends.
 * Checks dynamic scheduleMap first, falls back to hardcoded calendar.
 */
export function getPaymentFrequency(ticker, scheduleMap) {
  const t = (ticker || "").toUpperCase();
  if (scheduleMap?.[t]?.freq) return scheduleMap[t].freq;
  if (MONTHLY_PAYERS.has(t) && !QUARTERLY_ETFS.has(t)) return 12;
  return 4;
}

/**
 * Returns array of month indices (0-11) when a ticker pays dividends.
 * Checks dynamic scheduleMap first, falls back to hardcoded calendar.
 */
export function getDividendMonths(ticker, scheduleMap) {
  const t = (ticker || "").toUpperCase();
  if (scheduleMap?.[t]?.months) return scheduleMap[t].months;
  if (MONTHLY_PAYERS.has(t) && !QUARTERLY_ETFS.has(t)) {
    return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  }
  if (GROUP_A.has(t)) return [0, 3, 6, 9];   // Jan, Apr, Jul, Oct
  if (GROUP_B.has(t)) return [1, 4, 7, 10];  // Feb, May, Aug, Nov
  if (GROUP_C.has(t)) return [2, 5, 8, 11];  // Mar, Jun, Sep, Dec
  return [1, 4, 7, 10]; // default to Group B
}

/**
 * Calculates per-month dividend income across entire portfolio.
 * Uses live dividend data when available, falls back to h.div.
 * Optional scheduleMap provides dynamic payment months from API data.
 * Returns array of 12 unrounded monthly totals (consumers round at display time).
 */
export function calcMonthlyIncome(holdings, liveData, scheduleMap) {
  const monthly = new Array(12).fill(0);
  holdings.forEach(h => {
    const live = liveData?.[h.ticker];
    const div = live?.annualDiv ?? h.div;
    if (!div || !h.shares) return;
    const freq = getPaymentFrequency(h.ticker, scheduleMap);
    const perPayment = (div * h.shares) / freq;
    getDividendMonths(h.ticker, scheduleMap).forEach(mo => {
      monthly[mo] += perPayment;
    });
  });
  return monthly;
}
