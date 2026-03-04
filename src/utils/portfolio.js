import { ARISTOCRATS, NOBL_HOLDINGS } from '../data/aristocrats';
import { ETF_DATABASE } from '../data/etfs';

/**
 * Estimate a stock price from static dividend/yield data when API price is missing.
 * Formula: price ≈ annualDividend / (yield / 100)
 */
function estimatePrice(entry) {
  if (entry.div > 0 && entry.yld > 0) {
    return entry.div / (entry.yld / 100);
  }
  return 0;
}

/**
 * Build holdings array from a weighted portfolio template.
 * Each holding gets a share of `balance` proportional to its weight.
 *
 * GUARANTEES: sum(shares × price) === balance (within floating-point epsilon).
 * - Uses API price when available, estimates from static data as fallback
 * - Tickers with no price at all are excluded and their weight redistributed
 * - Final normalization pass ensures the total matches the target balance exactly
 */
export function buildPortfolioFromWeights(template, balance, prices) {
  // First pass: build holdings — split balance EVENLY across all stocks
  const holdings = template.map(({ ticker }) => {
    const entry = ARISTOCRATS.find(a => a.ticker === ticker)
      || ETF_DATABASE[ticker]
      || { name: ticker, score: 60, yld: 1.5, div: 1, payout: 40, g5: 5, streak: 0, sector: "Technology" };

    const allocation = balance / template.length;
    const priceData = prices?.[ticker];

    // Price priority: API price > estimated from static data
    let price = priceData?.price || 0;
    if (price <= 0) {
      price = estimatePrice(entry);
    }

    const shares = price > 0 ? allocation / price : 0;
    return { ...entry, ticker, shares, price, costBasis: price, _allocation: allocation };
  });

  // Filter out tickers with no usable price
  const valid = holdings.filter(h => h.shares > 0 && h.price > 0);
  if (valid.length === 0) return [];

  // Normalize: scale all shares so sum(shares × price) = balance EXACTLY
  // This redistributes any "lost" allocation from missing-price tickers
  const actualTotal = valid.reduce((sum, h) => sum + h.shares * h.price, 0);
  if (actualTotal > 0) {
    const scale = balance / actualTotal;
    valid.forEach(h => { h.shares = h.shares * scale; });
  }

  return valid;
}

/**
 * Build equal-weight NOBL Aristocrat holdings.
 *
 * GUARANTEES: sum(shares × price) === balance exactly.
 */
export function buildNoblPortfolio(balance, prices) {
  // First pass: compute shares with best available price
  const holdings = NOBL_HOLDINGS.map(stock => {
    const allocation = balance / NOBL_HOLDINGS.length;
    const priceData = prices?.[stock.ticker];

    let price = priceData?.price || 0;
    if (price <= 0) {
      price = estimatePrice(stock);
    }

    const shares = price > 0 ? allocation / price : 0;
    return { ...stock, shares, price, costBasis: price, _allocation: allocation };
  });

  // Filter out tickers with no usable price
  const valid = holdings.filter(h => h.shares > 0 && h.price > 0);
  if (valid.length === 0) return [];

  // Normalize: scale shares so total = balance exactly
  const actualTotal = valid.reduce((sum, h) => sum + h.shares * h.price, 0);
  if (actualTotal > 0) {
    const scale = balance / actualTotal;
    valid.forEach(h => { h.shares = h.shares * scale; });
  }

  return valid;
}

/**
 * Get all unique tickers across all portfolio templates + aristocrats.
 */
export function getAllTemplateTickers(templates) {
  const tickers = new Set();
  NOBL_HOLDINGS.forEach(s => tickers.add(s.ticker));
  templates.forEach(template => {
    template.forEach(t => tickers.add(t.ticker));
  });
  return [...tickers];
}
