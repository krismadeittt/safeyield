import { describe, it, expect } from 'vitest';
import {
  calcFederalTax, calcEffectiveRate, getMarginalRate,
  getQualifiedRate, calcNIIT, calcDividendTax, calcPortfolioAfterTax,
} from '../utils/tax';

describe('calcFederalTax', () => {
  it('returns 0 for 0 income', () => {
    expect(calcFederalTax(0, 'single')).toBe(0);
  });

  it('returns 0 for negative income', () => {
    expect(calcFederalTax(-1000, 'single')).toBe(0);
  });

  it('calculates first bracket only (single)', () => {
    // $10,000 at 10% = $1,000
    expect(calcFederalTax(10000, 'single')).toBe(1000);
  });

  it('calculates across two brackets (single)', () => {
    // $20,000: first 11,600 at 10% + remaining 8,400 at 12%
    var tax = calcFederalTax(20000, 'single');
    expect(tax).toBeCloseTo(11600 * 0.10 + 8400 * 0.12, 2);
  });

  it('calculates for married filing jointly', () => {
    // $20,000: first 23,200 at 10% → only 20k
    expect(calcFederalTax(20000, 'married_joint')).toBe(2000);
  });

  it('handles high income (single)', () => {
    var tax = calcFederalTax(1000000, 'single');
    expect(tax).toBeGreaterThan(300000); // Effective rate > 30%
    expect(tax).toBeLessThan(370000);    // Max rate 37%
  });

  it('handles head of household', () => {
    // $10,000: all in 10% bracket
    expect(calcFederalTax(10000, 'head_of_household')).toBe(1000);
  });

  it('defaults to single for unknown filing status', () => {
    expect(calcFederalTax(10000, 'unknown')).toBe(calcFederalTax(10000, 'single'));
  });
});

describe('calcEffectiveRate', () => {
  it('returns 0 for 0 income', () => {
    expect(calcEffectiveRate(0, 'single')).toBe(0);
  });

  it('calculates correct effective rate', () => {
    // $50,000 single: should be between 10% and 22%
    var rate = calcEffectiveRate(50000, 'single');
    expect(rate).toBeGreaterThan(10);
    expect(rate).toBeLessThan(22);
  });
});

describe('getMarginalRate', () => {
  it('returns 10% for low income', () => {
    expect(getMarginalRate(5000, 'single')).toBe(10);
  });

  it('returns 22% for mid income (single)', () => {
    expect(getMarginalRate(80000, 'single')).toBe(22);
  });

  it('returns 37% for very high income', () => {
    expect(getMarginalRate(700000, 'single')).toBe(37);
  });
});

describe('getQualifiedRate', () => {
  it('returns 0% for low income (single)', () => {
    expect(getQualifiedRate(40000, 'single')).toBe(0);
  });

  it('returns 15% for mid income (single)', () => {
    expect(getQualifiedRate(100000, 'single')).toBe(15);
  });

  it('returns 20% for high income (single)', () => {
    expect(getQualifiedRate(600000, 'single')).toBe(20);
  });

  it('returns 0% for MFJ under threshold', () => {
    expect(getQualifiedRate(90000, 'married_joint')).toBe(0);
  });
});

describe('calcNIIT', () => {
  it('returns 0 below threshold (single)', () => {
    expect(calcNIIT(150000, 50000, 'single')).toBe(0);
  });

  it('calculates NIIT above threshold (single)', () => {
    // AGI 250k, investment income 100k, threshold 200k
    // NIIT base = min(250k-200k, 100k) = 50k
    // NIIT = 50k * 3.8% = 1900
    expect(calcNIIT(250000, 100000, 'single')).toBe(1900);
  });

  it('limits NIIT to investment income', () => {
    // AGI 500k, investment income 20k, threshold 200k
    // NIIT base = min(300k, 20k) = 20k
    // NIIT = 20k * 3.8% = 760
    expect(calcNIIT(500000, 20000, 'single')).toBe(760);
  });
});

describe('calcDividendTax', () => {
  it('returns zero tax with no profile', () => {
    var result = calcDividendTax(1000, 'qualified', null);
    expect(result.grossAmount).toBe(1000);
    expect(result.taxAmount).toBe(0);
    expect(result.netAmount).toBe(1000);
  });

  it('returns zero for zero amount', () => {
    var result = calcDividendTax(0, 'qualified', { qualified_rate: 15 });
    expect(result.taxAmount).toBe(0);
  });

  it('applies qualified rate', () => {
    var result = calcDividendTax(1000, 'qualified', {
      qualified_rate: 15, state_rate: 5, local_rate: 0,
    });
    expect(result.taxAmount).toBe(200); // 1000 * 20%
    expect(result.netAmount).toBe(800);
    expect(result.effectiveRate).toBe(20);
  });

  it('applies ordinary rate', () => {
    var result = calcDividendTax(1000, 'ordinary', {
      ordinary_rate: 24, state_rate: 5, local_rate: 0,
    });
    expect(result.taxAmount).toBe(290); // 1000 * 29%
    expect(result.netAmount).toBe(710);
  });

  it('applies partial rate (average of qualified and ordinary)', () => {
    var result = calcDividendTax(1000, 'partial', {
      qualified_rate: 15, ordinary_rate: 24, state_rate: 0, local_rate: 0,
    });
    // Federal = (15 + 24) / 2 = 19.5%
    expect(result.taxAmount).toBe(195);
  });

  it('caps total rate at 99.9%', () => {
    var result = calcDividendTax(1000, 'ordinary', {
      ordinary_rate: 50, state_rate: 40, local_rate: 20,
    });
    // Would be 110% but capped at 99.9%
    expect(result.taxAmount).toBe(999);
  });
});

describe('calcPortfolioAfterTax', () => {
  it('calculates totals across holdings', () => {
    var holdings = [
      { ticker: 'AAPL', shares: 100, div: 0.96 },
      { ticker: 'O', shares: 50, div: 3.08 },
    ];
    var liveData = {
      AAPL: { annualDiv: 0.96 },
      O: { annualDiv: 3.08 },
    };
    var profile = { qualified_rate: 15, ordinary_rate: 24, state_rate: 5, local_rate: 0 };
    function getTaxClass(t) { return t === 'O' ? 'partial' : 'qualified'; }

    var result = calcPortfolioAfterTax(holdings, liveData, profile, getTaxClass);
    expect(result.totalGross).toBeCloseTo(96 + 154, 0);
    expect(result.totalTax).toBeGreaterThan(0);
    expect(result.totalNet).toBeLessThan(result.totalGross);
    expect(result.taxDragPct).toBeGreaterThan(0);
    expect(result.perHolding.length).toBe(2);
    expect(result.perHolding[0].ticker).toBe('AAPL');
    expect(result.perHolding[0].classification).toBe('qualified');
  });

  it('handles empty portfolio', () => {
    var result = calcPortfolioAfterTax([], {}, {}, () => 'qualified');
    expect(result.totalGross).toBe(0);
    expect(result.totalTax).toBe(0);
    expect(result.totalNet).toBe(0);
    expect(result.taxDragPct).toBe(0);
  });
});
