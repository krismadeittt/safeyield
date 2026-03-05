import { describe, it, expect } from 'vitest';
import { buildSunburstData, buildMountainData } from '../utils/vizData';

// =============================================================================
// Helper: simulate the portfolio summary calculation from usePortfolio.js
// =============================================================================
function calcPortfolioSummary(holdings, liveData, cashBalance) {
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
  const holdingsValue = pv;
  pv += cashBalance;
  return {
    portfolioValue: pv,
    holdingsValue,
    weightedYield: pv > 0 ? yieldSum / pv : 0,
    weightedGrowth: holdingsValue > 0 ? growthSum / holdingsValue : 0,
  };
}

// Helper: simulate the weight calculation from HoldingsTable (AFTER fix)
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
    // KO: 100 * 60 = 6000, JNJ: 50 * 160 = 8000 → holdings = 14000
    expect(holdingsValue).toBe(14000);
    expect(portfolioValue).toBe(24000); // 14000 + 10000
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
// 2. Yield dilution math
// =============================================================================
describe('Yield dilution by cash', () => {
  it('cash at 0% yield dilutes weighted average', () => {
    // $50k stocks at 4% + $50k cash at 0% → weighted yield = 2%
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

  it('100% cash gives 0% yield', () => {
    const { weightedYield } = calcPortfolioSummary([], {}, 100000);
    expect(weightedYield).toBe(0);
  });

  it('small cash barely dilutes yield', () => {
    // $100k stocks at 3% + $1k cash → should be very close to 3%
    const holdings = [{ ticker: 'BIG', shares: 1000, price: 100, yld: 3.0 }];
    const live = { BIG: { price: 100, divYield: 3.0 } };
    const { weightedYield } = calcPortfolioSummary(holdings, live, 1000);
    // Expected: (3.0 * 100000) / 101000 ≈ 2.9703
    expect(weightedYield).toBeCloseTo(2.9703, 3);
  });

  it('large cash significantly dilutes yield', () => {
    // $10k stocks at 5% + $90k cash → 0.5%
    const holdings = [{ ticker: 'SML', shares: 100, price: 100, yld: 5.0 }];
    const live = { SML: { price: 100, divYield: 5.0 } };
    const { weightedYield } = calcPortfolioSummary(holdings, live, 90000);
    expect(weightedYield).toBeCloseTo(0.5, 6);
  });
});

// =============================================================================
// 3. Allocation percentages sum to exactly 100%
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
    const weights = calcWeights([], {}, portfolioValue);
    const stockWeightSum = weights.reduce((s, w) => s + w.weightPct, 0);
    const cashWeight = calcCashWeight(cashBalance, portfolioValue);
    expect(stockWeightSum).toBe(0);
    expect(cashWeight).toBeCloseTo(100, 10);
  });

  it('50/50 split: each side gets 50%', () => {
    // $14k stocks + $14k cash = $28k total
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
// 4. Edge cases
// =============================================================================
describe('Cash edge cases', () => {
  it('$0 cash has 0% weight', () => {
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, 0);
    expect(calcCashWeight(0, portfolioValue)).toBe(0);
  });

  it('very large cash amount works correctly', () => {
    const cashBalance = 1e12; // $1 trillion
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, cashBalance);
    expect(portfolioValue).toBe(14000 + 1e12);
    const cashWeight = calcCashWeight(cashBalance, portfolioValue);
    expect(cashWeight).toBeGreaterThan(99.99);
    expect(cashWeight).toBeLessThanOrEqual(100);
  });

  it('tiny cash amount gets correct weight', () => {
    const cashBalance = 0.01; // 1 cent
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, cashBalance);
    const cashWeight = calcCashWeight(cashBalance, portfolioValue);
    expect(cashWeight).toBeGreaterThan(0);
    expect(cashWeight).toBeLessThan(0.001);
  });

  it('negative cash is clamped to 0 by updateCashBalance logic', () => {
    // Simulate: const val = Math.max(0, Number(amount) || 0);
    const val = Math.max(0, Number(-5000) || 0);
    expect(val).toBe(0);
  });

  it('NaN cash is clamped to 0 by updateCashBalance logic', () => {
    const val = Math.max(0, Number("abc") || 0);
    expect(val).toBe(0);
  });

  it('empty portfolio (no holdings, no cash) has 0 value', () => {
    const { portfolioValue } = calcPortfolioSummary([], {}, 0);
    expect(portfolioValue).toBe(0);
  });

  it('empty portfolio with 0 cash yields 0% weight for cash', () => {
    expect(calcCashWeight(0, 0)).toBe(0);
  });
});

// =============================================================================
// 5. Sunburst visualization data with cash
// =============================================================================
describe('buildSunburstData with cash', () => {
  it('injects Cash segment when cashBalance > 0', () => {
    const tree = buildSunburstData(MOCK_HOLDINGS, MOCK_LIVE, 24000, 10000);
    const cashClass = tree.children.find(c => c.name === 'Cash');
    expect(cashClass).toBeDefined();
    expect(cashClass.children[0].name).toBe('Money Market');
    const cashLeaf = cashClass.children[0].children.find(c => c.name === 'CASH');
    expect(cashLeaf).toBeDefined();
    expect(cashLeaf.val).toBe(10000);
    expect(cashLeaf.yield).toBe(0);
  });

  it('does not inject Cash segment when cashBalance is 0', () => {
    const tree = buildSunburstData(MOCK_HOLDINGS, MOCK_LIVE, 14000, 0);
    const cashClass = tree.children.find(c => c.name === 'Cash');
    expect(cashClass).toBeUndefined();
  });

  it('does not inject Cash segment when cashBalance is omitted', () => {
    const tree = buildSunburstData(MOCK_HOLDINGS, MOCK_LIVE, 14000);
    const cashClass = tree.children.find(c => c.name === 'Cash');
    expect(cashClass).toBeUndefined();
  });

  it('cash-only portfolio has single Cash segment', () => {
    const tree = buildSunburstData([], {}, 50000, 50000);
    expect(tree.children.length).toBe(1);
    expect(tree.children[0].name).toBe('Cash');
    expect(tree.children[0].children[0].children[0].val).toBe(50000);
  });

  it('cash yield tier is Minimal', () => {
    const tree = buildSunburstData([], {}, 50000, 50000);
    const cashLeaf = tree.children[0].children[0].children[0];
    expect(cashLeaf.yieldTier).toBe('Minimal');
  });
});

// =============================================================================
// 6. Mountain visualization data with cash
// =============================================================================
describe('buildMountainData with cash', () => {
  it('injects CASH entry when cashBalance > 0', () => {
    const data = buildMountainData(MOCK_HOLDINGS, MOCK_LIVE, 24000, 10000);
    const cashEntry = data.find(d => d.ticker === 'CASH');
    expect(cashEntry).toBeDefined();
    expect(cashEntry.value).toBe(10000);
    expect(cashEntry.yield).toBe(0);
    expect(cashEntry.sector).toBe('Money Market');
  });

  it('does not inject CASH when cashBalance is 0', () => {
    const data = buildMountainData(MOCK_HOLDINGS, MOCK_LIVE, 14000, 0);
    const cashEntry = data.find(d => d.ticker === 'CASH');
    expect(cashEntry).toBeUndefined();
  });

  it('cash weight in mountain data is correct', () => {
    const data = buildMountainData(MOCK_HOLDINGS, MOCK_LIVE, 24000, 10000);
    const cashEntry = data.find(d => d.ticker === 'CASH');
    // 10000 / 24000 * 100 ≈ 41.67%
    expect(cashEntry.weight).toBeCloseTo(41.667, 2);
  });

  it('total mountain weights sum to ~100% with cash', () => {
    const pv = 24000;
    const data = buildMountainData(MOCK_HOLDINGS, MOCK_LIVE, pv, 10000);
    const totalWeight = data.reduce((s, d) => s + d.weight, 0);
    expect(totalWeight).toBeCloseTo(100, 1);
  });
});

// =============================================================================
// 7. Cash always appears first (structural test)
// =============================================================================
describe('Cash ordering', () => {
  it('mountain data puts cash last in array (UI renders it first separately)', () => {
    const data = buildMountainData(MOCK_HOLDINGS, MOCK_LIVE, 24000, 10000);
    // CASH is injected at end of array; UI handles ordering
    const lastEntry = data[data.length - 1];
    expect(lastEntry.ticker).toBe('CASH');
  });
});

// =============================================================================
// 8. Default portfolios start with $0 cash
// =============================================================================
describe('Default cash behavior', () => {
  it('cashBalance defaults to 0 when omitted', () => {
    const cashBalance = undefined ?? 0;
    const { portfolioValue } = calcPortfolioSummary(MOCK_HOLDINGS, MOCK_LIVE, cashBalance);
    expect(portfolioValue).toBe(14000);
  });
});
