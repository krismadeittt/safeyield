import { ARISTOCRATS, NOBL_HOLDINGS } from '../data/aristocrats';
import { ETF_DATABASE } from '../data/etfs';

/**
 * Build holdings array from a weighted portfolio template.
 * Each holding gets a share of `balance` proportional to its weight.
 */
export function buildPortfolioFromWeights(template, balance, prices) {
  const totalWeight = template.reduce((sum, t) => sum + t.weight, 0) || 100;
  return template.map(({ ticker, weight }) => {
    const entry = ARISTOCRATS.find(a => a.ticker === ticker)
      || ETF_DATABASE[ticker]
      || { name: ticker, score: 60, yld: 1.5, div: 1, payout: 40, g5: 5, streak: 0, sector: "Technology" };
    const allocation = balance * (weight / totalWeight);
    const priceData = prices?.[ticker];
    const price = priceData?.price || 0;
    const shares = price > 0 ? allocation / price : allocation / 100;
    return { ...entry, ticker, shares, price, _initValue: allocation };
  });
}

/**
 * Build equal-weight NOBL Aristocrat holdings.
 */
export function buildNoblPortfolio(balance, prices) {
  return NOBL_HOLDINGS.map(stock => {
    const allocation = balance / NOBL_HOLDINGS.length;
    const priceData = prices?.[stock.ticker];
    const price = priceData?.price || 0;
    const shares = price > 0 ? allocation / price : allocation / 100;
    return { ...stock, shares, price, _initValue: allocation };
  });
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
