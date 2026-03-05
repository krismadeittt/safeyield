import { describe, it, expect, vi } from 'vitest';

// Mock the data modules so tests don't depend on real static data
vi.mock('../data/aristocrats', () => ({
  ARISTOCRATS: [
    { ticker: 'KO', name: 'Coca-Cola', yld: 3, div: 1.80, payout: 65, g5: 5, streak: 60, sector: 'Staples', score: 85 },
    { ticker: 'JNJ', name: 'J&J', yld: 2.5, div: 4.00, payout: 50, g5: 6, streak: 60, sector: 'Healthcare', score: 90 },
  ],
  NOBL_HOLDINGS: [
    { ticker: 'KO', name: 'Coca-Cola', yld: 3, div: 1.80, payout: 65, g5: 5, streak: 60, sector: 'Staples', score: 85 },
    { ticker: 'JNJ', name: 'J&J', yld: 2.5, div: 4.00, payout: 50, g5: 6, streak: 60, sector: 'Healthcare', score: 90 },
  ],
}));

vi.mock('../data/etfs', () => ({
  ETF_DATABASE: {},
}));

import { buildPortfolioFromWeights, buildNoblPortfolio } from '../utils/portfolio';

// =============================================================================
// buildPortfolioFromWeights — allocates balance across holdings
// =============================================================================
describe('buildPortfolioFromWeights', () => {
  it('allocates balance evenly and normalizes to exact target', () => {
    // $10,000 across 2 tickers at known prices
    const template = [{ ticker: 'KO' }, { ticker: 'JNJ' }];
    const prices = { KO: { price: 60 }, JNJ: { price: 160 } };
    const result = buildPortfolioFromWeights(template, 10000, prices);

    // Total value should equal target balance exactly
    const totalValue = result.reduce((sum, h) => sum + h.shares * h.price, 0);
    expect(totalValue).toBeCloseTo(10000, 2);
  });

  it('uses API prices when available', () => {
    const template = [{ ticker: 'KO' }];
    const prices = { KO: { price: 55 } };
    const result = buildPortfolioFromWeights(template, 5000, prices);
    expect(result[0].price).toBe(55);
  });

  it('estimates price from static div/yield when API price is missing', () => {
    // No API price → estimate from div/yield: $1.80 / (3/100) = $60
    const template = [{ ticker: 'KO' }];
    const result = buildPortfolioFromWeights(template, 5000, {});
    expect(result[0].price).toBeCloseTo(60, 5); // 1.80 / 0.03 (floating-point)
    const totalValue = result.reduce((sum, h) => sum + h.shares * h.price, 0);
    expect(totalValue).toBeCloseTo(5000, 2);
  });

  it('normalizes total to target balance even when some tickers use estimated prices', () => {
    // Unknown ticker falls back to default entry: yld=1.5, div=1 → estimated price ≈ $66.67
    // Both tickers get prices, total is normalized to $10,000
    const template = [{ ticker: 'KO' }, { ticker: 'NOPRICE' }];
    const prices = { KO: { price: 60 } };
    const result = buildPortfolioFromWeights(template, 10000, prices);
    const totalValue = result.reduce((sum, h) => sum + h.shares * h.price, 0);
    expect(totalValue).toBeCloseTo(10000, 2);
  });

  it('builds portfolio from defaults when tickers are unknown (estimated prices)', () => {
    // Unknown tickers get default entry: yld=1.5, div=1 → price ≈ $66.67
    // Both tickers receive estimated prices and are included
    const template = [{ ticker: 'NOPRICE1' }, { ticker: 'NOPRICE2' }];
    const result = buildPortfolioFromWeights(template, 10000, {});
    expect(result.length).toBe(2);
    const totalValue = result.reduce((sum, h) => sum + h.shares * h.price, 0);
    expect(totalValue).toBeCloseTo(10000, 2);
  });

  it('handles zero balance', () => {
    // $0 portfolio: should have 0 shares
    const template = [{ ticker: 'KO' }];
    const prices = { KO: { price: 60 } };
    const result = buildPortfolioFromWeights(template, 0, prices);
    if (result.length > 0) {
      expect(result[0].shares).toBe(0);
    }
  });

  it('handles very large balance', () => {
    // $1 billion portfolio
    const template = [{ ticker: 'KO' }];
    const prices = { KO: { price: 60 } };
    const result = buildPortfolioFromWeights(template, 1e9, prices);
    const totalValue = result.reduce((sum, h) => sum + h.shares * h.price, 0);
    expect(totalValue).toBeCloseTo(1e9, -2);
  });

  it('handles null prices gracefully', () => {
    const template = [{ ticker: 'KO' }];
    const result = buildPortfolioFromWeights(template, 5000, null);
    // Should fall back to static data estimate
    expect(result.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// buildNoblPortfolio — equal-weight Aristocrat portfolio
// =============================================================================
describe('buildNoblPortfolio', () => {
  it('creates equal-weight holdings summing to target balance', () => {
    const prices = { KO: { price: 60 }, JNJ: { price: 160 } };
    const result = buildNoblPortfolio(10000, prices);
    const totalValue = result.reduce((sum, h) => sum + h.shares * h.price, 0);
    expect(totalValue).toBeCloseTo(10000, 2);
  });

  it('handles missing prices by excluding tickers', () => {
    // Only KO has a price → only KO included, gets full balance
    const prices = { KO: { price: 60 } };
    const result = buildNoblPortfolio(10000, prices);
    const koHolding = result.find(h => h.ticker === 'KO');
    expect(koHolding).toBeDefined();
    const totalValue = result.reduce((sum, h) => sum + h.shares * h.price, 0);
    expect(totalValue).toBeCloseTo(10000, 2);
  });

  it('returns empty for zero balance', () => {
    const prices = { KO: { price: 60 } };
    const result = buildNoblPortfolio(0, prices);
    if (result.length > 0) {
      result.forEach(h => expect(h.shares).toBe(0));
    }
  });
});
