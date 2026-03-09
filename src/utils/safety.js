// Dividend safety scoring algorithm
// Weighted multi-factor analysis with smooth piecewise linear interpolation

var WEIGHTS = {
  fcfPayout: 0.25,
  earningsPayout: 0.15,
  debtToEquity: 0.10,
  interestCoverage: 0.10,
  dividendStreak: 0.20,
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

// Breakpoint tables: [inputValue, outputScore] pairs, sorted by input ascending
var FCF_PAYOUT_PTS = [
  [0.00, 100], [0.55, 100], [0.75, 88], [0.90, 70],
  [1.00, 45], [1.30, 15], [1.60, 5],
];

var EARNINGS_PAYOUT_PTS = [
  [0.00, 100], [0.55, 100], [0.75, 90], [0.90, 72],
  [1.00, 45], [1.30, 20], [1.60, 5],
];

var DEBT_EQUITY_PTS = [
  [0.0, 100], [0.6, 100], [1.2, 85], [1.8, 65],
  [2.5, 40], [4.0, 15], [6.0, 5],
];

var INTEREST_COVERAGE_PTS = [
  [0.0, 5], [1.0, 25], [2.0, 50], [3.0, 75],
  [5.0, 88], [8.0, 97], [12.0, 100],
];

var STREAK_PTS = [
  [0, 10], [3, 45], [5, 60], [10, 78],
  [15, 88], [25, 96], [40, 99], [50, 100],
];

var TREND_PTS = [
  [-0.15, 5], [-0.05, 30], [0.00, 70], [0.03, 85],
  [0.05, 93], [0.08, 98], [0.12, 100],
];

/**
 * Piecewise linear interpolation between breakpoints.
 * Clamps to endpoint values outside the range.
 * @param {number} x - input value
 * @param {Array<[number, number]>} pts - sorted [input, output] pairs
 * @returns {number} interpolated score
 */
export function interpolate(x, pts) {
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (var i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      var x0 = pts[i - 1][0], y0 = pts[i - 1][1];
      var x1 = pts[i][0], y1 = pts[i][1];
      return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
    }
  }
  return pts[pts.length - 1][1];
}

/**
 * Score FCF payout ratio (lower is safer)
 * @returns {number|null} 0-100 score, or null if data missing
 */
function scoreFcfPayout(ratio) {
  if (ratio == null || !isFinite(ratio)) return null;
  if (ratio < 0) return 15;
  return interpolate(ratio, FCF_PAYOUT_PTS);
}

/**
 * Score earnings payout ratio (lower is safer)
 * @returns {number|null} 0-100 score, or null if data missing
 */
function scoreEarningsPayout(ratio) {
  if (ratio == null || !isFinite(ratio)) return null;
  if (ratio < 0) return 20;
  return interpolate(ratio, EARNINGS_PAYOUT_PTS);
}

/**
 * Score D/E ratio (lower is safer)
 * D/E > 8 treated as negative equity from buybacks — neutral score
 * @returns {number|null} 0-100 score, or null if data missing
 */
function scoreDebtToEquity(de) {
  if (de == null || !isFinite(de)) return null;
  if (de < 0) return null;
  if (de > 8) return 60; // likely negative equity from buybacks
  return interpolate(de, DEBT_EQUITY_PTS);
}

/**
 * Score interest coverage ratio (higher is safer)
 * @returns {number|null} 0-100 score, or null if data missing
 */
function scoreInterestCoverage(icr) {
  if (icr == null || !isFinite(icr)) return null;
  if (icr < 0) return 5;
  return interpolate(icr, INTEREST_COVERAGE_PTS);
}

/**
 * Score dividend streak (longer is better)
 * @param {number} consecutiveYears
 * @returns {number} 0-100 score (never null — 0 streak = 10)
 */
export function assessStreak(consecutiveYears) {
  if (consecutiveYears == null || consecutiveYears <= 0) return 10;
  return interpolate(consecutiveYears, STREAK_PTS);
}

/**
 * Score a growth trend (positive is better)
 * @returns {number|null} 0-100 score, or null if data missing
 */
function scoreTrend(rate) {
  if (rate == null || !isFinite(rate)) return null;
  return interpolate(rate, TREND_PTS);
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
 * Calculate composite safety score from fundamental data.
 * Missing/null factors are excluded and their weight redistributed.
 * @param {object} fundamentals - object with fundamental data fields
 * @returns {{ score: number, grade: string, factors: Array<{name, weight, score, value, excluded}> }}
 */
export function calcSafetyScore(fundamentals) {
  if (!fundamentals) {
    return { score: 50, grade: 'C', factors: [] };
  }

  var factors = [];

  // FCF Payout Ratio
  var fcfPayoutScore = scoreFcfPayout(fundamentals.fcfPayoutRatio);
  factors.push({ name: 'FCF Payout Ratio', weight: WEIGHTS.fcfPayout, score: fcfPayoutScore, value: fundamentals.fcfPayoutRatio, excluded: fcfPayoutScore == null });

  // Earnings Payout Ratio
  var earningsPayoutScore = scoreEarningsPayout(fundamentals.earningsPayoutRatio);
  factors.push({ name: 'Earnings Payout Ratio', weight: WEIGHTS.earningsPayout, score: earningsPayoutScore, value: fundamentals.earningsPayoutRatio, excluded: earningsPayoutScore == null });

  // D/E Ratio
  var deScore = scoreDebtToEquity(fundamentals.debtToEquity);
  factors.push({ name: 'Debt/Equity', weight: WEIGHTS.debtToEquity, score: deScore, value: fundamentals.debtToEquity, excluded: deScore == null });

  // Interest Coverage
  var icrScore = scoreInterestCoverage(fundamentals.interestCoverage);
  factors.push({ name: 'Interest Coverage', weight: WEIGHTS.interestCoverage, score: icrScore, value: fundamentals.interestCoverage, excluded: icrScore == null });

  // Dividend Streak (never null — 0 streak gets 10)
  var streakScore = assessStreak(fundamentals.dividendStreak);
  factors.push({ name: 'Dividend Streak', weight: WEIGHTS.dividendStreak, score: streakScore, value: fundamentals.dividendStreak, excluded: false });

  // FCF Trend
  var fcfTrendScore = scoreTrend(fundamentals.fcfTrend);
  factors.push({ name: 'FCF Trend', weight: WEIGHTS.fcfTrend, score: fcfTrendScore, value: fundamentals.fcfTrend, excluded: fcfTrendScore == null });

  // Revenue Trend
  var revTrendScore = scoreTrend(fundamentals.revenueTrend);
  factors.push({ name: 'Revenue Trend', weight: WEIGHTS.revenueTrend, score: revTrendScore, value: fundamentals.revenueTrend, excluded: revTrendScore == null });

  // Compute weighted average using only non-excluded factors
  var validWeight = 0;
  for (var i = 0; i < factors.length; i++) {
    if (!factors[i].excluded) validWeight += factors[i].weight;
  }

  // If no valid factors, return default
  if (validWeight === 0) {
    return { score: 50, grade: 'C', factors: factors };
  }

  var totalScore = 0;
  for (var j = 0; j < factors.length; j++) {
    if (!factors[j].excluded) {
      totalScore += factors[j].score * (factors[j].weight / validWeight);
    }
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
