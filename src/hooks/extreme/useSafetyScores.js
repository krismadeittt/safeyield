import { useMemo } from 'react';
import { calcSafetyScore } from '../../utils/safety';

/**
 * Compute CAGR from an array of annual values (oldest first).
 * Returns growth rate as decimal (e.g. 0.05 = 5%) or null if not enough data.
 */
function calcTrendFromHistory(values) {
  if (!values || !Array.isArray(values) || values.length < 2) return null;
  var first = values[0];
  var last = values[values.length - 1];
  if (!first || first <= 0 || !last || last <= 0) return null;
  var years = values.length - 1;
  return Math.pow(last / first, 1 / years) - 1;
}

/**
 * Hook that calculates safety scores for all holdings using liveData fields
 * @param {Array} holdings - portfolio holdings
 * @param {object} liveData - current prices/dividends keyed by ticker
 * @returns {{ scores: {[ticker]: object}, loading: boolean }}
 */
export default function useSafetyScores(holdings, liveData) {
  var scores = useMemo(function() {
    if (!holdings || !holdings.length || !liveData) return {};

    var result = {};

    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = liveData[h.ticker] || {};

      // Earnings payout: prefer live.payout (%), fall back to annualDiv/eps
      var earningsPayout = null;
      if (live.payout != null) {
        earningsPayout = live.payout / 100;
      } else if (live.annualDiv && live.eps && live.eps > 0) {
        earningsPayout = live.annualDiv / live.eps;
      }

      // FCF payout: live.fcfPayout is a percentage
      var fcfPayout = live.fcfPayout != null ? live.fcfPayout / 100 : null;

      // Trends from annual history arrays
      var history = live.annualHistory || {};
      var fcfTrend = calcTrendFromHistory(history.fcf);
      var revenueTrend = calcTrendFromHistory(history.revenue);

      var fundData = {
        fcfPayoutRatio: fcfPayout,
        earningsPayoutRatio: earningsPayout,
        debtToEquity: live.debtToEquity != null ? live.debtToEquity : null,
        interestCoverage: live.interestCoverage != null ? live.interestCoverage : null,
        dividendStreak: live.streak != null ? live.streak : null,
        fcfTrend: fcfTrend,
        revenueTrend: revenueTrend,
      };

      var scoreData = calcSafetyScore(fundData);
      result[h.ticker] = {
        ticker: h.ticker,
        score: scoreData.score,
        grade: scoreData.grade,
        factors: scoreData.factors,
        yield: live.yield || (live.annualDiv && live.price ? (live.annualDiv / live.price) * 100 : null),
        payoutRatio: fundData.earningsPayoutRatio,
      };
    }

    return result;
  }, [holdings, liveData]);

  var loading = !holdings || !holdings.length || !liveData;

  return { scores: scores, loading: loading };
}
