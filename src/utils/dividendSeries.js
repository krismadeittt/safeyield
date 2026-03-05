/**
 * Builds a time series of dividend-per-share values:
 * synthetic history (using sinusoidal noise) + current + projected future.
 *
 * @param {number} currentDiv - Current annual dividend per share
 * @param {number} g5rate - 5-year dividend growth rate (%)
 * @param {number} lookback - Years of synthetic history to generate
 * @param {number} horizon - Years of future projection
 * @returns {Array<{yr: number, div: number, kind: string}>}
 */
export function buildDividendSeries(currentDiv, g5rate, lookback, horizon) {
  const series = [];
  const currentYear = new Date().getFullYear();

  // Synthetic history (reverse-engineer past dividends with noise)
  for (let i = lookback; i >= 1; i--) {
    const noise = 1 + Math.sin(i * 1.7 + currentDiv * 10) * 0.15;
    const base = 1 + (g5rate / 100) * noise;
    const divisor = base > 0.01 ? Math.pow(base, i) : 1;
    const pastDiv = divisor > 0 && isFinite(divisor) ? currentDiv / divisor : currentDiv;
    series.push({
      yr: currentYear - i,
      div: Math.max(0.01, isFinite(pastDiv) ? +pastDiv.toFixed(4) : 0.01),
      kind: "history",
    });
  }

  // Current year
  series.push({
    yr: currentYear,
    div: +currentDiv.toFixed(4),
    kind: "now",
  });

  // Future projection
  for (let i = 1; i <= horizon; i++) {
    const futureDiv = currentDiv * Math.pow(1 + g5rate / 100, i);
    series.push({
      yr: currentYear + i,
      div: +futureDiv.toFixed(4),
      kind: "future",
    });
  }

  return series;
}
