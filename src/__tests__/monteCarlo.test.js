import { describe, it, expect } from 'vitest';
import { seededPRNG, boxMuller, projectPortfolioPerStock } from '../utils/monteCarlo';

// =============================================================================
// seededPRNG — deterministic pseudo-random number generator
// =============================================================================
describe('seededPRNG', () => {
  it('returns values in [0, 1] range', () => {
    const rng = seededPRNG(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic — same seed produces same sequence', () => {
    // Financial simulations must be reproducible for the same seed
    const rng1 = seededPRNG(42);
    const rng2 = seededPRNG(42);
    for (let i = 0; i < 100; i++) {
      expect(rng1()).toBe(rng2());
    }
  });

  it('different seeds produce different sequences', () => {
    const rng1 = seededPRNG(1);
    const rng2 = seededPRNG(2);
    // At least one of the first 10 values should differ
    let allSame = true;
    for (let i = 0; i < 10; i++) {
      if (rng1() !== rng2()) allSame = false;
    }
    expect(allSame).toBe(false);
  });

  it('handles seed = 0 without breaking', () => {
    const rng = seededPRNG(0);
    const v = rng();
    expect(isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  it('handles very large seed', () => {
    const rng = seededPRNG(2**31 - 1);
    const v = rng();
    expect(isFinite(v)).toBe(true);
  });

  it('handles negative seed (via unsigned right shift)', () => {
    // >>> 0 converts to unsigned 32-bit integer
    const rng = seededPRNG(-1);
    const v = rng();
    expect(isFinite(v)).toBe(true);
  });
});

// =============================================================================
// boxMuller — transforms uniform [0,1] to standard normal distribution
// =============================================================================
describe('boxMuller', () => {
  it('produces values with mean near 0 and stddev near 1', () => {
    // Statistical test: 10000 samples should have mean ≈ 0 and std ≈ 1
    const rng = seededPRNG(42);
    const samples = [];
    for (let i = 0; i < 10000; i++) {
      samples.push(boxMuller(rng));
    }
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
    const std = Math.sqrt(variance);
    // Within reasonable tolerance for 10k samples
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.abs(std - 1)).toBeLessThan(0.05);
  });

  it('never produces NaN or Infinity', () => {
    // The Math.max(1e-10, rng()) guard should prevent log(0)
    const rng = seededPRNG(42);
    for (let i = 0; i < 10000; i++) {
      const v = boxMuller(rng);
      expect(isFinite(v)).toBe(true);
      expect(isNaN(v)).toBe(false);
    }
  });

  it('handles edge case where rng returns exactly 0', () => {
    // Should be clamped to 1e-10 by Math.max, preventing log(0) = -Infinity
    let callCount = 0;
    const fakeRng = () => {
      callCount++;
      return callCount === 1 ? 0 : 0.5; // First call returns 0
    };
    const result = boxMuller(fakeRng);
    expect(isFinite(result)).toBe(true);
  });
});

// =============================================================================
// projectPortfolioPerStock — the main projection engine
// =============================================================================
describe('projectPortfolioPerStock', () => {
  const singleHolding = [
    { ticker: 'KO', shares: 100, price: 60, yld: 3, div: 1.80, g5: 5 },
  ];
  const emptyLiveData = {};

  // --- Empty portfolio edge cases ---

  it('returns zeros for null holdings', () => {
    // Empty portfolio should produce all-zero projections
    const result = projectPortfolioPerStock(5, null, {}, 0, false, null);
    expect(result.noDripVals.every(v => v === 0)).toBe(true);
    expect(result.dripVals.every(v => v === 0)).toBe(true);
    expect(result.simPeriodsPerYear).toBe(12);
  });

  it('returns zeros for empty array holdings', () => {
    const result = projectPortfolioPerStock(5, [], {}, 0, false, null);
    expect(result.noDripVals.every(v => v === 0)).toBe(true);
  });

  it('correct array length for deterministic mode', () => {
    // Deterministic: 12 periods/year (monthly), so length = horizon*12 + 1 (includes start)
    const result = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, false, null);
    expect(result.noDripVals).toHaveLength(121); // 10*12 + 1
    expect(result.simPeriodsPerYear).toBe(12);
  });

  it('correct array length for volatile mode', () => {
    // Volatile: 12 periods/year, so length = horizon*12 + 1
    const result = projectPortfolioPerStock(5, singleHolding, emptyLiveData, 0, true, null);
    expect(result.noDripVals).toHaveLength(61); // 5*12 + 1
    expect(result.simPeriodsPerYear).toBe(12);
  });

  // --- Deterministic mode financial correctness ---

  it('starts with correct portfolio value', () => {
    // Starting value = 100 shares × $60 = $6000
    const result = projectPortfolioPerStock(5, singleHolding, emptyLiveData, 0, false, null);
    expect(result.noDripVals[0]).toBe(6000);
    expect(result.dripVals[0]).toBe(6000);
  });

  it('DRIP values grow faster than no-DRIP values', () => {
    // DRIP reinvests dividends → buys more shares → compounds
    const result = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, false, null);
    const finalNoDrip = result.noDripVals[result.noDripVals.length - 1];
    const finalDrip = result.dripVals[result.dripVals.length - 1];
    // DRIP should always beat no-DRIP over 10 years with positive yield
    expect(finalDrip).toBeGreaterThan(finalNoDrip);
  });

  it('contributions increase portfolio value above DRIP-only', () => {
    // Extra $5000/year should increase final value
    const noCont = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, false, null);
    const withCont = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 5000, false, null);
    expect(withCont.contribVals).not.toBeNull();
    const finalDrip = noCont.dripVals[noCont.dripVals.length - 1];
    const finalContrib = withCont.contribVals[withCont.contribVals.length - 1];
    expect(finalContrib).toBeGreaterThan(finalDrip);
  });

  it('no contributions returns null contribVals', () => {
    const result = projectPortfolioPerStock(5, singleHolding, emptyLiveData, 0, false, null);
    expect(result.contribVals).toBeNull();
  });

  it('dividend income per year is non-negative', () => {
    const result = projectPortfolioPerStock(5, singleHolding, emptyLiveData, 0, false, null);
    result.divIncomePerYear.forEach(income => {
      expect(income).toBeGreaterThanOrEqual(0);
    });
  });

  // --- Live data priority ---

  it('prefers live price over holding price', () => {
    // Live price $100 vs holding price $60 → starting value = 100 * 100 = $10,000
    const liveData = { KO: { price: 100, divYield: 3, annualDiv: 3.00 } };
    const result = projectPortfolioPerStock(1, singleHolding, liveData, 0, false, null);
    expect(result.noDripVals[0]).toBe(10000);
  });

  it('falls back to holding price when live price is 0', () => {
    // Live price 0 should fall back to h.price ($60)
    const liveData = { KO: { price: 0 } };
    const result = projectPortfolioPerStock(1, singleHolding, liveData, 0, false, null);
    expect(result.noDripVals[0]).toBe(6000);
  });

  // --- Edge cases ---

  it('handles holding with zero price', () => {
    // Zero price stock: value = 0, should not cause division by zero
    const holdings = [{ ticker: 'X', shares: 100, price: 0, yld: 5, div: 0, g5: 5 }];
    const result = projectPortfolioPerStock(5, holdings, {}, 0, false, null);
    expect(result.noDripVals[0]).toBe(0);
    // Should not contain NaN
    expect(result.noDripVals.every(v => isFinite(v))).toBe(true);
  });

  it('handles holding with zero shares', () => {
    const holdings = [{ ticker: 'X', shares: 0, price: 100, yld: 5, div: 2, g5: 5 }];
    const result = projectPortfolioPerStock(5, holdings, {}, 0, false, null);
    expect(result.noDripVals[0]).toBe(0);
  });

  it('caps g5 at 10% to prevent unrealistic projections', () => {
    // g5 of 50% should be capped to 10%
    const highGrowth = [{ ticker: 'X', shares: 100, price: 50, yld: 3, div: 1.5, g5: 50 }];
    const capped = [{ ticker: 'X', shares: 100, price: 50, yld: 3, div: 1.5, g5: 10 }];
    const r1 = projectPortfolioPerStock(5, highGrowth, {}, 0, false, null);
    const r2 = projectPortfolioPerStock(5, capped, {}, 0, false, null);
    // Both should produce same results because g5 is capped at 10%
    expect(r1.noDripVals).toEqual(r2.noDripVals);
  });

  it('all values are finite and non-negative', () => {
    // Comprehensive check: no NaN, Infinity, or negative portfolio values
    const result = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 1000, false, null);
    result.noDripVals.forEach(v => {
      expect(isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    });
    result.dripVals.forEach(v => {
      expect(isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    });
  });

  it('portfolio values are capped at 1e11 per period to prevent display overflow', () => {
    // The cap applies per-period in runPath. Starting value itself is not capped.
    // First value is totalValue() which uses Math.round, not capped.
    // Subsequent values are capped via Math.min(periodVal, 1e11).
    const huge = [{ ticker: 'X', shares: 1e9, price: 1000, yld: 3, div: 30, g5: 10 }];
    const result = projectPortfolioPerStock(5, huge, {}, 0, false, null);
    // All projected values (index > 0) should be capped
    for (let i = 1; i < result.noDripVals.length; i++) {
      expect(result.noDripVals[i]).toBeLessThanOrEqual(1e11);
    }
  });

  // --- Volatile (Real World) mode ---

  it('volatile mode is deterministic with built-in seed', () => {
    // Same holdings should produce same MC results (fixed seed 42)
    const r1 = projectPortfolioPerStock(5, singleHolding, emptyLiveData, 0, true, null);
    const r2 = projectPortfolioPerStock(5, singleHolding, emptyLiveData, 0, true, null);
    expect(r1.noDripVals).toEqual(r2.noDripVals);
    expect(r1.dripVals).toEqual(r2.dripVals);
  });

  it('volatile mode produces all finite values', () => {
    const result = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, true, null);
    result.noDripVals.forEach(v => expect(isFinite(v)).toBe(true));
    result.dripVals.forEach(v => expect(isFinite(v)).toBe(true));
  });

  it('multi-stock portfolio produces finite results in volatile mode', () => {
    const holdings = [
      { ticker: 'KO', shares: 50, price: 60, yld: 3, div: 1.80, g5: 5 },
      { ticker: 'JNJ', shares: 30, price: 160, yld: 2.5, div: 4.00, g5: 6 },
      { ticker: 'PG', shares: 40, price: 150, yld: 2.3, div: 3.45, g5: 4 },
    ];
    const result = projectPortfolioPerStock(10, holdings, {}, 0, true, null);
    result.noDripVals.forEach(v => expect(isFinite(v)).toBe(true));
    result.dripVals.forEach(v => expect(isFinite(v)).toBe(true));
  });

  // --- Yield-on-cost / dividend growth in projections ---

  it('dividend income grows year-over-year in deterministic mode', () => {
    // KO: 100 shares × $1.80 div = $180/yr, 5% g5
    // divIncomePerYear comes from the DRIP path — income grows from BOTH
    // dividend growth (g5) AND share accumulation (reinvested dividends)
    const result = projectPortfolioPerStock(5, singleHolding, emptyLiveData, 0, false, null);
    const income = result.divIncomePerYear;
    expect(income).toHaveLength(5);
    // Each year's income should be greater than the previous (compounding)
    for (let i = 1; i < income.length; i++) {
      expect(income[i]).toBeGreaterThan(income[i - 1]);
    }
    // Year 1 income should be close to $180 (100 shares × $1.80)
    // With intra-year compounding, later quarterly payments grow slightly → ~$185
    expect(income[0]).toBeGreaterThan(175);
    expect(income[0]).toBeLessThan(200);
    // Year 5 income should exceed simple $180 × 1.05^4 ≈ $218.89 because
    // DRIP reinvestment adds shares, compounding on top of dividend growth
    expect(income[4]).toBeGreaterThan(180 * Math.pow(1.05, 4));
  });

  it('DRIP dividend income grows faster than no-DRIP due to share accumulation', () => {
    // With DRIP, shares increase from reinvested dividends → more income
    const noDripResult = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, false, null);
    // DRIP result: divIncomePerYear comes from drip path by default
    const dripResult = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, false, null);
    // Both should grow, but DRIP income at year 10 should be higher than simple g5 compound
    // Simple compound: $180 × 1.05^9 (9 years of growth for year 10)
    const simpleCompound = 180 * Math.pow(1.05, 9);
    const dripYear10 = dripResult.divIncomePerYear[9];
    // DRIP reinvestment adds shares, so income should exceed simple compound
    expect(dripYear10).toBeGreaterThan(simpleCompound);
  });

  it('yield-on-cost at horizon reflects dividend growth', () => {
    // Starting: 100 shares × $60 = $6000, yield = 3%, income = $180
    // After 10 years with 5% div growth, yield-on-cost should be ~3% × 1.05^10 ≈ 4.89%
    // (on original cost basis, not current market value)
    const result = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, false, null);
    const year10Income = result.divIncomePerYear[9];
    const costBasis = 6000; // original investment
    const yieldOnCost = (year10Income / costBasis) * 100;
    // Should be significantly above the initial 3% yield
    // With DRIP reinvestment, it should be even higher than 4.89% (shares grew too)
    expect(yieldOnCost).toBeGreaterThan(4.5);
  });

  it('divIncomePerYear has correct length matching horizon', () => {
    for (const h of [1, 5, 10, 25]) {
      const result = projectPortfolioPerStock(h, singleHolding, emptyLiveData, 0, false, null);
      expect(result.divIncomePerYear).toHaveLength(h);
    }
  });

  it('dividend income grows in volatile mode too', () => {
    const result = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, true, null);
    const income = result.divIncomePerYear;
    // Over 10 years, even with volatility, the overall trend should be upward
    // Compare first 2 years average vs last 2 years average
    const earlyAvg = (income[0] + income[1]) / 2;
    const lateAvg = (income[8] + income[9]) / 2;
    expect(lateAvg).toBeGreaterThan(earlyAvg);
  });

  it('noDrip shows pure price appreciation without dividend cash', () => {
    // noDripVals should be LESS than dripVals by a significant margin
    // because noDrip = price appreciation only, drip = price + reinvested dividends
    const result = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, false, null);
    const finalNoDrip = result.noDripVals[result.noDripVals.length - 1];
    const finalDrip = result.dripVals[result.dripVals.length - 1];
    const dripBonus = finalDrip - finalNoDrip;
    // KO: 100 shares × $60 = $6000, 3% yield, 5% g5
    // Over 10 years, reinvested dividends should add significant value
    expect(dripBonus).toBeGreaterThan(1000);
  });

  it('DRIP bonus works in volatile mode too', () => {
    const result = projectPortfolioPerStock(10, singleHolding, emptyLiveData, 0, true, null);
    const finalNoDrip = result.noDripVals[result.noDripVals.length - 1];
    const finalDrip = result.dripVals[result.dripVals.length - 1];
    expect(finalDrip - finalNoDrip).toBeGreaterThan(500);
  });
});
