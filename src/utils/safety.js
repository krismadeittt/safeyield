// Dividend safety scoring algorithm
// Weighted multi-factor analysis returning a 0-100 score + letter grade

var WEIGHTS = {
  fcfPayout: 0.25,
  earningsPayout: 0.15,
  debtToEquity: 0.15,
  interestCoverage: 0.10,
  dividendStreak: 0.15,
  fcfTrend: 0.10,
  revenueTrend: 0.10,
};

var GRADE_THRESHOLDS = [
  { min: 80, grade: 'A' },
  { min: 65, grade: 'B' },
  { min: 50, grade: 'C' },
  { min: 35, grade: 'D' },
  { min: 0, grade: 'F' },
];

/**
 * Score a FCF or earnings payout ratio (lower is safer)
 * @param {number} ratio - payout ratio as decimal (e.g. 0.60 = 60%)
 * @returns {number} 0-100 score
 */
function scorePayout(ratio) {
  if (ratio == null || !isFinite(ratio)) return 50;
  if (ratio < 0) return 20; // negative earnings = risky
  if (ratio <= 0.30) return 100;
  if (ratio <= 0.50) return 85;
  if (ratio <= 0.65) return 70;
  if (ratio <= 0.80) return 50;
  if (ratio <= 1.00) return 30;
  return 10; // paying out more than 100%
}

/**
 * Score D/E ratio (lower is safer)
 * @param {number} de - debt to equity ratio
 * @returns {number} 0-100 score
 */
function scoreDebtToEquity(de) {
  if (de == null || !isFinite(de)) return 50;
  if (de < 0) return 30; // negative equity
  if (de <= 0.3) return 100;
  if (de <= 0.6) return 85;
  if (de <= 1.0) return 70;
  if (de <= 1.5) return 50;
  if (de <= 2.5) return 30;
  return 10;
}

/**
 * Score interest coverage ratio (higher is safer)
 * @param {number} icr - interest coverage ratio
 * @returns {number} 0-100 score
 */
function scoreInterestCoverage(icr) {
  if (icr == null || !isFinite(icr)) return 50;
  if (icr < 1) return 10;
  if (icr < 2) return 30;
  if (icr < 3) return 50;
  if (icr < 5) return 70;
  if (icr < 8) return 85;
  return 100;
}

/**
 * Score a growth trend (positive is better)
 * @param {number} rate - growth rate as decimal (e.g. 0.05 = 5%)
 * @returns {number} 0-100 score
 */
function scoreTrend(rate) {
  if (rate == null || !isFinite(rate)) return 50;
  if (rate >= 0.10) return 100;
  if (rate >= 0.05) return 85;
  if (rate >= 0.02) return 70;
  if (rate >= 0) return 55;
  if (rate >= -0.05) return 35;
  return 15;
}

/**
 * Assess dividend streak (consecutive years of paying/growing dividends)
 * @param {number} consecutiveYears
 * @returns {number} 0-100 score
 */
export function assessStreak(consecutiveYears) {
  if (consecutiveYears == null || consecutiveYears <= 0) return 10;
  if (consecutiveYears < 5) return 40;
  if (consecutiveYears < 10) return 60;
  if (consecutiveYears < 25) return 80;
  return 100; // Dividend aristocrat territory
}

/**
 * Calculate payout ratio
 * @param {number} dividendPerShare
 * @param {number} earningsPerShare
 * @returns {number} ratio as decimal
 */
export function calcPayoutRatio(dividendPerShare, earningsPerShare) {
  if (!earningsPerShare || earningsPerShare === 0) return null;
  return dividendPerShare / earningsPerShare;
}

/**
 * Get CSS color for a letter grade
 * @param {string} grade - 'A' through 'F'
 * @returns {string} CSS color
 */
export function getGradeColor(grade) {
  switch (grade) {
    case 'A': return '#22c55e';
    case 'B': return '#3CBFA3';
    case 'C': return '#eab308';
    case 'D': return '#f97316';
    case 'F': return '#ef4444';
    default: return '#9ca3af';
  }
}

/**
 * Calculate composite safety score from fundamental data
 * @param {object} fundamentals - object with fundamental data fields
 * @returns {{ score: number, grade: string, factors: Array<{name, weight, score, value}> }}
 */
export function calcSafetyScore(fundamentals) {
  if (!fundamentals) {
    return { score: 50, grade: 'C', factors: [] };
  }

  var factors = [];

  // FCF Payout Ratio
  var fcfPayoutScore = scorePayout(fundamentals.fcfPayoutRatio);
  factors.push({ name: 'FCF Payout Ratio', weight: WEIGHTS.fcfPayout, score: fcfPayoutScore, value: fundamentals.fcfPayoutRatio });

  // Earnings Payout Ratio
  var earningsPayoutScore = scorePayout(fundamentals.earningsPayoutRatio);
  factors.push({ name: 'Earnings Payout Ratio', weight: WEIGHTS.earningsPayout, score: earningsPayoutScore, value: fundamentals.earningsPayoutRatio });

  // D/E Ratio
  var deScore = scoreDebtToEquity(fundamentals.debtToEquity);
  factors.push({ name: 'Debt/Equity', weight: WEIGHTS.debtToEquity, score: deScore, value: fundamentals.debtToEquity });

  // Interest Coverage
  var icrScore = scoreInterestCoverage(fundamentals.interestCoverage);
  factors.push({ name: 'Interest Coverage', weight: WEIGHTS.interestCoverage, score: icrScore, value: fundamentals.interestCoverage });

  // Dividend Streak
  var streakScore = assessStreak(fundamentals.dividendStreak);
  factors.push({ name: 'Dividend Streak', weight: WEIGHTS.dividendStreak, score: streakScore, value: fundamentals.dividendStreak });

  // FCF Trend
  var fcfTrendScore = scoreTrend(fundamentals.fcfTrend);
  factors.push({ name: 'FCF Trend', weight: WEIGHTS.fcfTrend, score: fcfTrendScore, value: fundamentals.fcfTrend });

  // Revenue Trend
  var revTrendScore = scoreTrend(fundamentals.revenueTrend);
  factors.push({ name: 'Revenue Trend', weight: WEIGHTS.revenueTrend, score: revTrendScore, value: fundamentals.revenueTrend });

  // Weighted average
  var totalScore = 0;
  for (var i = 0; i < factors.length; i++) {
    totalScore += factors[i].score * factors[i].weight;
  }
  totalScore = Math.round(totalScore * 100) / 100;

  // Determine grade
  var grade = 'F';
  for (var g = 0; g < GRADE_THRESHOLDS.length; g++) {
    if (totalScore >= GRADE_THRESHOLDS[g].min) {
      grade = GRADE_THRESHOLDS[g].grade;
      break;
    }
  }

  return { score: totalScore, grade: grade, factors: factors };
}
