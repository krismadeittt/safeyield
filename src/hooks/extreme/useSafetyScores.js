import { useMemo } from 'react';
import { calcSafetyScore } from '../../utils/safety';

/**
 * Hook that calculates safety scores for all holdings using fundamentals data
 * @param {Array} holdings - portfolio holdings
 * @param {object} liveData - current prices/dividends/fundamentals keyed by ticker
 * @returns {{ scores: {[ticker]: object}, loading: boolean }}
 */
export default function useSafetyScores(holdings, liveData) {
  var scores = useMemo(function() {
    if (!holdings || !holdings.length || !liveData) return {};

    var result = {};

    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = liveData[h.ticker] || {};
      var fundamentals = live.fundamentals || null;

      // Build fundamentals object from available data
      var fundData = null;
      if (fundamentals) {
        fundData = {
          fcfPayoutRatio: fundamentals.fcfPayoutRatio != null ? fundamentals.fcfPayoutRatio : null,
          earningsPayoutRatio: fundamentals.earningsPayoutRatio != null ? fundamentals.earningsPayoutRatio : null,
          debtToEquity: fundamentals.debtToEquity != null ? fundamentals.debtToEquity : null,
          interestCoverage: fundamentals.interestCoverage != null ? fundamentals.interestCoverage : null,
          dividendStreak: fundamentals.dividendStreak != null ? fundamentals.dividendStreak : null,
          fcfTrend: fundamentals.fcfTrend != null ? fundamentals.fcfTrend : null,
          revenueTrend: fundamentals.revenueTrend != null ? fundamentals.revenueTrend : null,
        };
      } else {
        // Estimate from basic live data if fundamentals not available
        var payoutRatio = null;
        if (live.annualDiv && live.eps && live.eps > 0) {
          payoutRatio = live.annualDiv / live.eps;
        }

        fundData = {
          fcfPayoutRatio: null,
          earningsPayoutRatio: payoutRatio,
          debtToEquity: null,
          interestCoverage: null,
          dividendStreak: live.divStreak || null,
          fcfTrend: null,
          revenueTrend: null,
        };
      }

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
