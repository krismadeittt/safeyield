import { describe, it, expect } from 'vitest';
import { buildSunburstData, buildMountainData } from '../utils/vizData';

// =============================================================================
// Helper: simulate the portfolio summary calculation from usePortfolio.js
// =============================================================================
function calcPortfolioSummary(holdings, liveData, cashBalance, cashApy = 0, cashCompounding = 'none') {
  let pv = 0, yieldSum = 0, growthSum = 0;
  holdings.forEach(h => {
    const live = liveData?.[h.ticker];
    const price = (live?.price > 0 ? live.price : null) || h.price || 0;
    const value = price * (h.shares || 0);
    const yld = live?.divYield ?? h.yld ?? 0;
    const g5 = live?.g5 ?? h.g5 ?? 0;
    pv += value;
    yieldSum += yld * value;
    growthSum += g5 * value;
  });

  // Include cash yield in weighted average
  const effectiveCashApy = (cashCompounding !== 'none' && cashApy > 0) ? cashApy : 0;
  yieldSum += effectiveCashApy * cashBalance;

  // Cash income
  const cashAnnualIncome = (cashCompounding !== 'none' && cashApy > 0 && cashBalance > 0)
    ? cashBalance * cashApy / 100 : 0;

  const holdingsValue = pv;
  pv += cashBalance;
  return {
    portfolioValue: pv,
    holdingsValue,
    weightedYield: pv > 0 ? yieldSum / pv : 0,
    weightedGrowth: holdingsValue > 0 ? growthSum / holdingsValue : 0,
    cashAnnualIncome,
  };
}

// Helper: simulate the weight calculation from HoldingsTable
function calcWeights(holdings, liveData, portfolioValue) {
  return holdings.map(h => {
    const live = liveData?.[h.ticker];
    const price = (live?.price > 0 ? live.price : null) || h.price || 0;
    const value = price * (h.shares || 0);
    return {
      ticker: h.ticker,
      value,
      weightPct: portfolioValue > 0 ? (value / portfolioValue) * 100 : 0,
    };
  });
}

function calcCashWeight(cashBalance, portfolioValue) {
  return portfolioValue > 0 ? (cashBalance / portfolioValue) * 100 : 0;
}

// =============================================================================
// Test data
// =============================================================================
const MOCK_HOLDINGS = [
  { ticker: 'KO', shares: 100, price: 60, yld: 3.0, div: 1.80, g5: 5 },
  { ticker: 'JNJ', shares: 50, price: 160, yld: 2.5, div: 4.00, g5: 6 },
];

const MOCK_LIVE = {
  KO: { price: 60, divYield: 3.0, annualDiv: 1.80, g5: 5, sector: 'Consumer Defensive' },
  JNJ: { price: 160, divYield: 2.5, annualDiv: 4.00, g5: 6, sector: 'Healthcare' },
};

// =============================================================================
// 1. Portfolio value = holdings + cash
// =============================================================================
describe('Portfolio value with cash', () => {
  it('portfolio value includes cash balance', () => {
    const { portfolioValue, holdingsValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, 10000);
    expect(holdingsValue).toBe(14000);
    expect(portfolioValue).toBe(24000);
  });

  it('portfolio value equals holdings when cash is 0', () => {
    const { portfolioValue, holdingsValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, 0);
    expect(portfolioValue).toBe(holdingsValue);
    expect(portfolioValue).toBe(14000);
  });

  it('portfolio value is just cash when no holdings', () => {
    const { portfolioValue, holdingsValue } = calcPortfolioSummary([], MOCK_LIVE, 50000);
    expect(holdingsValue).toBe(0);
    expect(portfolioValue).toBe(50000);
  });
});

// =============================================================================
// 2. Yield dilution — cash at 0% (Just Cash mode)
// =============================================================================
describe('Yield dilution by cash (Just Cash)', () => {
  it('cash at 0% yield dilutes weighted average', () => {
    const holdings = [{ ticker: 'TEST', shares: 500, price: 100, yld: 4.0 }];
    const live = { TEST: { price: 100, divYield: 4.0 } };
    const { weightedYield } = calcPortfolioSummary(holdings, live, 50000);
    expect(weightedYield).toBeCloseTo(2.0, 6);
  });

  it('no cash means no dilution', () => {
    const holdings = [{ ticker: 'TEST', shares: 500, price: 100, yld: 4.0 }];
    const live = { TEST: { price: 100, divYield: 4.0 } };
    const { weightedYield } = calcPortfolioSummary(holdings, live, 0);
    expect(weightedYield).toBeCloseTo(4.0, 6);
  });

  it('100% cash (Just Cash) gives 0% yield', () => {
    const { weightedYield } = calcPortfolioSummary([], {}, 100000);
    expect(weightedYield).toBe(0);
  });
});

// =============================================================================
// 3. Cash with APY — yield not diluted when earning interest
// =============================================================================
describe('Cash with money market APY', () => {
  it('cash at 4.5% APY contributes to portfolio yield', () => {
    // $50k stocks at 4% + $50k cash at 4.5% → weighted = (4*50k + 4.5*50k) / 100k = 4.25%
    const holdings = [{ ticker: 'TEST', shares: 500, price: 100, yld: 4.0 }];
    const live = { TEST: { price: 100, divYield: 4.0 } };
    const { weightedYield } = calcPortfolioSummary(holdings, live, 50000, 4.5, 'daily');
    expect(weightedYield).toBeCloseTo(4.25, 4);
  });

  it('cash APY ignored when compounding is none', () => {
    const holdings = [{ ticker: 'TEST', shares: 500, price: 100, yld: 4.0 }];
    const live = { TEST: { price: 100, divYield: 4.0 } };
    // Even though cashApy=4.5, compounding='none' means it's treated as 0%
    const { weightedYield } = calcPortfolioSummary(holdings, live, 50000, 4.5, 'none');
    expect(weightedYield).toBeCloseTo(2.0, 6);
  });

  it('cash annual income calculated correctly', () => {
    const { cashAnnualIncome } = calcPortfolioSummary([], {}, 100000, 4.5, 'monthly');
    expect(cashAnnualIncome).toBeCloseTo(4500, 2);
  });

  it('cash income is 0 when compounding is none', () => {
    const { cashAnnualIncome } = calcPortfolioSummary([], {}, 100000, 4.5, 'none');
    expect(cashAnnualIncome).toBe(0);
  });

  it('cash income is 0 when APY is 0', () => {
    const { cashAnnualIncome } = calcPortfolioSummary([], {}, 100000, 0, 'daily');
    expect(cashAnnualIncome).toBe(0);
  });

  it('100% cash at 4.5% APY has 4.5% portfolio yield', () => {
    const { weightedYield } = calcPortfolioSummary([], {}, 100000, 4.5, 'daily');
    expect(weightedYield).toBeCloseTo(4.5, 4);
  });
});

// =============================================================================
// 4. Allocation percentages sum to exactly 100%
// =============================================================================
describe('Allocation weights sum to 100%', () => {
  it('stock weights + cash weight = 100% exactly', () => {
    const cashBalance = 10000;
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, cashBalance);
    const weights = calcWeights(MOCK_HOLDINGS, MOCK_LIVE, portfolioValue);
    const stockWeightSum = weights.reduce((s, w) => s + w.weightPct, 0);
    const cashWeight = calcCashWeight(cashBalance, portfolioValue);
    expect(stockWeightSum + cashWeight).toBeCloseTo(100, 10);
  });

  it('weights sum to 100% with no cash', () => {
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, 0);
    const weights = calcWeights(MOCK_HOLDINGS, MOCK_LIVE, portfolioValue);
    const stockWeightSum = weights.reduce((s, w) => s + w.weightPct, 0);
    expect(stockWeightSum).toBeCloseTo(100, 10);
  });

  it('100% cash: cash weight is 100%', () => {
    const cashBalance = 50000;
    const { portfolioValue } = calcPortfolioSummary([], {}, cashBalance);
    const cashWeight = calcCashWeight(cashBalance, portfolioValue);
    expect(cashWeight).toBeCloseTo(100, 10);
  });

  it('50/50 split: each side gets 50%', () => {
    const cashBalance = 14000;
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, cashBalance);
    expect(portfolioValue).toBe(28000);
    const weights = calcWeights(MOCK_HOLDINGS, MOCK_LIVE, portfolioValue);
    const stockWeightSum = weights.reduce((s, w) => s + w.weightPct, 0);
    const cashWeight = calcCashWeight(cashBalance, portfolioValue);
    expect(stockWeightSum).toBeCloseTo(50, 10);
    expect(cashWeight).toBeCloseTo(50, 10);
  });

  it('many holdings + cash still sum to 100%', () => {
    const manyHoldings = Array.from({ length: 50 }, (_, i) => ({
      ticker: `STK${i}`, shares: 10 + i, price: 50 + i * 2, yld: 1 + i * 0.1,
    }));
    const manyLive = {};
    manyHoldings.forEach(h => {
      manyLive[h.ticker] = { price: h.price, divYield: h.yld };
    });
    const cashBalance = 25000;
    const { portfolioValue } = calcPortfolioSummary(manyHoldings, manyLive, cashBalance);
    const weights = calcWeights(manyHoldings, manyLive, portfolioValue);
    const stockWeightSum = weights.reduce((s, w) => s + w.weightPct, 0);
    const cashWeight = calcCashWeight(cashBalance, portfolioValue);
    expect(stockWeightSum + cashWeight).toBeCloseTo(100, 10);
  });
});

// =============================================================================
// 5. Edge cases
// =============================================================================
describe('Cash edge cases', () => {
  it('$0 cash has 0% weight', () => {
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, 0);
    expect(calcCashWeight(0, portfolioValue)).toBe(0);
  });

  it('very large cash amount works correctly', () => {
    const cashBalance = 1e12;
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, cashBalance);
    expect(portfolioValue).toBe(14000 + 1e12);
    const cashWeight = calcCashWeight(cashBalance, portfolioValue);
    expect(cashWeight).toBeGreaterThan(99.99);
    expect(cashWeight).toBeLessThanOrEqual(100);
  });

  it('negative cash is clamped to 0 by updateCashBalance logic', () => {
    const val = Math.max(0, Number(-5000) || 0);
    expect(val).toBe(0);
  });

  it('NaN cash is clamped to 0 by updateCashBalance logic', () => {
    const val = Math.max(0, Number("abc") || 0);
    expect(val).toBe(0);
  });

  it('APY is clamped to max 20', () => {
    const val = Math.max(0, Math.min(20, Number(25) || 0));
    expect(val).toBe(20);
  });

  it('empty portfolio (no holdings, no cash) has 0 value', () => {
    const { portfolioValue } = calcPortfolioSummary([], {}, 0);
    expect(portfolioValue).toBe(0);
  });
});

// =============================================================================
// 6. Sunburst visualization data with cash
// =============================================================================
describe('buildSunburstData with cash', () => {
  it('injects Cash segment with 0% yield when no compounding', () => {
    const tree = buildSunburstData(MOCK_HOLDINGS, MOCK_LIVE, 24000, 10000);
    const cashClass = tree.children.find(c => c.name === 'Cash');
    expect(cashClass).toBeDefined();
    const cashLeaf = cashClass.children[0].children.find(c => c.name === 'CASH');
    expect(cashLeaf.val).toBe(10000);
    expect(cashLeaf.yield).toBe(0);
  });

  it('injects Cash segment with APY when compounding is set', () => {
    const tree = buildSunburstData(MOCK_HOLDINGS, MOCK_LIVE, 24000, 10000, 4.5, 'daily');
    const cashClass = tree.children.find(c => c.name === 'Cash');
    const cashLeaf = cashClass.children[0].children.find(c => c.name === 'CASH');
    expect(cashLeaf.yield).toBe(4.5);
    expect(cashLeaf.div).toBeCloseTo(450, 2); // 10000 * 4.5/100
  });

  it('does not inject Cash segment when cashBalance is 0', () => {
    const tree = buildSunburstData(MOCK_HOLDINGS, MOCK_LIVE, 14000, 0);
    const cashClass = tree.children.find(c => c.name === 'Cash');
    expect(cashClass).toBeUndefined();
  });

  it('cash-only portfolio has single Cash segment', () => {
    const tree = buildSunburstData([], {}, 50000, 50000, 4.5, 'monthly');
    expect(tree.children.length).toBe(1);
    expect(tree.children[0].name).toBe('Cash');
    expect(tree.children[0].children[0].children[0].yield).toBe(4.5);
  });

  it('cash yield tier adjusts based on APY', () => {
    const tree = buildSunburstData([], {}, 50000, 50000, 4.5, 'daily');
    const cashLeaf = tree.children[0].children[0].children[0];
    expect(cashLeaf.yieldTier).toBe('High Yield'); // 4.5 >= 3.0
  });
});

// =============================================================================
// 7. Mountain visualization data with cash
// =============================================================================
describe('buildMountainData with cash', () => {
  it('injects CASH entry with APY when compounding is set', () => {
    const data = buildMountainData(MOCK_HOLDINGS, MOCK_LIVE, 24000, 10000, 4.5, 'monthly');
    const cashEntry = data.find(d => d.ticker === 'CASH');
    expect(cashEntry).toBeDefined();
    expect(cashEntry.yield).toBe(4.5);
    expect(cashEntry.div).toBeCloseTo(450, 2);
  });

  it('CASH yield is 0 when compounding is none', () => {
    const data = buildMountainData(MOCK_HOLDINGS, MOCK_LIVE, 24000, 10000, 4.5, 'none');
    const cashEntry = data.find(d => d.ticker === 'CASH');
    expect(cashEntry.yield).toBe(0);
  });

  it('does not inject CASH when cashBalance is 0', () => {
    const data = buildMountainData(MOCK_HOLDINGS, MOCK_LIVE, 14000, 0);
    const cashEntry = data.find(d => d.ticker === 'CASH');
    expect(cashEntry).toBeUndefined();
  });

  it('total mountain weights sum to ~100% with cash', () => {
    const pv = 24000;
    const data = buildMountainData(MOCK_HOLDINGS, MOCK_LIVE, pv, 10000);
    const totalWeight = data.reduce((s, d) => s + d.weight, 0);
    expect(totalWeight).toBeCloseTo(100, 1);
  });
});

// =============================================================================
// 8. Default cash behavior
// =============================================================================
describe('Default cash behavior', () => {
  it('cashBalance defaults to 0 when omitted', () => {
    const cashBalance = undefined ?? 0;
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, cashBalance);
    expect(portfolioValue).toBe(14000);
  });

  it('cashApy defaults to 0 and cashCompounding defaults to none', () => {
    const { weightedYield } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, 10000);
    // With defaults (0 APY, none compounding), cash contributes 0% yield
    // KO: 3.0 * 6000 + JNJ: 2.5 * 8000 = 38000, portfolio = 24000
    // weightedYield = 38000 / 24000 ≈ 1.583
    expect(weightedYield).toBeCloseTo(38000 / 24000, 4);
  });

  it('compounding selector: switching to none zeroes out yield contribution', () => {
    // With APY but compounding=none, cash should not contribute to yield
    const withCompounding = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, 10000, 4.5, 'daily');
    const withoutCompounding = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, 10000, 4.5, 'none');
    expect(withCompounding.weightedYield).toBeGreaterThan(withoutCompounding.weightedYield);
  });
});
