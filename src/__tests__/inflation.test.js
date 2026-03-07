import { describe, it, expect } from 'vitest';
import {
  adjustForInflation, calcRealGrowthRate, projectRealIncome,
  getInflationRate, getCPIForYear,
} from '../utils/inflation';

describe('getCPIForYear', () => {
  it('returns exact CPI for known years', () => {
    expect(getCPIForYear(2020)).toBe(258.8);
    expect(getCPIForYear(2025)).toBe(321.943);
  });

  it('returns CPI for first available year', () => {
    expect(getCPIForYear(2014)).toBe(236.7);
  });

  it('extrapolates for future years', () => {
    var cpi2026 = getCPIForYear(2026);
    expect(cpi2026).toBeGreaterThan(321.0);
  });

  it('extrapolates for past years', () => {
    var cpi2013 = getCPIForYear(2013);
    expect(cpi2013).toBeLessThan(236.7);
    expect(cpi2013).toBeGreaterThan(200);
  });
});

describe('adjustForInflation', () => {
  it('adjusts from 2020 to 2025 correctly', () => {
    // $100 in 2020 dollars → 2025 dollars
    // CPI ratio: 321.0 / 258.8 ≈ 1.2403
    var result = adjustForInflation(100, 2020, 2025);
    expect(result).toBeCloseTo(124.03, 0);
  });

  it('adjusts from 2025 to 2020 (deflation direction)', () => {
    var result = adjustForInflation(100, 2025, 2020);
    expect(result).toBeLessThan(100);
    expect(result).toBeGreaterThan(70);
  });

  it('returns same amount for same year', () => {
    expect(adjustForInflation(100, 2022, 2022)).toBe(100);
  });

  it('returns 0 for zero amount', () => {
    expect(adjustForInflation(0, 2020, 2025)).toBe(0);
  });

  it('handles null amount', () => {
    expect(adjustForInflation(null, 2020, 2025)).toBe(0);
  });
});

describe('calcRealGrowthRate', () => {
  it('calculates Fisher equation correctly', () => {
    // Nominal 5%, inflation 3%
    // Real = (1.05 / 1.03) - 1 ≈ 0.01942
    var real = calcRealGrowthRate(0.05, 0.03);
    expect(real).toBeCloseTo(0.01942, 4);
  });

  it('returns negative real rate when inflation exceeds nominal', () => {
    var real = calcRealGrowthRate(0.02, 0.05);
    expect(real).toBeLessThan(0);
  });

  it('returns nominal rate when inflation is 0', () => {
    var real = calcRealGrowthRate(0.05, 0);
    expect(real).toBeCloseTo(0.05, 5);
  });

  it('handles zero nominal growth', () => {
    var real = calcRealGrowthRate(0, 0.03);
    expect(real).toBeLessThan(0);
    expect(real).toBeCloseTo(-0.02913, 4);
  });
});

describe('getInflationRate', () => {
  it('returns 0 for same year', () => {
    expect(getInflationRate(2020, 2020)).toBe(0);
  });

  it('returns positive rate for recent years', () => {
    var rate = getInflationRate(2020, 2025);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.10); // Should be reasonable
  });

  it('calculates 5-year average correctly', () => {
    var rate = getInflationRate(2020, 2025);
    // CPI went from 258.8 to 321.0 over 5 years
    // Annual rate = (321.0/258.8)^(1/5) - 1 ≈ 4.4%
    expect(rate).toBeCloseTo(0.044, 2);
  });

  it('handles reversed year order', () => {
    var rate = getInflationRate(2025, 2020);
    // Should still return a rate (negative direction)
    expect(rate).toBeLessThan(0);
  });
});

describe('projectRealIncome', () => {
  it('produces correct array length', () => {
    var result = projectRealIncome(10000, 10, 0.03, 0.025);
    expect(result.length).toBe(11); // year 0 through year 10
  });

  it('first entry matches current income', () => {
    var result = projectRealIncome(10000, 5, 0.03, 0.025);
    expect(result[0].nominal).toBe(10000);
    expect(result[0].real).toBe(10000);
  });

  it('nominal grows at nominal rate', () => {
    var result = projectRealIncome(10000, 1, 0.05, 0.03);
    expect(result[1].nominal).toBeCloseTo(10500, 0);
  });

  it('real grows slower than nominal when inflation > 0', () => {
    var result = projectRealIncome(10000, 10, 0.05, 0.03);
    var last = result[result.length - 1];
    expect(last.nominal).toBeGreaterThan(last.real);
  });

  it('real equals nominal when inflation is 0', () => {
    var result = projectRealIncome(10000, 5, 0.05, 0);
    for (var i = 0; i < result.length; i++) {
      expect(result[i].nominal).toBeCloseTo(result[i].real, 1);
    }
  });

  it('handles zero income', () => {
    var result = projectRealIncome(0, 5, 0.03, 0.025);
    expect(result.length).toBe(6);
    expect(result[0].nominal).toBe(0);
    expect(result[5].nominal).toBe(0);
  });
});
