import { describe, it, expect } from 'vitest';

// ============================================================================
// Inline FIRE calculation logic (mirrors useFIRE hook)
// ============================================================================

function calcFireNumber(annualExpenses, targetYield) {
  if (!targetYield || targetYield <= 0) return 0;
  return Math.round(annualExpenses / (targetYield / 100));
}

function calcProgressPct(currentPortfolioValue, fireNumber) {
  if (fireNumber <= 0) return 0;
  var pct = (currentPortfolioValue / fireNumber) * 100;
  return Math.min(Math.round(pct * 10) / 10, 100);
}

function projectFIRE(currentValue, annualExpenses, monthlyContribution, targetYield, priceAppreciation, years) {
  var results = [];
  var portfolioValue = currentValue || 0;
  var annualContrib = monthlyContribution * 12;
  var growthRate = priceAppreciation / 100;
  var yieldRate = targetYield / 100;

  for (var y = 0; y <= years; y++) {
    var dividendIncome = portfolioValue * yieldRate;
    results.push({
      year: y,
      portfolioValue: Math.round(portfolioValue),
      dividendIncome: Math.round(dividendIncome),
      expenses: annualExpenses,
    });
    portfolioValue = portfolioValue * (1 + growthRate) + annualContrib + dividendIncome;
  }
  return results;
}

function findCrossoverYear(projections) {
  for (var i = 0; i < projections.length; i++) {
    if (projections[i].dividendIncome >= projections[i].expenses) {
      return projections[i].year;
    }
  }
  return null;
}

// ============================================================================
// Tests
// ============================================================================

describe('FIRE number calculation', function() {
  it('calculates correctly with standard inputs', function() {
    // $3000/mo expenses, 4.5% target yield
    var fireNumber = calcFireNumber(36000, 4.5);
    expect(fireNumber).toBe(800000);
  });

  it('returns 0 for zero target yield', function() {
    expect(calcFireNumber(36000, 0)).toBe(0);
  });

  it('returns 0 for negative target yield', function() {
    expect(calcFireNumber(36000, -5)).toBe(0);
  });

  it('handles high expenses', function() {
    // $10,000/mo, 4% yield = $3,000,000
    var fireNumber = calcFireNumber(120000, 4);
    expect(fireNumber).toBe(3000000);
  });

  it('handles very low yield', function() {
    var fireNumber = calcFireNumber(36000, 1);
    expect(fireNumber).toBe(3600000);
  });
});

describe('FIRE progress percentage', function() {
  it('calculates progress correctly at 50%', function() {
    var pct = calcProgressPct(400000, 800000);
    expect(pct).toBe(50);
  });

  it('caps at 100%', function() {
    var pct = calcProgressPct(1000000, 800000);
    expect(pct).toBe(100);
  });

  it('returns 0 for zero portfolio', function() {
    var pct = calcProgressPct(0, 800000);
    expect(pct).toBe(0);
  });

  it('returns 0 when fire number is zero', function() {
    var pct = calcProgressPct(100000, 0);
    expect(pct).toBe(0);
  });

  it('handles small progress', function() {
    var pct = calcProgressPct(8000, 800000);
    expect(pct).toBe(1);
  });
});

describe('FIRE projections', function() {
  it('returns correct number of years', function() {
    var projections = projectFIRE(100000, 36000, 500, 4.5, 6, 30);
    expect(projections.length).toBe(31); // 0 through 30
  });

  it('year 0 shows current values', function() {
    var projections = projectFIRE(100000, 36000, 500, 4.5, 6, 10);
    expect(projections[0].year).toBe(0);
    expect(projections[0].portfolioValue).toBe(100000);
    expect(projections[0].dividendIncome).toBe(4500); // 100k * 4.5%
    expect(projections[0].expenses).toBe(36000);
  });

  it('portfolio grows over time', function() {
    var projections = projectFIRE(100000, 36000, 500, 4.5, 6, 10);
    expect(projections[5].portfolioValue).toBeGreaterThan(projections[0].portfolioValue);
    expect(projections[10].portfolioValue).toBeGreaterThan(projections[5].portfolioValue);
  });

  it('dividend income grows over time', function() {
    var projections = projectFIRE(100000, 36000, 500, 4.5, 6, 10);
    expect(projections[10].dividendIncome).toBeGreaterThan(projections[0].dividendIncome);
  });

  it('expenses stay constant', function() {
    var projections = projectFIRE(100000, 36000, 500, 4.5, 6, 30);
    for (var i = 0; i < projections.length; i++) {
      expect(projections[i].expenses).toBe(36000);
    }
  });
});

describe('FIRE crossover detection', function() {
  it('detects crossover year', function() {
    var projections = projectFIRE(200000, 36000, 1000, 4.5, 6, 30);
    var crossover = findCrossoverYear(projections);
    expect(crossover).not.toBeNull();
    expect(typeof crossover).toBe('number');
    expect(crossover).toBeGreaterThan(0);
    expect(crossover).toBeLessThanOrEqual(30);
  });

  it('returns null when income never reaches expenses', function() {
    // Very small portfolio, no contributions, very high expenses
    var projections = projectFIRE(1000, 100000, 0, 2, 3, 30);
    var crossover = findCrossoverYear(projections);
    expect(crossover).toBeNull();
  });

  it('crossover year 0 when already FIRE', function() {
    // Portfolio already generating enough income
    var projections = projectFIRE(2000000, 36000, 0, 4.5, 6, 10);
    var crossover = findCrossoverYear(projections);
    expect(crossover).toBe(0);
  });
});

describe('FIRE edge cases', function() {
  it('zero expenses means instant FIRE', function() {
    var projections = projectFIRE(100000, 0, 500, 4.5, 6, 10);
    var crossover = findCrossoverYear(projections);
    expect(crossover).toBe(0);
  });

  it('zero income with zero expenses is still FIRE', function() {
    var projections = projectFIRE(0, 0, 0, 4.5, 6, 5);
    var crossover = findCrossoverYear(projections);
    expect(crossover).toBe(0); // 0 income >= 0 expenses
  });

  it('100% progress when portfolio equals fire number', function() {
    var fireNumber = calcFireNumber(36000, 4.5);
    var pct = calcProgressPct(fireNumber, fireNumber);
    expect(pct).toBe(100);
  });

  it('handles zero initial portfolio with contributions', function() {
    var projections = projectFIRE(0, 24000, 500, 4.5, 6, 30);
    expect(projections[0].portfolioValue).toBe(0);
    expect(projections[0].dividendIncome).toBe(0);
    // After contributions kick in, portfolio should grow
    expect(projections[5].portfolioValue).toBeGreaterThan(0);
  });
});
