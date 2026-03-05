import { describe, it, expect, vi } from 'vitest';

// Mock the dividendCalendar data module so tests don't depend on real ticker data
vi.mock('../data/dividendCalendar', () => ({
  // O (Realty Income) is a monthly payer
  MONTHLY_PAYERS: new Set(['O', 'MAIN', 'STAG']),
  // SCHD is a quarterly ETF that overrides monthly payer status
  QUARTERLY_ETFS: new Set(['SCHD', 'VYM']),
  // Quarterly payment groups: Jan/Apr/Jul/Oct
  GROUP_A: new Set(['ABT', 'PEP']),
  // Feb/May/Aug/Nov
  GROUP_B: new Set(['KO', 'PG']),
  // Mar/Jun/Sep/Dec
  GROUP_C: new Set(['JNJ', 'AAPL']),
}));

import { getPaymentFrequency, getDividendMonths, calcMonthlyIncome } from '../utils/dividends';

// =============================================================================
// getPaymentFrequency — returns 12 for monthly payers, 4 for quarterly
// =============================================================================
describe('getPaymentFrequency', () => {
  it('returns 12 for known monthly payers', () => {
    // REITs like O, MAIN pay monthly
    expect(getPaymentFrequency('O')).toBe(12);
    expect(getPaymentFrequency('MAIN')).toBe(12);
  });

  it('returns 4 for quarterly payers (default)', () => {
    // Most stocks pay quarterly
    expect(getPaymentFrequency('AAPL')).toBe(4);
    expect(getPaymentFrequency('KO')).toBe(4);
  });

  it('returns 4 for unknown tickers (safe default)', () => {
    // Unknown ticker: assume quarterly (most common)
    expect(getPaymentFrequency('UNKNOWN')).toBe(4);
  });

  it('handles null/undefined/empty gracefully', () => {
    // Defensive: should not throw on bad input
    expect(getPaymentFrequency(null)).toBe(4);
    expect(getPaymentFrequency(undefined)).toBe(4);
    expect(getPaymentFrequency('')).toBe(4);
  });

  it('is case-insensitive', () => {
    // User might type lowercase
    expect(getPaymentFrequency('o')).toBe(12);
    expect(getPaymentFrequency('main')).toBe(12);
  });
});

// =============================================================================
// getDividendMonths — returns month indices when dividends are paid
// =============================================================================
describe('getDividendMonths', () => {
  it('returns all 12 months for monthly payers', () => {
    expect(getDividendMonths('O')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('returns Group A months (Jan/Apr/Jul/Oct) for Group A tickers', () => {
    expect(getDividendMonths('ABT')).toEqual([0, 3, 6, 9]);
  });

  it('returns Group B months (Feb/May/Aug/Nov) for Group B tickers', () => {
    expect(getDividendMonths('KO')).toEqual([1, 4, 7, 10]);
  });

  it('returns Group C months (Mar/Jun/Sep/Dec) for Group C tickers', () => {
    expect(getDividendMonths('JNJ')).toEqual([2, 5, 8, 11]);
  });

  it('defaults to Group B for unknown tickers', () => {
    // Most stocks default to Feb/May/Aug/Nov schedule
    expect(getDividendMonths('UNKNOWN')).toEqual([1, 4, 7, 10]);
  });

  it('handles null/undefined', () => {
    expect(getDividendMonths(null)).toEqual([1, 4, 7, 10]);
  });
});

// =============================================================================
// calcMonthlyIncome — per-month dividend income across portfolio
// =============================================================================
describe('calcMonthlyIncome', () => {
  it('calculates monthly income for a single quarterly payer', () => {
    // KO: $4.00 annual div, 100 shares, quarterly (Group B: Feb/May/Aug/Nov)
    // Per payment: (4.00 * 100) / 4 = $100
    const holdings = [{ ticker: 'KO', shares: 100, div: 4.00 }];
    const result = calcMonthlyIncome(holdings, {});
    // Should have $100 in months 1, 4, 7, 10 (Group B)
    expect(result[1]).toBe(100);
    expect(result[4]).toBe(100);
    expect(result[7]).toBe(100);
    expect(result[10]).toBe(100);
    // Other months should be $0
    expect(result[0]).toBe(0);
    expect(result[2]).toBe(0);
    // Total annual = $400
    expect(result.reduce((a, b) => a + b, 0)).toBe(400);
  });

  it('calculates monthly income for a monthly payer', () => {
    // O: $3.00 annual div, 50 shares, monthly
    // Per payment: (3.00 * 50) / 12 = $12.50
    const holdings = [{ ticker: 'O', shares: 50, div: 3.00 }];
    const result = calcMonthlyIncome(holdings, {});
    result.forEach(m => expect(m).toBeCloseTo(12.50, 2));
  });

  it('prefers live data over holding data', () => {
    // liveData annualDiv should override h.div
    const holdings = [{ ticker: 'KO', shares: 100, div: 4.00 }];
    const liveData = { KO: { annualDiv: 5.00 } };
    const result = calcMonthlyIncome(holdings, liveData);
    // Per payment: (5.00 * 100) / 4 = $125
    expect(result[1]).toBe(125);
  });

  it('returns all zeros for empty portfolio', () => {
    const result = calcMonthlyIncome([], {});
    expect(result).toEqual(new Array(12).fill(0));
  });

  it('skips holdings with zero shares', () => {
    // Zero shares should contribute nothing
    const holdings = [{ ticker: 'KO', shares: 0, div: 4.00 }];
    const result = calcMonthlyIncome(holdings, {});
    expect(result.every(m => m === 0)).toBe(true);
  });

  it('skips holdings with zero/missing dividend', () => {
    // No dividend data means no income
    const holdings = [{ ticker: 'KO', shares: 100, div: 0 }];
    const result = calcMonthlyIncome(holdings, {});
    expect(result.every(m => m === 0)).toBe(true);
  });

  it('skips holdings with null dividend', () => {
    const holdings = [{ ticker: 'KO', shares: 100, div: null }];
    const result = calcMonthlyIncome(holdings, {});
    expect(result.every(m => m === 0)).toBe(true);
  });

  it('aggregates multiple holdings correctly', () => {
    // Two holdings in different groups should not overlap
    const holdings = [
      { ticker: 'ABT', shares: 100, div: 2.00 }, // Group A: J/A/J/O
      { ticker: 'KO', shares: 100, div: 4.00 },  // Group B: F/M/A/N
    ];
    const result = calcMonthlyIncome(holdings, {});
    // ABT per payment: (2 * 100) / 4 = 50
    expect(result[0]).toBe(50);  // Jan (ABT)
    expect(result[1]).toBe(100); // Feb (KO)
    expect(result[3]).toBe(50);  // Apr (ABT)
    expect(result[4]).toBe(100); // May (KO)
    // Total annual = 200 + 400 = 600
    expect(result.reduce((a, b) => a + b, 0)).toBe(600);
  });

  it('handles very large portfolios without overflow', () => {
    const holdings = [{ ticker: 'KO', shares: 1e6, div: 4.00 }];
    const result = calcMonthlyIncome(holdings, {});
    // Per payment: (4 * 1e6) / 4 = $1,000,000
    expect(result[1]).toBe(1e6);
  });

  it('handles fractional shares correctly', () => {
    // DRIP produces fractional shares
    const holdings = [{ ticker: 'KO', shares: 10.5, div: 4.00 }];
    const result = calcMonthlyIncome(holdings, {});
    // Per payment: (4 * 10.5) / 4 = 10.5
    expect(result[1]).toBe(10.5);
  });
});
