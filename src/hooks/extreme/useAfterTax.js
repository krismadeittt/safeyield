import { useState, useEffect } from 'react';
import { calcDividendTax, calcPortfolioAfterTax } from '../../utils/tax';
import { getTaxClass } from '../../data/taxData';

/**
 * Hook that combines holdings + liveData + tax profile to calculate after-tax income
 * @param {Array} holdings - portfolio holdings
 * @param {object} liveData - current prices/dividends keyed by ticker
 * @param {object} taxProfile - user tax profile with rates
 * @returns {{ result: object|null, loading: boolean }}
 */
export default function useAfterTax(holdings, liveData, taxProfile) {
  var [result, setResult] = useState(null);
  var [loading, setLoading] = useState(true);

  useEffect(function() {
    var cancelled = false;

    function compute() {
      if (!holdings || !holdings.length || !liveData || !taxProfile) {
        if (!cancelled) {
          setResult(null);
          setLoading(false);
        }
        return;
      }

      try {
        var data = calcPortfolioAfterTax(holdings, liveData, taxProfile, getTaxClass);
        if (!cancelled) {
          setResult(data);
        }
      } catch (e) {
        if (!cancelled) {
          setResult(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    setLoading(true);
    compute();

    return function() { cancelled = true; };
  }, [holdings, liveData, taxProfile]);

  return { result: result, loading: loading };
}
