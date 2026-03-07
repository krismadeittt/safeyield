import { useState, useCallback } from 'react';

var nextId = 1;

/**
 * What-If Scenario Builder hook.
 * Allows building and comparing hypothetical portfolio scenarios.
 */
export default function useWhatIf() {
  var [scenarios, setScenarios] = useState([]);
  var [results, setResults] = useState({});

  var addScenario = useCallback(function(name) {
    var currentId = nextId++;
    var id = 'scenario_' + currentId;
    setScenarios(function(prev) {
      if (prev.length >= 3) return prev; // Max 3 scenarios
      return prev.concat([{ id: id, name: name || 'Scenario ' + currentId, changes: [] }]);
    });
    return id;
  }, []);

  var removeScenario = useCallback(function(id) {
    setScenarios(function(prev) {
      return prev.filter(function(s) { return s.id !== id; });
    });
    setResults(function(prev) {
      var next = Object.assign({}, prev);
      delete next[id];
      return next;
    });
  }, []);

  var addChange = useCallback(function(scenarioId, change) {
    setScenarios(function(prev) {
      return prev.map(function(s) {
        if (s.id !== scenarioId) return s;
        return Object.assign({}, s, { changes: s.changes.concat([change]) });
      });
    });
  }, []);

  var removeChange = useCallback(function(scenarioId, changeIdx) {
    setScenarios(function(prev) {
      return prev.map(function(s) {
        if (s.id !== scenarioId) return s;
        var newChanges = s.changes.filter(function(_, i) { return i !== changeIdx; });
        return Object.assign({}, s, { changes: newChanges });
      });
    });
  }, []);

  /**
   * Simulate a scenario by applying changes to a copy of the holdings.
   * @param {Object} scenario - { id, name, changes }
   * @param {Array} holdings - current holdings
   * @param {Object} liveData - live market data
   * @returns {{ name, totalIncome, totalValue, yield, holdings }}
   */
  var simulateScenario = useCallback(function(scenario, holdings, liveData) {
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

      // Apply any div changes from the scenario
      if (h.div !== undefined && h.div !== (hLive.annualDiv || 0)) {
        annualDiv = h.div;
      }

      totalIncome += annualDiv * shares;
      totalValue += price * shares;
    }

    // Add monthly contributions annualized to portfolio value
    totalValue += extraContributions * 12;

    var portfolioYield = totalValue > 0 ? Math.round((totalIncome / totalValue) * 10000) / 100 : 0;

    // Find top holding % concentration
    var topHoldingPct = 0;
    for (var k = 0; k < simHoldings.length; k++) {
      var hk = simHoldings[k];
      var lk = (liveData && liveData[hk.ticker]) || {};
      var hVal = (hk.shares || 0) * (lk.price || hk.price || 0);
      var pct = totalValue > 0 ? (hVal / totalValue) * 100 : 0;
      if (pct > topHoldingPct) topHoldingPct = pct;
    }

    return {
      name: scenario.name,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalValue: Math.round(totalValue),
      yield: portfolioYield,
      monthlyIncome: Math.round((totalIncome / 12) * 100) / 100,
      topHoldingPct: Math.round(topHoldingPct * 10) / 10,
      holdings: simHoldings,
    };
  }, []);

  return {
    scenarios: scenarios,
    addScenario: addScenario,
    removeScenario: removeScenario,
    addChange: addChange,
    removeChange: removeChange,
    simulateScenario: simulateScenario,
    results: results,
    setResults: setResults,
  };
}
