import { useState, useMemo } from 'react';

/**
 * FIRE (Financial Independence / Retire Early) calculator hook.
 * Projects when dividend income will cover monthly expenses.
 */
export default function useFIRE(totalAnnualDividendIncome, holdings, liveData) {
  var [monthlyExpenses, setMonthlyExpenses] = useState(3000);
  var [monthlyContribution, setMonthlyContribution] = useState(500);
  var [targetYield, setTargetYield] = useState(4.5);

  var annualExpenses = monthlyExpenses * 12;
  var projectionYears = 30;
  var priceAppreciation = 6; // default 6% annual

  var fireNumber = useMemo(function() {
    if (!targetYield || targetYield <= 0) return 0;
    return Math.round(annualExpenses / (targetYield / 100));
  }, [annualExpenses, targetYield]);

  var currentPortfolioValue = useMemo(function() {
    if (!holdings || !holdings.length) return 0;
    var total = 0;
    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = (liveData && liveData[h.ticker]) || {};
      var price = live.price || h.price || 0;
      total += (h.shares || 0) * price;
    }
    return total;
  }, [holdings, liveData]);

  var progressPct = useMemo(function() {
    if (fireNumber <= 0) return 0;
    var pct = (currentPortfolioValue / fireNumber) * 100;
    return Math.min(Math.round(pct * 10) / 10, 100);
  }, [currentPortfolioValue, fireNumber]);

  var projections = useMemo(function() {
    return projectFIRE();
  }, [currentPortfolioValue, totalAnnualDividendIncome, monthlyContribution, targetYield, priceAppreciation, annualExpenses, projectionYears]);

  function projectFIRE() {
    var results = [];
    var portfolioValue = currentPortfolioValue || 0;
    var annualContrib = monthlyContribution * 12;
    var growthRate = priceAppreciation / 100;
    var yieldRate = targetYield / 100;

    for (var y = 0; y <= projectionYears; y++) {
      var dividendIncome = portfolioValue * yieldRate;
      results.push({
        year: y,
        portfolioValue: Math.round(portfolioValue),
        dividendIncome: Math.round(dividendIncome),
        expenses: annualExpenses,
      });

      // Grow portfolio: contributions + dividend reinvestment + price appreciation
      portfolioValue = portfolioValue * (1 + growthRate) + annualContrib + dividendIncome;
    }
    return results;
  }

  var crossoverYear = useMemo(function() {
    for (var i = 0; i < projections.length; i++) {
      if (projections[i].dividendIncome >= projections[i].expenses) {
        return projections[i].year;
      }
    }
    return null; // Never crosses in projection window
  }, [projections]);

  return {
    fireNumber: fireNumber,
    progressPct: progressPct,
    crossoverYear: crossoverYear,
    projections: projections,
    monthlyExpenses: monthlyExpenses,
    setMonthlyExpenses: setMonthlyExpenses,
    monthlyContribution: monthlyContribution,
    setMonthlyContribution: setMonthlyContribution,
    targetYield: targetYield,
    setTargetYield: setTargetYield,
  };
}
