import { describe, it, expect } from 'vitest';
import { calcHistoricalDividendsByYear, calcHistoricalPortfolioValues } from '../api/history';

// =============================================================================
// calcHistoricalDividendsByYear — aggregates dividend income by year
// =============================================================================
describe('calcHistoricalDividendsByYear', () => {
  it('aggregates dividends by year, quarter, and month', () => {
    // Two dividends in 2024: one in Q1 (Jan), one in Q2 (Apr)
    const historyMap = {
      KO: {
        d: [
          { d: '2024-01-15', v: 0.50 },
          { d: '2024-04-15', v: 0.50 },
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalDividendsByYear(historyMap, holdings);
    // Annual: (0.50 + 0.50) × 100 = $100, rounded
    expect(result[2024].annual).toBe(100);
    // Q1 (Jan): $50, Q2 (Apr): $50
    expect(result[2024].quarters[0]).toBe(50);
    expect(result[2024].quarters[1]).toBe(50);
    // Month 0 (Jan): $50, Month 3 (Apr): $50
    expect(result[2024].months[0]).toBe(50);
    expect(result[2024].months[3]).toBe(50);
  });

  it('handles multiple tickers', () => {
    const historyMap = {
      KO: { d: [{ d: '2024-03-15', v: 0.50 }] },
      PEP: { d: [{ d: '2024-03-15', v: 0.60 }] },
    };
    const holdings = [
      { ticker: 'KO', shares: 100 },
      { ticker: 'PEP', shares: 200 },
    ];
    const result = calcHistoricalDividendsByYear(historyMap, holdings);
    // KO: 0.50 × 100 = 50, PEP: 0.60 × 200 = 120, total = 170
    expect(result[2024].annual).toBe(170);
  });

  it('returns empty object for empty holdings', () => {
    expect(calcHistoricalDividendsByYear({}, [])).toEqual({});
  });

  it('skips holdings with zero shares', () => {
    const historyMap = { KO: { d: [{ d: '2024-01-15', v: 0.50 }] } };
    const holdings = [{ ticker: 'KO', shares: 0 }];
    const result = calcHistoricalDividendsByYear(historyMap, holdings);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips tickers with no dividend history', () => {
    const historyMap = { KO: { d: [] } };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalDividendsByYear(historyMap, holdings);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips tickers missing from historyMap', () => {
    const holdings = [{ ticker: 'MISSING', shares: 100 }];
    const result = calcHistoricalDividendsByYear({}, holdings);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('rounds values to nearest dollar', () => {
    // $0.333 × 3 shares = $0.999 → rounds to $1
    const historyMap = { KO: { d: [{ d: '2024-01-15', v: 0.333 }] } };
    const holdings = [{ ticker: 'KO', shares: 3 }];
    const result = calcHistoricalDividendsByYear(historyMap, holdings);
    expect(result[2024].annual).toBe(1);
  });

  it('handles dividends across multiple years', () => {
    const historyMap = {
      KO: {
        d: [
          { d: '2023-06-15', v: 0.50 },
          { d: '2024-06-15', v: 0.55 },
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalDividendsByYear(historyMap, holdings);
    expect(result[2023].annual).toBe(50);
    expect(result[2024].annual).toBe(55);
  });
});

// =============================================================================
// calcHistoricalPortfolioValues — price-only ratio-based portfolio valuation
// =============================================================================
describe('calcHistoricalPortfolioValues', () => {
  it('returns values anchored to current portfolio value', () => {
    const historyMap = {
      KO: {
        p: [
          { d: '2023-01-15', c: 50, ac: 50 },
          { d: '2024-01-15', c: 55, ac: 55 },
          { d: '2025-01-15', c: 60, ac: 60 },
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 6000, 20, 'yearly');
    expect(result.length).toBeGreaterThan(0);
    // Last value should equal portfolioValue (anchor point)
    const last = result[result.length - 1];
    expect(last.value).toBe(6000);
  });

  it('noDripValue equals value (no DRIP in historical)', () => {
    const historyMap = {
      KO: {
        p: [
          { d: '2023-01-15', c: 50, ac: 50 },
          { d: '2024-01-15', c: 52, ac: 56 }, // ac differs but ignored for value
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 5000, 20, 'yearly');
    result.forEach(r => {
      expect(r.noDripValue).toBe(r.value);
    });
  });

  it('historical values scale correctly by price ratio', () => {
    // Price doubles from 50→100, so historical should be half of portfolioValue
    const historyMap = {
      KO: {
        p: [
          { d: '2023-01-15', c: 50, ac: 50 },
          { d: '2025-01-15', c: 100, ac: 100 },
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 10000, 20, 'yearly');
    expect(result[0].value).toBe(5000); // 50/100 * 10000
    expect(result[1].value).toBe(10000); // 100/100 * 10000
  });

  it('returns empty for insufficient data (< 2 periods)', () => {
    const historyMap = {
      KO: { p: [{ d: '2024-01-15', c: 50, ac: 50 }] },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 5000);
    expect(result).toEqual([]);
  });

  it('returns empty for no holdings', () => {
    const result = calcHistoricalPortfolioValues({}, [], 5000);
    expect(result).toEqual([]);
  });

  it('returns empty when all base prices are zero', () => {
    const historyMap = {
      KO: {
        p: [
          { d: '2023-01-15', c: 0, ac: 0 },
          { d: '2024-01-15', c: 50, ac: 50 },
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 5000, 20, 'yearly');
    expect(result).toEqual([]);
  });

  it('all values are finite (no NaN from division)', () => {
    const historyMap = {
      KO: {
        p: [
          { d: '2020-01-15', c: 40, ac: 40 },
          { d: '2021-01-15', c: 45, ac: 46 },
          { d: '2022-01-15', c: 50, ac: 52 },
          { d: '2023-01-15', c: 55, ac: 58 },
          { d: '2024-01-15', c: 60, ac: 64 },
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 6000, 20, 'yearly');
    result.forEach(r => {
      expect(isFinite(r.value)).toBe(true);
      expect(isFinite(r.noDripValue)).toBe(true);
    });
  });

  it('handles missing ticker in historyMap gracefully', () => {
    const historyMap = {
      KO: {
        p: [
          { d: '2023-01-15', c: 50, ac: 50 },
          { d: '2024-01-15', c: 55, ac: 55 },
        ],
      },
    };
    // PEP is in holdings but not in historyMap — should be skipped
    const holdings = [
      { ticker: 'KO', shares: 100 },
      { ticker: 'PEP', shares: 50 },
    ];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 5000, 20, 'yearly');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles 20:1 forward split correctly via ac-based detection', () => {
    // Stock has a 20:1 split: pre-split c=$2000, post-split c=$100
    // ac stays smooth across the split (data provider handles it)
    const historyMap = {
      AMZN: {
        p: [
          { d: '2021-01-15', c: 1800, ac: 90 },  // pre-split, ac adjusted
          { d: '2022-01-15', c: 2000, ac: 100 },  // pre-split, ac adjusted
          { d: '2022-07-15', c: 100,  ac: 100 },  // post-split day (20:1)
          { d: '2023-01-15', c: 120,  ac: 120 },  // post-split
          { d: '2024-01-15', c: 150,  ac: 150 },  // latest
        ],
      },
    };
    const holdings = [{ ticker: 'AMZN', shares: 100 }];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 15000, 20, 'yearly');
    // After split adjustment: 2021 c=1800/20=90, 2022pre c=2000/20=100
    // Price ratio 2021→latest: 90/150 = 0.6, so 2021 value = 15000 * 0.6 = 9000
    expect(result.length).toBeGreaterThan(0);
    const last = result[result.length - 1];
    expect(last.value).toBe(15000); // anchored
    // First value should be LESS than current (stock grew from 90→150)
    expect(result[0].value).toBeLessThan(15000);
    // Should NOT show an inflated value like 180000 from undetected split
    expect(result[0].value).toBeLessThan(20000);
  });

  it('handles multiple tickers with overlapping dates', () => {
    const historyMap = {
      KO: {
        p: [
          { d: '2023-06-15', c: 50, ac: 50 },
          { d: '2024-06-15', c: 55, ac: 55 },
        ],
      },
      PEP: {
        p: [
          { d: '2023-06-15', c: 150, ac: 150 },
          { d: '2024-06-15', c: 160, ac: 160 },
        ],
      },
    };
    const holdings = [
      { ticker: 'KO', shares: 100 },
      { ticker: 'PEP', shares: 50 },
    ];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 15500, 20, 'yearly');
    expect(result.length).toBeGreaterThan(0);
    // Last value = portfolioValue
    expect(result[result.length - 1].value).toBe(15500);
    result.forEach(r => {
      expect(isFinite(r.value)).toBe(true);
    });
  });
});
