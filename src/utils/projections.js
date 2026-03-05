/**
 * Simple projection functions for financial metric charts.
 */

/**
 * Compound growth projection, capped at ±50% rate.
 * Returns array of { date, value } for `years` future years.
 */
export function projectGrowth(lastValue, rate, years) {
  if (lastValue == null || isNaN(lastValue)) return [];
  const cappedRate = Math.max(-0.5, Math.min(0.5, (rate || 0) / 100));
  const result = [];
  const currentYear = new Date().getFullYear();
  for (let i = 1; i <= years; i++) {
    result.push({
      date: `${currentYear + i}-01-01`,
      value: Math.round(lastValue * Math.pow(1 + cappedRate, i)),
    });
  }
  return result;
}

/**
 * Hold value constant (for margins, ratios, debt).
 * Returns array of { date, value } for `years` future years.
 */
export function projectSteady(lastValue, years) {
  if (lastValue == null || isNaN(lastValue)) return [];
  const result = [];
  const currentYear = new Date().getFullYear();
  for (let i = 1; i <= years; i++) {
    result.push({
      date: `${currentYear + i}-01-01`,
      value: lastValue,
    });
  }
  return result;
}

/**
 * Linear regression trend projection (for shares/buybacks).
 * Fits a line to the history and extrapolates.
 */
export function projectLinearTrend(history, years) {
  if (!history || history.length < 2) return [];
  const n = history.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += history[i].value;
    sumXY += i * history[i].value;
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return [];
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  const result = [];
  const currentYear = new Date().getFullYear();
  for (let i = 1; i <= years; i++) {
    const projected = intercept + slope * (n - 1 + i);
    result.push({
      date: `${currentYear + i}-01-01`,
      value: Math.round(projected),
    });
  }
  return result;
}
