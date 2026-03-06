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
// calcHistoricalPortfolioValues — direct price-based portfolio valuation
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

  it('computes direct shares × price + cash', () => {
    // 100 shares, prices go 40→50→60. Portfolio value = 6500 (100×60 + 500 cash)
    const historyMap = {
      KO: {
        p: [
          { d: '2023-01-15', c: 40, ac: 40 },
          { d: '2024-01-15', c: 50, ac: 50 },
          { d: '2025-01-15', c: 60, ac: 60 },
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    // portfolioValue = 6500 → impliedCash = 6500 - (100×60) = 500
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 6500, 20, 'yearly');
    // First period: 100×40 + 500 = 4500
    expect(result[0].value).toBe(4500);
    // Second period: 100×50 + 500 = 5500
    expect(result[1].value).toBe(5500);
    // Last period: 100×60 + 500 = 6500
    expect(result[2].value).toBe(6500);
  });

  it('noDripValue equals value (no DRIP in historical)', () => {
    const historyMap = {
      KO: {
        p: [
          { d: '2023-01-15', c: 50, ac: 50 },
          { d: '2024-01-15', c: 52, ac: 56 }, // ac differs but should be ignored
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 100 }];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 5000, 20, 'yearly');
    result.forEach(r => {
      expect(r.noDripValue).toBe(r.value);
    });
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
    // Should still produce results from KO
    expect(result.length).toBeGreaterThan(0);
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
    // KO: 100×55=5500, PEP: 50×160=8000. Total stock=13500
    // portfolioValue=15500 → cash=2000
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 15500, 20, 'yearly');
    expect(result.length).toBeGreaterThan(0);
    // First: KO 100×50=5000 + PEP 50×150=7500 + 2000 = 14500
    expect(result[0].value).toBe(14500);
    // Last: KO 100×55=5500 + PEP 50×160=8000 + 2000 = 15500
    expect(result[result.length - 1].value).toBe(15500);
    result.forEach(r => {
      expect(isFinite(r.value)).toBe(true);
    });
  });

  it('carries forward last known price for missing periods', () => {
    // KO has data for both periods, PEP only first
    const historyMap = {
      KO: {
        p: [
          { d: '2023-01-15', c: 50, ac: 50 },
          { d: '2024-01-15', c: 60, ac: 60 },
        ],
      },
      PEP: {
        p: [
          { d: '2023-01-15', c: 100, ac: 100 },
          // No 2024 data — carry forward 100
        ],
      },
    };
    const holdings = [
      { ticker: 'KO', shares: 100 },
      { ticker: 'PEP', shares: 50 },
    ];
    // Latest: KO 100×60=6000, PEP 50×100=5000, total stock=11000
    // portfolioValue=12000 → cash=1000
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 12000, 20, 'yearly');
    // Period 2024: KO 100×60=6000, PEP carry-forward 50×100=5000, + 1000 = 12000
    const last = result[result.length - 1];
    expect(last.value).toBe(12000);
  });

  it('handles partial ticker data (one starts later)', () => {
    const historyMap = {
      KO: {
        p: [
          { d: '2022-01-15', c: 40, ac: 40 },
          { d: '2023-01-15', c: 50, ac: 50 },
          { d: '2024-01-15', c: 60, ac: 60 },
        ],
      },
      // NEW ticker only has 2024 data
      NEW: {
        p: [
          { d: '2024-01-15', c: 20, ac: 20 },
        ],
      },
    };
    const holdings = [
      { ticker: 'KO', shares: 100 },
      { ticker: 'NEW', shares: 50 },
    ];
    // Latest: KO 100×60=6000, NEW 50×20=1000, total=7000
    // portfolioValue=8000 → cash=1000
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 8000, 20, 'yearly');
    expect(result.length).toBe(3); // 2022, 2023, 2024
    // 2022: KO 100×40=4000 + NEW not yet available (0) + 1000 = 5000
    expect(result[0].value).toBe(5000);
    // 2024: KO 100×60=6000 + NEW 50×20=1000 + 1000 = 8000
    expect(result[result.length - 1].value).toBe(8000);
  });

  it('skips holdings with zero shares', () => {
    const historyMap = {
      KO: {
        p: [
          { d: '2023-01-15', c: 50, ac: 50 },
          { d: '2024-01-15', c: 55, ac: 55 },
        ],
      },
    };
    const holdings = [{ ticker: 'KO', shares: 0 }];
    const result = calcHistoricalPortfolioValues(historyMap, holdings, 5000, 20, 'yearly');
    expect(result).toEqual([]);
  });
});
