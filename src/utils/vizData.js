// Data transformation utilities for portfolio visualizers

const BROAD_ETFS = new Set(['VOO', 'VTI', 'QQQ', 'SPY', 'IVV', 'SPLG']);
const DIV_ETFS = new Set(['SCHD', 'VYM', 'DGRO', 'HDV', 'DVY', 'NOBL', 'SDY', 'VIG']);

const SECTOR_MAP = {
  'Financial Services': 'Financials',
  'Consumer Defensive': 'Consumer',
  'Consumer Cyclical': 'Consumer',
  'Industrials': 'Industrial',
  'Real Estate': 'REITs',
  'Communication Services': 'Technology',
  'Basic Materials': 'Industrial',
};

function normalizeSector(raw) {
  return SECTOR_MAP[raw] || raw;
}

function classifyHolding(h, live) {
  const sector = live?.sector || h.sector || '';
  if (sector === 'ETF' || sector === 'Broad ETF' || sector === 'Dividend ETF' || BROAD_ETFS.has(h.ticker) || DIV_ETFS.has(h.ticker)) {
    const subSector = BROAD_ETFS.has(h.ticker) ? 'Broad Market' : DIV_ETFS.has(h.ticker) ? 'Dividend ETF' : 'Broad Market';
    return { assetClass: 'ETFs', sector: subSector };
  }
  if (sector === 'Cash' || sector === 'Money Market' || h.ticker === 'SPAXX' || h.ticker === 'VMFXX') {
    return { assetClass: 'Cash', sector: 'Money Market' };
  }
  return { assetClass: 'Stocks', sector: normalizeSector(sector) || 'Other' };
}

function yieldTier(yld) {
  if (yld < 0.3) return 'Minimal';
  if (yld < 1.5) return 'Low Yield';
  if (yld < 3.0) return 'Mid Yield';
  return 'High Yield';
}

function enrichHolding(h, live, portfolioValue) {
  const price = live?.price || h.price || 0;
  const divYield = live?.divYield ?? h.yld ?? 0;
  const annualDiv = live?.annualDiv ?? h.div ?? 0;
  const change = live?.change ?? 0;
  const payout = live?.payout ?? h.payout ?? 0;
  const g5 = live?.g5 ?? h.g5 ?? 0;
  const streak = live?.streak ?? h.streak ?? 0;
  const value = price * (h.shares || 0);
  const weight = portfolioValue > 0 ? (value / portfolioValue) * 100 : 0;

  return {
    ticker: h.ticker,
    full: live?.name || h.name || h.ticker,
    sector: normalizeSector(live?.sector || h.sector || ''),
    price,
    daily: change,
    yield: divYield,
    div: annualDiv,
    payout,
    growth5y: g5,
    streak,
    value: Math.round(value),
    weight,
    yieldTier: yieldTier(divYield),
  };
}

export function buildSunburstData(holdings, liveData, portfolioValue, cashBalance = 0, cashApy = 0, cashCompounding = 'none') {
  const tree = { name: 'Portfolio', children: [] };
  const classMap = {};

  holdings.forEach(h => {
    const live = liveData[h.ticker];
    const enriched = enrichHolding(h, live, portfolioValue);
    const { assetClass, sector } = classifyHolding(h, live);

    if (!classMap[assetClass]) {
      classMap[assetClass] = { name: assetClass, children: [], _sectors: {} };
      tree.children.push(classMap[assetClass]);
    }
    const ac = classMap[assetClass];
    if (!ac._sectors[sector]) {
      ac._sectors[sector] = { name: sector, children: [] };
      ac.children.push(ac._sectors[sector]);
    }
    ac._sectors[sector].children.push({
      name: enriched.ticker,
      full: enriched.full,
      val: enriched.value,
      yield: enriched.yield,
      daily: enriched.daily,
      payout: enriched.payout,
      growth5y: enriched.growth5y,
      streak: enriched.streak,
      price: enriched.price,
      div: enriched.div,
      yieldTier: enriched.yieldTier,
    });
  });

  // Inject synthetic cash holding into the sunburst tree
  if (cashBalance > 0) {
    const effectiveApy = (cashCompounding !== 'none' && cashApy > 0) ? cashApy : 0;
    const cashAnnualDiv = cashBalance * effectiveApy / 100;

    if (!classMap['Cash']) {
      classMap['Cash'] = { name: 'Cash', children: [], _sectors: {} };
      tree.children.push(classMap['Cash']);
    }
    const ac = classMap['Cash'];
    if (!ac._sectors['Money Market']) {
      ac._sectors['Money Market'] = { name: 'Money Market', children: [] };
      ac.children.push(ac._sectors['Money Market']);
    }
    ac._sectors['Money Market'].children.push({
      name: 'CASH',
      full: 'Cash Position',
      val: Math.round(cashBalance),
      yield: effectiveApy, daily: 0, payout: 0, growth5y: 0, streak: 0,
      price: 1, div: cashAnnualDiv, yieldTier: yieldTier(effectiveApy),
    });
  }

  return tree;
}

export function buildMountainData(holdings, liveData, portfolioValue, cashBalance = 0, cashApy = 0, cashCompounding = 'none') {
  const result = holdings.map(h => {
    const live = liveData[h.ticker];
    const enriched = enrichHolding(h, live, portfolioValue);
    const { sector } = classifyHolding(h, live);
    return { ...enriched, sector };
  });

  // Inject synthetic cash entry
  if (cashBalance > 0) {
    const effectiveApy = (cashCompounding !== 'none' && cashApy > 0) ? cashApy : 0;
    result.push({
      ticker: 'CASH', full: 'Cash Position', sector: 'Money Market',
      price: 1, daily: 0, yield: effectiveApy, div: cashBalance * effectiveApy / 100,
      payout: 0, growth5y: 0, streak: 0,
      value: Math.round(cashBalance), weight: portfolioValue > 0 ? (cashBalance / portfolioValue) * 100 : 0,
      yieldTier: yieldTier(effectiveApy),
    });
  }

  return result;
}
