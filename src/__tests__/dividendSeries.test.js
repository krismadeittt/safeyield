import { describe, it, expect } from 'vitest';
import { buildDividendSeries } from '../utils/dividendSeries';

// =============================================================================
// buildDividendSeries — synthetic history + current + projected DPS
// =============================================================================
describe('buildDividendSeries', () => {
  it('generates correct total length: lookback + 1 (now) + horizon', () => {
    // 5 years back + current year + 5 years forward = 11 entries
    const series = buildDividendSeries(2.00, 5, 5, 5);
    expect(series).toHaveLength(11);
  });

  it('marks entries with correct kind labels', () => {
    const series = buildDividendSeries(2.00, 5, 3, 2);
    // 3 history + 1 now + 2 future = 6 total
    expect(series.filter(s => s.kind === 'history')).toHaveLength(3);
    expect(series.filter(s => s.kind === 'now')).toHaveLength(1);
    expect(series.filter(s => s.kind === 'future')).toHaveLength(2);
  });

  it('current year entry matches currentDiv exactly', () => {
    // The "now" entry should reflect the exact current dividend
    const series = buildDividendSeries(3.80, 7, 2, 2);
    const now = series.find(s => s.kind === 'now');
    expect(now.div).toBe(3.8);
  });

  it('future entries grow by g5 rate', () => {
    // At 10% growth: $2.00 → $2.20 → $2.42
    const series = buildDividendSeries(2.00, 10, 0, 2);
    const futures = series.filter(s => s.kind === 'future');
    expect(futures[0].div).toBeCloseTo(2.20, 2);
    expect(futures[1].div).toBeCloseTo(2.42, 2);
  });

  it('handles zero growth rate (flat dividends)', () => {
    // 0% growth: future dividends equal current
    const series = buildDividendSeries(2.00, 0, 0, 3);
    const futures = series.filter(s => s.kind === 'future');
    futures.forEach(f => expect(f.div).toBeCloseTo(2.00, 2));
  });

  it('handles negative growth rate (dividend cuts)', () => {
    // -10% growth: $2.00 → $1.80 → $1.62
    const series = buildDividendSeries(2.00, -10, 0, 2);
    const futures = series.filter(s => s.kind === 'future');
    expect(futures[0].div).toBeCloseTo(1.80, 2);
    expect(futures[1].div).toBeCloseTo(1.62, 2);
  });

  it('history entries never go below $0.01 floor', () => {
    // Even with extreme parameters, synthetic history should be clamped
    const series = buildDividendSeries(0.05, 50, 10, 0);
    series.filter(s => s.kind === 'history').forEach(s => {
      expect(s.div).toBeGreaterThanOrEqual(0.01);
    });
  });

  it('all entries have finite values (no NaN/Infinity)', () => {
    // Extreme g5 rate that could cause Math.pow to produce Infinity
    const series = buildDividendSeries(1.00, -95, 10, 5);
    series.forEach(s => {
      expect(isFinite(s.div)).toBe(true);
      expect(isNaN(s.div)).toBe(false);
    });
  });

  it('handles very large g5 rate without producing Infinity', () => {
    // 500% growth in history would produce enormous divisors
    const series = buildDividendSeries(2.00, 200, 5, 0);
    series.forEach(s => {
      expect(isFinite(s.div)).toBe(true);
    });
  });

  it('handles very small current dividend', () => {
    const series = buildDividendSeries(0.001, 5, 3, 3);
    series.forEach(s => {
      expect(s.div).toBeGreaterThanOrEqual(0);
      expect(isFinite(s.div)).toBe(true);
    });
  });

  it('handles very large current dividend', () => {
    const series = buildDividendSeries(1000, 5, 3, 3);
    const now = series.find(s => s.kind === 'now');
    expect(now.div).toBe(1000);
    expect(series.every(s => isFinite(s.div))).toBe(true);
  });

  it('years are sequential and correct', () => {
    const series = buildDividendSeries(2.00, 5, 2, 2);
    const currentYear = new Date().getFullYear();
    expect(series.map(s => s.yr)).toEqual([
      currentYear - 2, currentYear - 1, currentYear,
      currentYear + 1, currentYear + 2,
    ]);
  });
});
