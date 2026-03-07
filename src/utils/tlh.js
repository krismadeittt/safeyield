// Tax-Loss Harvesting utilities
// Wash sale safe substitutes — similar funds from different providers

var SUBSTITUTE_PAIRS = {
  SCHD: 'VYM',
  VYM: 'SCHD',
  VTI: 'ITOT',
  ITOT: 'VTI',
  VOO: 'IVV',
  IVV: 'VOO',
  VXUS: 'IXUS',
  IXUS: 'VXUS',
  VNQ: 'SCHH',
  SCHH: 'VNQ',
  AGG: 'BND',
  BND: 'AGG',
};

/**
 * Find holdings with unrealized losses (TLH candidates).
 * @param {Array} holdings - [{ ticker, shares, cost_basis, ... }]
 * @param {Object} liveData - { TICKER: { price, ... } }
 * @returns {Array} candidates sorted by unrealizedLoss desc
 */
export function findTLHCandidates(holdings, liveData) {
  var candidates = [];
  liveData = liveData || {};

  for (var i = 0; i < holdings.length; i++) {
    var h = holdings[i];
    var live = liveData[h.ticker] || {};
    var currentPrice = live.price || h.price || 0;
    var shares = h.shares || 0;
    var costBasis = h.cost_basis || h.costBasis || 0;

    if (shares <= 0 || costBasis <= 0 || currentPrice <= 0) continue;

    var currentValue = shares * currentPrice;
    var totalCostBasis = shares * costBasis;
    var unrealizedLoss = currentValue - totalCostBasis;

    if (unrealizedLoss < 0) {
      var lossPct = Math.round((unrealizedLoss / totalCostBasis) * 10000) / 100;
      var substitute = SUBSTITUTE_PAIRS[h.ticker] || null;

      candidates.push({
        ticker: h.ticker,
        shares: shares,
        costBasis: totalCostBasis,
        currentValue: currentValue,
        unrealizedLoss: Math.round(unrealizedLoss * 100) / 100,
        lossPct: lossPct,
        substitute: substitute,
      });
    }
  }

  // Sort by largest loss first (most negative)
  candidates.sort(function(a, b) { return a.unrealizedLoss - b.unrealizedLoss; });

  return candidates;
}

/**
 * Estimate tax savings from harvesting a loss.
 * @param {number} unrealizedLoss - negative number (the loss amount)
 * @param {number} taxRate - combined tax rate as percentage (e.g. 24)
 * @returns {number} estimated savings (positive number)
 */
export function estimateTaxSavings(unrealizedLoss, taxRate) {
  if (!unrealizedLoss || !taxRate) return 0;
  var loss = Math.abs(unrealizedLoss);
  return Math.round(loss * (taxRate / 100) * 100) / 100;
}

/**
 * Calculate the wash sale window end date (31 days after sell).
 * @param {Date|string} sellDate
 * @returns {Date} date 31 days after sell
 */
export function calcWashSaleDate(sellDate) {
  var d = sellDate instanceof Date ? new Date(sellDate.getTime()) : new Date(sellDate);
  d.setDate(d.getDate() + 31);
  return d;
}

export { SUBSTITUTE_PAIRS };
