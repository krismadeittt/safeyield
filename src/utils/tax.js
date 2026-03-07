// Federal tax bracket tables (2024 tax year)
// Source: IRS Revenue Procedure 2023-34

const BRACKETS_2024 = {
  single: [
    { limit: 11600, rate: 10 },
    { limit: 47150, rate: 12 },
    { limit: 100525, rate: 22 },
    { limit: 191950, rate: 24 },
    { limit: 243725, rate: 32 },
    { limit: 609350, rate: 35 },
    { limit: Infinity, rate: 37 },
  ],
  married_joint: [
    { limit: 23200, rate: 10 },
    { limit: 94300, rate: 12 },
    { limit: 201050, rate: 22 },
    { limit: 383900, rate: 24 },
    { limit: 487450, rate: 32 },
    { limit: 731200, rate: 35 },
    { limit: Infinity, rate: 37 },
  ],
  married_separate: [
    { limit: 11600, rate: 10 },
    { limit: 47150, rate: 12 },
    { limit: 100525, rate: 22 },
    { limit: 191950, rate: 24 },
    { limit: 243725, rate: 32 },
    { limit: 365600, rate: 35 },
    { limit: Infinity, rate: 37 },
  ],
  head_of_household: [
    { limit: 16550, rate: 10 },
    { limit: 63100, rate: 12 },
    { limit: 100500, rate: 22 },
    { limit: 191950, rate: 24 },
    { limit: 243700, rate: 32 },
    { limit: 609350, rate: 35 },
    { limit: Infinity, rate: 37 },
  ],
};

// Qualified dividend / LTCG rate thresholds (2024)
const QUALIFIED_THRESHOLDS = {
  single: [
    { limit: 47025, rate: 0 },
    { limit: 518900, rate: 15 },
    { limit: Infinity, rate: 20 },
  ],
  married_joint: [
    { limit: 94050, rate: 0 },
    { limit: 583750, rate: 15 },
    { limit: Infinity, rate: 20 },
  ],
  married_separate: [
    { limit: 47025, rate: 0 },
    { limit: 291850, rate: 15 },
    { limit: Infinity, rate: 20 },
  ],
  head_of_household: [
    { limit: 63000, rate: 0 },
    { limit: 551350, rate: 15 },
    { limit: Infinity, rate: 20 },
  ],
};

// NIIT (Net Investment Income Tax) threshold
const NIIT_THRESHOLDS = {
  single: 200000,
  married_joint: 250000,
  married_separate: 125000,
  head_of_household: 200000,
};
const NIIT_RATE = 3.8;

export function getFederalBrackets(filingStatus) {
  return BRACKETS_2024[filingStatus] || BRACKETS_2024.single;
}

export function getQualifiedBrackets(filingStatus) {
  return QUALIFIED_THRESHOLDS[filingStatus] || QUALIFIED_THRESHOLDS.single;
}

/**
 * Calculate marginal federal tax on ordinary income
 */
export function calcFederalTax(taxableIncome, filingStatus) {
  // MATH AUDIT FIX: negative/null income should return 0 tax, not negative
  if (!taxableIncome || taxableIncome <= 0) return 0;
  var brackets = getFederalBrackets(filingStatus);
  var tax = 0;
  var prev = 0;
  for (var i = 0; i < brackets.length; i++) {
    var bracket = brackets[i];
    if (taxableIncome <= prev) break;
    var taxable = Math.min(taxableIncome, bracket.limit) - prev;
    tax += taxable * (bracket.rate / 100);
    prev = bracket.limit;
  }
  return Math.round(tax * 100) / 100;
}

/**
 * Get effective federal rate for ordinary income
 */
export function calcEffectiveRate(taxableIncome, filingStatus) {
  if (!taxableIncome || taxableIncome <= 0) return 0;
  var tax = calcFederalTax(taxableIncome, filingStatus);
  return Math.round((tax / taxableIncome) * 10000) / 100;
}

/**
 * Get marginal rate at a given income level
 */
export function getMarginalRate(taxableIncome, filingStatus) {
  var brackets = getFederalBrackets(filingStatus);
  for (var i = 0; i < brackets.length; i++) {
    if (taxableIncome <= brackets[i].limit) return brackets[i].rate;
  }
  return brackets[brackets.length - 1].rate;
}

/**
 * Get qualified dividend / LTCG rate at given taxable income
 */
export function getQualifiedRate(taxableIncome, filingStatus) {
  var brackets = getQualifiedBrackets(filingStatus);
  for (var i = 0; i < brackets.length; i++) {
    if (taxableIncome <= brackets[i].limit) return brackets[i].rate;
  }
  return brackets[brackets.length - 1].rate;
}

/**
 * Calculate NIIT (3.8% on investment income above threshold)
 */
export function calcNIIT(totalIncome, investmentIncome, filingStatus) {
  var threshold = NIIT_THRESHOLDS[filingStatus] || NIIT_THRESHOLDS.single;
  var excess = totalIncome - threshold;
  if (excess <= 0) return 0;
  var niitBase = Math.min(excess, investmentIncome);
  return Math.round(niitBase * (NIIT_RATE / 100) * 100) / 100;
}

/**
 * Calculate tax on a dividend based on its classification
 * @param {number} amount - total dividend amount
 * @param {'qualified'|'ordinary'|'partial'} classification - from taxData.js
 * @param {object} profile - user tax profile
 * @returns {{ grossAmount, taxAmount, netAmount, effectiveRate }}
 */
export function calcDividendTax(amount, classification, profile) {
  if (!amount || amount <= 0 || !profile) {
    return { grossAmount: amount || 0, taxAmount: 0, netAmount: amount || 0, effectiveRate: 0 };
  }

  var federalRate;
  if (classification === 'qualified') {
    federalRate = profile.qualified_rate || 0;
  } else if (classification === 'partial') {
    // Partial = mix of qualified and ordinary (estimate 50/50)
    federalRate = ((profile.qualified_rate || 0) + (profile.ordinary_rate || 0)) / 2;
  } else {
    // ordinary, reit, unqualified
    federalRate = profile.ordinary_rate || 0;
  }

  var stateRate = profile.state_rate || 0;
  var localRate = profile.local_rate || 0;
  var totalRate = federalRate + stateRate + localRate;
  totalRate = Math.min(totalRate, 99.9); // sanity cap

  var taxAmount = Math.round(amount * (totalRate / 100) * 100) / 100;
  var netAmount = Math.round((amount - taxAmount) * 100) / 100;

  return {
    grossAmount: amount,
    taxAmount: taxAmount,
    netAmount: netAmount,
    effectiveRate: Math.round(totalRate * 100) / 100,
  };
}

/**
 * Calculate after-tax income for entire portfolio
 * @param {Array} holdings - portfolio holdings
 * @param {object} liveData - current prices/dividends
 * @param {object} profile - user tax profile
 * @param {Function} getTaxClass - from taxData.js
 * @returns {{ totalGross, totalTax, totalNet, taxDragPct, perHolding: [] }}
 */
export function calcPortfolioAfterTax(holdings, liveData, profile, getTaxClass) {
  var totalGross = 0;
  var totalTax = 0;
  var perHolding = [];

  for (var i = 0; i < holdings.length; i++) {
    var h = holdings[i];
    var live = liveData[h.ticker] || {};
    var annualDiv = (live.annualDiv || h.div || 0) * (h.shares || 0);
    var classification = getTaxClass ? getTaxClass(h.ticker) : 'qualified';
    var result = calcDividendTax(annualDiv, classification, profile);

    totalGross += result.grossAmount;
    totalTax += result.taxAmount;

    perHolding.push({
      ticker: h.ticker,
      shares: h.shares,
      classification: classification,
      ...result,
    });
  }

  var totalNet = Math.round((totalGross - totalTax) * 100) / 100;
  var taxDragPct = totalGross > 0 ? Math.round((totalTax / totalGross) * 10000) / 100 : 0;

  return { totalGross: totalGross, totalTax: totalTax, totalNet: totalNet, taxDragPct: taxDragPct, perHolding: perHolding };
}
