import { describe, it, expect } from 'vitest';

// ============================================================================
// Inline scenario simulation logic (mirrors useWhatIf hook)
// ============================================================================

function simulateScenario(scenario, holdings, liveData) {
  // Deep-copy holdings
  var simHoldings = holdings.map(function(h) {
    return Object.assign({}, h);
  });

  var extraContributions = 0;

  // Apply each change
  for (var i = 0; i < scenario.changes.length; i++) {
    var change = scenario.changes[i];

    if (change.type === 'add_holding') {
      var exists = simHoldings.find(function(h) { return h.ticker === change.ticker; });
      if (exists) {
        exists.shares = (exists.shares || 0) + (change.value || 0);
      } else {
        var live = (liveData && liveData[change.ticker]) || {};
        simHoldings.push({
          ticker: change.ticker,
          shares: change.value || 0,
          price: live.price || 0,
          div: live.annualDiv || 0,
          yld: live.divYield || 0,
        });
      }
    } else if (change.type === 'remove_holding') {
      simHoldings = simHoldings.filter(function(h) { return h.ticker !== change.ticker; });
    } else if (change.type === 'change_shares') {
      var target = simHoldings.find(function(h) { return h.ticker === change.ticker; });
      if (target) target.shares = change.value || 0;
    } else if (change.type === 'div_cut') {
      var cutTarget = simHoldings.find(function(h) { return h.ticker === change.ticker; });
      if (cutTarget) {
        var cutPct = (change.value || 0) / 100;
        cutTarget.div = (cutTarget.div || 0) * (1 - cutPct);
      }
    } else if (change.type === 'div_raise') {
      var raiseTarget = simHoldings.find(function(h) { return h.ticker === change.ticker; });
      if (raiseTarget) {
        var raisePct = (change.value || 0) / 100;
        raiseTarget.div = (raiseTarget.div || 0) * (1 + raisePct);
      }
    } else if (change.type === 'contribution') {
      extraContributions += (change.value || 0);
    }
  }

  // Recalculate totals
  var totalIncome = 0;
  var totalValue = 0;

  for (var j = 0; j < simHoldings.length; j++) {
    var h = simHoldings[j];
    var hLive = (liveData && liveData[h.ticker]) || {};
    var price = hLive.price || h.price || 0;
    var annualDiv = hLive.annualDiv || h.div || 0;
    var shares = h.shares || 0;

    if (h.div !== undefined && h.div !== (hLive.annualDiv || 0)) {
      annualDiv = h.div;
    }

    totalIncome += annualDiv * shares;
    totalValue += price * shares;
  }

  totalValue += extraContributions * 12;

  var portfolioYield = totalValue > 0 ? Math.round((totalIncome / totalValue) * 10000) / 100 : 0;

  return {
    name: scenario.name,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalValue: Math.round(totalValue),
    yield: portfolioYield,
    monthlyIncome: Math.round((totalIncome / 12) * 100) / 100,
    holdings: simHoldings,
  };
}

// ============================================================================
// Test data
// ============================================================================

var MOCK_HOLDINGS = [
  { ticker: 'SCHD', shares: 100, price: 80, div: 2.40, yld: 3.0 },
  { ticker: 'VYM', shares: 50, price: 110, div: 3.30, yld: 3.0 },
  { ticker: 'O', shares: 200, price: 55, div: 3.08, yld: 5.6 },
];

var MOCK_LIVE = {
  SCHD: { price: 80, annualDiv: 2.40, divYield: 3.0 },
  VYM: { price: 110, annualDiv: 3.30, divYield: 3.0 },
  O: { price: 55, annualDiv: 3.08, divYield: 5.6 },
  AAPL: { price: 175, annualDiv: 0.96, divYield: 0.5 },
};

// ============================================================================
// Tests
// ============================================================================

describe('What-If: div_cut change', function() {
  it('reduces dividend income by cut percentage', function() {
    var scenario = { id: 's1', name: 'Test', changes: [
      { type: 'div_cut', ticker: 'O', value: 50 },
    ]};
    var result = simulateScenario(scenario, MOCK_HOLDINGS, MOCK_LIVE);
    // O was 200 shares * $3.08 = $616, after 50% cut = $308
    // SCHD: 100 * 2.40 = 240, VYM: 50 * 3.30 = 165
    // Total = 240 + 165 + 308 = 713
    expect(result.totalIncome).toBeCloseTo(713, 0);
  });
});

describe('What-If: add_holding change', function() {
  it('adds a new holding to the portfolio', function() {
    var scenario = { id: 's1', name: 'Test', changes: [
      { type: 'add_holding', ticker: 'AAPL', value: 50 },
    ]};
    var result = simulateScenario(scenario, MOCK_HOLDINGS, MOCK_LIVE);
    // AAPL: 50 * $0.96 = $48 added
    // Original: 240 + 165 + 616 = 1021
    expect(result.totalIncome).toBeCloseTo(1069, 0);
    expect(result.holdings.length).toBe(4);
  });

  it('adds shares to existing holding', function() {
    var scenario = { id: 's1', name: 'Test', changes: [
      { type: 'add_holding', ticker: 'SCHD', value: 50 },
    ]};
    var result = simulateScenario(scenario, MOCK_HOLDINGS, MOCK_LIVE);
    // SCHD: now 150 shares * 2.40 = 360 (was 240)
    // Total: 360 + 165 + 616 = 1141
    expect(result.totalIncome).toBeCloseTo(1141, 0);
    expect(result.holdings.length).toBe(3); // No new row, just increased shares
  });
});

describe('What-If: remove_holding change', function() {
  it('removes a holding from the portfolio', function() {
    var scenario = { id: 's1', name: 'Test', changes: [
      { type: 'remove_holding', ticker: 'O' },
    ]};
    var result = simulateScenario(scenario, MOCK_HOLDINGS, MOCK_LIVE);
    // Without O: 240 + 165 = 405
    expect(result.totalIncome).toBeCloseTo(405, 0);
    expect(result.holdings.length).toBe(2);
  });
});

describe('What-If: change_shares', function() {
  it('changes share count for a holding', function() {
    var scenario = { id: 's1', name: 'Test', changes: [
      { type: 'change_shares', ticker: 'O', value: 100 },
    ]};
    var result = simulateScenario(scenario, MOCK_HOLDINGS, MOCK_LIVE);
    // O: 100 shares * 3.08 = 308 (was 616)
    // Total: 240 + 165 + 308 = 713
    expect(result.totalIncome).toBeCloseTo(713, 0);
  });
});

describe('What-If: multiple changes', function() {
  it('applies multiple changes correctly', function() {
    var scenario = { id: 's1', name: 'Test', changes: [
      { type: 'div_raise', ticker: 'SCHD', value: 10 }, // 10% raise on SCHD
      { type: 'remove_holding', ticker: 'VYM' },
      { type: 'add_holding', ticker: 'AAPL', value: 100 },
    ]};
    var result = simulateScenario(scenario, MOCK_HOLDINGS, MOCK_LIVE);
    // SCHD: 100 * (2.40 * 1.10) = 264
    // VYM: removed
    // O: 200 * 3.08 = 616
    // AAPL: 100 * 0.96 = 96
    // Total = 264 + 616 + 96 = 976
    expect(result.totalIncome).toBeCloseTo(976, 0);
    expect(result.holdings.length).toBe(3); // SCHD, O, AAPL
  });
});

describe('What-If: empty scenario', function() {
  it('returns current values with no changes', function() {
    var scenario = { id: 's1', name: 'Test', changes: [] };
    var result = simulateScenario(scenario, MOCK_HOLDINGS, MOCK_LIVE);
    // Original: 240 + 165 + 616 = 1021
    expect(result.totalIncome).toBeCloseTo(1021, 0);
    expect(result.holdings.length).toBe(3);
  });
});

describe('What-If: contribution change', function() {
  it('adds monthly contribution annualized to portfolio value', function() {
    var scenario = { id: 's1', name: 'Test', changes: [
      { type: 'contribution', value: 500 },
    ]};
    var result = simulateScenario(scenario, MOCK_HOLDINGS, MOCK_LIVE);
    // Portfolio value: SCHD 8000 + VYM 5500 + O 11000 = 24500
    // Plus contribution: 500 * 12 = 6000
    expect(result.totalValue).toBe(30500);
  });
});

describe('What-If: div_raise change', function() {
  it('increases dividend income by raise percentage', function() {
    var scenario = { id: 's1', name: 'Test', changes: [
      { type: 'div_raise', ticker: 'SCHD', value: 20 },
    ]};
    var result = simulateScenario(scenario, MOCK_HOLDINGS, MOCK_LIVE);
    // SCHD: 100 * (2.40 * 1.20) = 288 (was 240)
    // Total: 288 + 165 + 616 = 1069
    expect(result.totalIncome).toBeCloseTo(1069, 0);
  });
});
