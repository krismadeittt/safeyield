import React, { useState, useMemo } from 'react';

export default function FIRESensitivity({ baseProjections, crossoverYear, isMobile }) {
  var [contribAdjust, setContribAdjust] = useState(0); // Additional monthly $ slider

  // Build three scenarios: Conservative, Base, Aggressive
  var scenarios = useMemo(function() {
    if (!baseProjections || baseProjections.length < 2) return [];

    // Extract base parameters from projections
    var baseExpenses = baseProjections[0].expenses;
    var baseYield = baseProjections.length > 1 && baseProjections[0].portfolioValue > 0
      ? baseProjections[0].dividendIncome / baseProjections[0].portfolioValue
      : 0.045;

    // Conservative: lower yield, higher expenses
    var conservativeExpenses = Math.round(baseExpenses * 1.15);
    var conservativeYield = baseYield * 0.8;

    // Aggressive: higher contributions (simulated via extra growth)
    var aggressiveExtra = 200 + contribAdjust;

    function findCrossover(projArray) {
      for (var i = 0; i < projArray.length; i++) {
        if (projArray[i].income >= projArray[i].expenses) return projArray[i].year;
      }
      return null;
    }

    // Simple re-projection for each scenario
    function reproject(yieldMult, expensesMult, extraContrib) {
      var results = [];
      var portfolio = baseProjections[0].portfolioValue;
      var yld = baseYield * yieldMult;
      var expenses = Math.round(baseExpenses * expensesMult);
      var growth = 0.06; // 6% price appreciation

      for (var y = 0; y <= 30; y++) {
        var income = Math.round(portfolio * yld);
        results.push({ year: y, income: income, expenses: expenses });
        portfolio = portfolio * (1 + growth) + (extraContrib * 12) + income;
      }
      return results;
    }

    var conserv = reproject(0.8, 1.15, 0);
    var base = reproject(1.0, 1.0, 0);
    var aggr = reproject(1.2, 1.0, aggressiveExtra);

    return [
      { name: 'Conservative', desc: 'Lower yield, 15% higher expenses', crossover: findCrossover(conserv), color: '#ef4444' },
      { name: 'Base Case', desc: 'Current assumptions', crossover: crossoverYear, color: 'var(--primary)' },
      { name: 'Aggressive', desc: '+$' + aggressiveExtra + '/mo contributions, higher yield', crossover: findCrossover(aggr), color: '#3CBFA3' },
    ];
  }, [baseProjections, crossoverYear, contribAdjust]);

  if (!baseProjections || baseProjections.length === 0) return null;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Sensitivity Analysis</div>
      <p style={{ margin: '0 0 12px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        How changing variables affects your FIRE timeline.
      </p>

      {/* Scenario cards */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {scenarios.map(function(s) {
          return (
            <div key={s.name} style={{
              flex: '1 1 150px', minWidth: 130,
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 12px',
              borderLeft: '3px solid ' + s.color,
            }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: s.color, marginBottom: 2 }}>{s.name}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginBottom: 6 }}>{s.desc}</div>
              <div style={{
                fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {s.crossover !== null ? s.crossover + ' yrs' : '30+ yrs'}
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>to FIRE</div>
            </div>
          );
        })}
      </div>

      {/* Contribution slider */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', marginBottom: 6 }}>
          Extra monthly contribution adjustment: <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>+${contribAdjust}</span>
        </div>
        <input
          type="range"
          min={0}
          max={2000}
          step={50}
          value={contribAdjust}
          onChange={function(e) { setContribAdjust(Number(e.target.value)); }}
          style={{
            width: '100%', cursor: 'pointer',
            accentColor: 'var(--primary)',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.58rem', color: 'var(--text-muted)' }}>
          <span>$0</span>
          <span>$2,000</span>
        </div>
      </div>
    </div>
  );
}
