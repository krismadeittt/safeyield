import { useMemo } from 'react';
import { getInflationRate, projectRealIncome, adjustForInflation } from '../../utils/inflation';
import { LATEST_CPI_YEAR } from '../../data/cpiData';

var DEFAULT_NOMINAL_GROWTH = 0.03; // 3% default dividend growth
var PROJECTION_YEARS = 10;

/**
 * Hook combining portfolio income with inflation data for projections
 * @param {number} totalAnnualIncome - total annual dividend income
 * @param {Array} holdings - portfolio holdings
 * @param {object} liveData - current prices/dividends keyed by ticker
 * @returns {{ projections: Array, currentRealIncome: number, avgInflation: number, loading: boolean }}
 */
export default function useInflation(totalAnnualIncome, holdings, liveData) {
  var result = useMemo(function() {
    if (!totalAnnualIncome || totalAnnualIncome <= 0) {
      return {
        projections: [],
        currentRealIncome: 0,
        avgInflation: 0,
      };
    }

    // Calculate average historical inflation (last 5 years)
    var fromYear = LATEST_CPI_YEAR - 5;
    var toYear = LATEST_CPI_YEAR;
    var avgInflation = getInflationRate(fromYear, toYear);

    // Use historical avg inflation for projection
    var projections = projectRealIncome(
      totalAnnualIncome,
      PROJECTION_YEARS,
      DEFAULT_NOMINAL_GROWTH,
      avgInflation
    );

    // Current real income adjusted from base year to latest CPI year
    var currentRealIncome = totalAnnualIncome; // already in current dollars

    return {
      projections: projections,
      currentRealIncome: Math.round(currentRealIncome * 100) / 100,
      avgInflation: Math.round(avgInflation * 10000) / 10000,
    };
  }, [totalAnnualIncome, holdings, liveData]);

  var loading = totalAnnualIncome == null;

  return {
    projections: result.projections,
    currentRealIncome: result.currentRealIncome,
    avgInflation: result.avgInflation,
    loading: loading,
  };
}
