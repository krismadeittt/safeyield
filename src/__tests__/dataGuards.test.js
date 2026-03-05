import { describe, it, expect } from 'vitest';

// =============================================================================
// 52-Week Range Guard — prevents NaN when high === low
// =============================================================================
describe('52-week range calculation', () => {
  function calc52WeekPct(price, low, high) {
    const range = high - low;
    return range > 0 ? ((price - low) / range) * 100 : 50;
  }

  it('returns midpoint (50) when high equals low', () => {
    expect(calc52WeekPct(100, 100, 100)).toBe(50);
  });

  it('returns 0% when price is at low', () => {
    expect(calc52WeekPct(50, 50, 100)).toBe(0);
  });

  it('returns 100% when price is at high', () => {
    expect(calc52WeekPct(100, 50, 100)).toBe(100);
  });

  it('returns 50% when price is midway', () => {
    expect(calc52WeekPct(75, 50, 100)).toBe(50);
  });

  it('handles price outside range gracefully', () => {
    // Price above 52-week high
    expect(calc52WeekPct(110, 50, 100)).toBe(120);
    // Price below 52-week low
    expect(calc52WeekPct(40, 50, 100)).toBe(-20);
  });
});

// =============================================================================
// Portfolio Summary NaN Guards — isFinite() prevents NaN propagation
// =============================================================================
describe('portfolio summary NaN guards', () => {
  function computeSummary(holdings, liveData, cashBalance, cashApy, cashCompounding) {
    let pv = 0, yieldSum = 0, growthSum = 0;
    holdings.forEach(h => {
      const live = liveData[h.ticker];
      const price = (live?.price > 0 ? live.price : null) || h.price || 0;
      const value = price * (h.shares || 0);
      const yld = live?.divYield ?? h.yld ?? 0;
      const g5 = live?.g5 ?? h.g5 ?? 0;
      pv += value;
      if (isFinite(yld)) yieldSum += yld * value;
      if (isFinite(g5) && g5 > 0) { growthSum += g5 * value; }
    });

    const effectiveCashApy = (cashCompounding !== 'none' && cashApy > 0) ? cashApy : 0;
    yieldSum += effectiveCashApy * cashBalance;

    const holdingsValue = pv;
    pv += cashBalance;

    return {
      portfolioValue: pv,
      holdingsValue,
      weightedYield: pv > 0 ? yieldSum / pv : 0,
      weightedGrowth: holdingsValue > 0 ? growthSum / holdingsValue : 0,
    };
  }

  it('handles NaN divYield without corrupting weighted yield', () => {
    const holdings = [
      { ticker: 'AAPL', price: 200, shares: 10, yld: NaN, g5: 5 },
      { ticker: 'MSFT', price: 400, shares: 5, yld: 1.0, g5: 8 },
    ];
    const result = computeSummary(holdings, {}, 0, 0, 'none');
    expect(isFinite(result.weightedYield)).toBe(true);
    // Only MSFT's yield should count: 1.0 * 2000 / 4000 = 0.5
    expect(result.weightedYield).toBeCloseTo(0.5, 4);
  });

  it('handles Infinity g5 without corrupting weighted growth', () => {
    const holdings = [
      { ticker: 'AAPL', price: 200, shares: 10, yld: 0.5, g5: Infinity },
      { ticker: 'MSFT', price: 400, shares: 5, yld: 1.0, g5: 8 },
    ];
    const result = computeSummary(holdings, {}, 0, 0, 'none');
    expect(isFinite(result.weightedGrowth)).toBe(true);
    // Only MSFT's g5 should count: 8 * 2000 / 4000 = 4.0
    expect(result.weightedGrowth).toBeCloseTo(4.0, 4);
  });

  it('handles NaN price from liveData gracefully', () => {
    const holdings = [{ ticker: 'AAPL', price: 200, shares: 10, yld: 0.5, g5: 5 }];
    const liveData = { AAPL: { price: NaN, divYield: 0.5 } };
    const result = computeSummary(holdings, liveData, 0, 0, 'none');
    // NaN price fails > 0 check, falls back to h.price = 200
    expect(result.portfolioValue).toBe(2000);
  });

  it('handles negative price from liveData gracefully', () => {
    const holdings = [{ ticker: 'AAPL', price: 200, shares: 10, yld: 0.5, g5: 5 }];
    const liveData = { AAPL: { price: -5, divYield: 0.5 } };
    const result = computeSummary(holdings, liveData, 0, 0, 'none');
    // Negative price fails > 0 check, falls back to h.price = 200
    expect(result.portfolioValue).toBe(2000);
  });

  it('handles zero portfolioValue without division by zero', () => {
    const result = computeSummary([], {}, 0, 0, 'none');
    expect(result.weightedYield).toBe(0);
    expect(result.weightedGrowth).toBe(0);
    expect(result.portfolioValue).toBe(0);
  });

  it('cash-only portfolio does not dilute growth', () => {
    const result = computeSummary([], {}, 10000, 4.5, 'monthly');
    expect(result.portfolioValue).toBe(10000);
    expect(result.weightedGrowth).toBe(0); // No holdings = no growth
    expect(result.weightedYield).toBeCloseTo(4.5, 4); // Cash APY
  });

  it('liveData divYield of NaN from API is ignored', () => {
    const holdings = [{ ticker: 'AAPL', price: 200, shares: 10, yld: 0.5, g5: 5 }];
    const liveData = { AAPL: { price: 200, divYield: NaN, g5: NaN } };
    const result = computeSummary(holdings, liveData, 0, 0, 'none');
    // NaN from liveData is not finite, so yieldSum += 0 (skipped)
    // BUT the ?? fallback gives NaN (since NaN ?? 0.5 returns NaN — NaN is not nullish!)
    // This is why the isFinite guard is critical
    expect(isFinite(result.weightedYield)).toBe(true);
  });
});

// =============================================================================
// Payout Ratio Display Logic — fcfPayout fallback for >100%
// =============================================================================
describe('payout ratio display logic', () => {
  function computeDisplayPayout(rawPayout, fcfPayout) {
    return (rawPayout != null && rawPayout <= 100) ? rawPayout
      : (fcfPayout != null) ? fcfPayout : rawPayout;
  }

  it('shows raw payout when <= 100', () => {
    expect(computeDisplayPayout(60, 55)).toBe(60);
    expect(computeDisplayPayout(100, 90)).toBe(100);
  });

  it('shows fcfPayout when raw > 100 and fcf available', () => {
    expect(computeDisplayPayout(133, 80)).toBe(80);
  });

  it('shows raw payout when > 100 and no fcf available', () => {
    expect(computeDisplayPayout(133, null)).toBe(133);
  });

  it('handles null raw payout with fcf fallback', () => {
    expect(computeDisplayPayout(null, 45)).toBe(45);
  });

  it('handles both null', () => {
    expect(computeDisplayPayout(null, null)).toBe(null);
  });

  it('handles zero payout', () => {
    expect(computeDisplayPayout(0, null)).toBe(0);
  });
});

// =============================================================================
// computeAnnualYield — division by zero and edge case guards
// =============================================================================
describe('computeAnnualYield logic', () => {
  function computeAnnualYield(divHistory, priceHistory) {
    if (!divHistory?.length || !priceHistory?.length) return [];
    const divByYear = {};
    divHistory.forEach(div => {
      const year = div.d.substring(0, 4);
      divByYear[year] = (divByYear[year] || 0) + div.v;
    });
    const priceByYear = {};
    priceHistory.forEach(p => {
      const year = p.d.substring(0, 4);
      priceByYear[year] = p.c || p.ac || 0;
    });
    return Object.entries(divByYear)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, divTotal]) => {
        const yearPrice = priceByYear[year];
        if (!yearPrice || yearPrice <= 0) return null;
        return {
          date: `${year}-01-01`,
          value: parseFloat(((divTotal / yearPrice) * 100).toFixed(2)),
        };
      })
      .filter(Boolean);
  }

  it('returns empty array for null/empty inputs', () => {
    expect(computeAnnualYield(null, null)).toEqual([]);
    expect(computeAnnualYield([], [])).toEqual([]);
    expect(computeAnnualYield(null, [{ d: '2024-01-01', c: 100 }])).toEqual([]);
  });

  it('skips years with zero price (division by zero)', () => {
    const divs = [{ d: '2024-03-15', v: 1.0 }];
    const prices = [{ d: '2024-12-31', c: 0 }];
    expect(computeAnnualYield(divs, prices)).toEqual([]);
  });

  it('skips years with negative price', () => {
    const divs = [{ d: '2024-03-15', v: 1.0 }];
    const prices = [{ d: '2024-12-31', c: -50 }];
    expect(computeAnnualYield(divs, prices)).toEqual([]);
  });

  it('computes yield correctly for normal data', () => {
    const divs = [
      { d: '2024-03-15', v: 1.0 },
      { d: '2024-06-15', v: 1.0 },
      { d: '2024-09-15', v: 1.0 },
      { d: '2024-12-15', v: 1.0 },
    ];
    const prices = [{ d: '2024-12-31', c: 100 }];
    const result = computeAnnualYield(divs, prices);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(4.0); // $4 / $100 = 4%
  });

  it('uses adjusted close when close is missing', () => {
    const divs = [{ d: '2024-06-15', v: 2.0 }];
    const prices = [{ d: '2024-12-31', c: 0, ac: 80 }];
    const result = computeAnnualYield(divs, prices);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(2.5); // $2 / $80 = 2.5%
  });

  it('skips years with no matching price data', () => {
    const divs = [{ d: '2024-03-15', v: 1.0 }];
    const prices = [{ d: '2023-12-31', c: 100 }]; // Different year
    expect(computeAnnualYield(divs, prices)).toEqual([]);
  });
});

// =============================================================================
// EPS/FCF chart value guard — undefined/NaN/Infinity rejection
// =============================================================================
describe('chart value guards', () => {
  function safeLastValue(arr) {
    if (!arr?.length) return null;
    const last = arr[arr.length - 1]?.value;
    if (last == null || !isFinite(last)) return null;
    return last;
  }

  it('returns null for empty array', () => {
    expect(safeLastValue([])).toBeNull();
    expect(safeLastValue(null)).toBeNull();
  });

  it('returns null for undefined value', () => {
    expect(safeLastValue([{ date: '2024', value: undefined }])).toBeNull();
    expect(safeLastValue([{}])).toBeNull();
  });

  it('returns null for NaN value', () => {
    expect(safeLastValue([{ value: NaN }])).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(safeLastValue([{ value: Infinity }])).toBeNull();
    expect(safeLastValue([{ value: -Infinity }])).toBeNull();
  });

  it('returns valid last value', () => {
    expect(safeLastValue([{ value: 3.5 }, { value: 4.2 }])).toBe(4.2);
  });

  it('returns zero as valid', () => {
    expect(safeLastValue([{ value: 0 }])).toBe(0);
  });

  it('returns negative as valid', () => {
    expect(safeLastValue([{ value: -2.5 }])).toBe(-2.5);
  });
});
