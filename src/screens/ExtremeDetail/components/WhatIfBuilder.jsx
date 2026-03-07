import React, { useState } from 'react';
import useWhatIf from '../../../hooks/extreme/useWhatIf';
import WhatIfResults from './WhatIfResults';

var CHANGE_TYPES = [
  { value: 'add_holding', label: 'Add Holding' },
  { value: 'remove_holding', label: 'Remove Holding' },
  { value: 'change_shares', label: 'Change Shares' },
  { value: 'div_cut', label: 'Dividend Cut (%)' },
  { value: 'div_raise', label: 'Dividend Raise (%)' },
  { value: 'contribution', label: 'Monthly Contribution ($)' },
];

export default function WhatIfBuilder({ holdings, liveData, summary, isMobile }) {
  var whatIf = useWhatIf();
  var [activeScenarioId, setActiveScenarioId] = useState(null);
  var [newName, setNewName] = useState('');
  var [changeType, setChangeType] = useState('add_holding');
  var [changeTicker, setChangeTicker] = useState('');
  var [changeValue, setChangeValue] = useState('');
  var [scenarioResults, setScenarioResults] = useState([]);
  var [simulated, setSimulated] = useState(false);

  var activeScenario = whatIf.scenarios.find(function(s) { return s.id === activeScenarioId; });

  function handleAddScenario() {
    var name = newName.trim() || ('Scenario ' + (whatIf.scenarios.length + 1));
    var id = whatIf.addScenario(name);
    setActiveScenarioId(id);
    setNewName('');
    setSimulated(false);
  }

  function handleRemoveScenario(id) {
    var remaining = whatIf.scenarios.filter(function(s) { return s.id !== id; });
    if (activeScenarioId === id) {
      setActiveScenarioId(remaining.length > 0 ? remaining[0].id : null);
    }
    whatIf.removeScenario(id);
    setSimulated(false);
  }

  function handleAddChange() {
    if (!activeScenarioId) return;
    var needsTicker = changeType !== 'contribution';
    if (needsTicker && !changeTicker.trim()) return;

    whatIf.addChange(activeScenarioId, {
      type: changeType,
      ticker: changeTicker.trim().toUpperCase(),
      value: Number(changeValue) || 0,
    });
    setChangeTicker('');
    setChangeValue('');
    setSimulated(false);
  }

  function handleSimulate() {
    var results = [];
    for (var i = 0; i < whatIf.scenarios.length; i++) {
      var result = whatIf.simulateScenario(whatIf.scenarios[i], holdings, liveData);
      results.push(result);
    }
    setScenarioResults(results);
    setSimulated(true);
  }

  // Calculate current summary values
  var currentTotalIncome = (summary && summary.totalAnnualIncome) || 0;
  var currentTotalValue = 0;
  if (holdings) {
    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = (liveData && liveData[h.ticker]) || {};
      currentTotalValue += (h.shares || 0) * (live.price || h.price || 0);
    }
  }

  var currentSummary = {
    totalIncome: currentTotalIncome,
    totalValue: currentTotalValue,
    yield: currentTotalValue > 0 ? Math.round((currentTotalIncome / currentTotalValue) * 10000) / 100 : 0,
    monthlyIncome: Math.round((currentTotalIncome / 12) * 100) / 100,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>What-If Scenario Builder</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Compare hypothetical portfolio changes against your current position.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {/* Scenario list */}
        <div style={{
          flex: '1 1 200px', minWidth: 180,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Scenarios</div>

          {/* Existing scenarios */}
          {whatIf.scenarios.map(function(s) {
            var isActive = s.id === activeScenarioId;
            return (
              <div key={s.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 10px', marginBottom: 4,
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                border: '1px solid ' + (isActive ? 'var(--primary)' : 'var(--border)'),
                borderRadius: 6, cursor: 'pointer',
              }}
                onClick={function() { setActiveScenarioId(s.id); }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--primary)' : 'var(--text-primary)' }}>
                  {s.name}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{s.changes.length} changes</span>
                  <button onClick={function(e) { e.stopPropagation(); handleRemoveScenario(s.id); }} style={{
                    background: 'none', border: 'none', color: 'var(--red)',
                    cursor: 'pointer', fontSize: '0.7rem', padding: '0 2px',
                  }}>x</button>
                </span>
              </div>
            );
          })}

          {/* Add scenario */}
          {whatIf.scenarios.length < 3 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input
                type="text"
                placeholder="Scenario name..."
                value={newName}
                onChange={function(e) { setNewName(e.target.value); }}
                onKeyDown={function(e) { if (e.key === 'Enter') handleAddScenario(); }}
                style={{
                  flex: 1, padding: '5px 8px',
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem',
                  fontFamily: "'DM Sans', system-ui, sans-serif", outline: 'none',
                }}
              />
              <button onClick={handleAddScenario} style={{
                padding: '5px 10px', background: 'var(--primary)',
                color: 'white', border: 'none', borderRadius: 6,
                fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600,
              }}>
                + Add
              </button>
            </div>
          )}
        </div>

        {/* Active scenario editor */}
        <div style={{
          flex: '2 1 300px', minWidth: 240,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
        }}>
          {activeScenario ? (
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                Editing: {activeScenario.name}
              </div>

              {/* Change input row */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                <select
                  value={changeType}
                  onChange={function(e) { setChangeType(e.target.value); }}
                  style={{
                    padding: '5px 8px', background: 'var(--bg-input)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    color: 'var(--text-primary)', fontSize: '0.72rem', outline: 'none',
                  }}
                >
                  {CHANGE_TYPES.map(function(ct) {
                    return <option key={ct.value} value={ct.value}>{ct.label}</option>;
                  })}
                </select>

                {changeType !== 'contribution' && (
                  <input
                    type="text"
                    placeholder="Ticker"
                    value={changeTicker}
                    onChange={function(e) { setChangeTicker(e.target.value); }}
                    style={{
                      width: 70, padding: '5px 8px',
                      background: 'var(--bg-input)', border: '1px solid var(--border)',
                      borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem',
                      fontFamily: "'JetBrains Mono', monospace", outline: 'none',
                      textTransform: 'uppercase',
                    }}
                  />
                )}

                {changeType !== 'remove_holding' && (
                  <input
                    type="number"
                    placeholder="Value"
                    value={changeValue}
                    onChange={function(e) { setChangeValue(e.target.value); }}
                    style={{
                      width: 80, padding: '5px 8px',
                      background: 'var(--bg-input)', border: '1px solid var(--border)',
                      borderRadius: 6, color: 'var(--text-primary)', fontSize: '0.72rem',
                      fontFamily: "'JetBrains Mono', monospace", outline: 'none',
                    }}
                  />
                )}

                <button onClick={handleAddChange} style={{
                  padding: '5px 10px', background: 'var(--bg-pill)',
                  border: '1px solid var(--border)', color: 'var(--primary)',
                  borderRadius: 6, fontSize: '0.72rem', cursor: 'pointer',
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}>
                  + Add
                </button>
              </div>

              {/* Changes list as pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {activeScenario.changes.map(function(c, idx) {
                  var label = c.type.replace('_', ' ');
                  if (c.ticker) label += ': ' + c.ticker;
                  if (c.value !== undefined && c.type !== 'remove_holding') label += ' (' + c.value + ')';
                  return (
                    <span key={idx} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '3px 8px', background: 'var(--bg-pill)',
                      border: '1px solid var(--border)', borderRadius: 12,
                      fontSize: '0.65rem', color: 'var(--text-primary)',
                    }}>
                      {label}
                      <button
                        onClick={function() { whatIf.removeChange(activeScenarioId, idx); setSimulated(false); }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--red)',
                          cursor: 'pointer', fontSize: '0.7rem', padding: 0,
                          lineHeight: 1,
                        }}
                      >
                        x
                      </button>
                    </span>
                  );
                })}
                {activeScenario.changes.length === 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No changes yet. Add some above.</span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
              Create or select a scenario to start building.
            </div>
          )}
        </div>
      </div>

      {/* Simulate button */}
      {whatIf.scenarios.length > 0 && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={handleSimulate} style={{
            padding: '10px 24px', background: 'var(--primary)',
            color: 'white', border: 'none', borderRadius: 8,
            fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            Simulate All Scenarios
          </button>
        </div>
      )}

      {/* Results */}
      {simulated && scenarioResults.length > 0 && (
        <WhatIfResults
          currentSummary={currentSummary}
          scenarioResults={scenarioResults}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
