import React from 'react';
import ScenarioChart from '../charts/ScenarioChart';
import { formatCurrency } from '../../../utils/format';

export default function WhatIfResults({ currentSummary, scenarioResults, isMobile }) {
  if (!scenarioResults || scenarioResults.length === 0) return null;

  // Comparison metrics
  var metrics = [
    { key: 'totalIncome', label: 'Annual Income', format: formatCurrency },
    { key: 'yield', label: 'Yield %', format: function(v) { return v.toFixed(2) + '%'; } },
    { key: 'totalValue', label: 'Portfolio Value', format: formatCurrency },
    { key: 'monthlyIncome', label: 'Monthly Income', format: formatCurrency },
    { key: 'topHoldingPct', label: 'Top Holding %', format: function(v) { return v.toFixed(1) + '%'; } },
  ];

  function getDelta(current, scenario) {
    var diff = scenario - current;
    if (Math.abs(diff) < 0.01) return null;
    return diff;
  }

  // MATH AUDIT FIX: handle negative currency deltas (-$500 not $-500)
  function formatDelta(val, formatFn) {
    if (val === null) return '';
    var sign = val > 0 ? '+' : val < 0 ? '-' : '';
    return sign + formatFn(Math.abs(val));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Chart */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Annual Income Comparison</div>
        <ScenarioChart
          currentIncome={currentSummary.totalIncome}
          scenarioResults={scenarioResults}
          isMobile={isMobile}
        />
      </div>

      {/* Comparison Table */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, overflowX: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Metric</th>
              <th style={thStyle}>Current</th>
              {scenarioResults.map(function(s, idx) {
                return <th key={idx} style={thStyle}>{s.name}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {metrics.map(function(m) {
              var currentVal = currentSummary[m.key] || 0;
              return (
                <tr key={m.key} style={{ borderBottom: '1px solid var(--border-row)' }}>
                  <td style={tdLabelStyle}>{m.label}</td>
                  <td style={tdValueStyle}>{m.format(currentVal)}</td>
                  {scenarioResults.map(function(s, idx) {
                    var scenarioVal = s[m.key] || 0;
                    var delta = getDelta(currentVal, scenarioVal);
                    var deltaColor = delta !== null ? (delta > 0 ? '#3CBFA3' : '#ef4444') : 'var(--text-dim)';
                    // For topHoldingPct, lower is better (more diversified)
                    if (m.key === 'topHoldingPct' && delta !== null) {
                      deltaColor = delta < 0 ? '#3CBFA3' : '#ef4444';
                    }
                    return (
                      <td key={idx} style={tdValueStyle}>
                        <div>{m.format(scenarioVal)}</div>
                        {delta !== null && (
                          <div style={{ fontSize: '0.62rem', color: deltaColor, fontWeight: 600 }}>
                            {formatDelta(delta, m.format)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

var thStyle = {
  textAlign: 'left', padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-dim)', fontWeight: 500, fontSize: '0.7rem',
  textTransform: 'uppercase', letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
};

var tdLabelStyle = {
  padding: '8px 12px', fontWeight: 600,
  color: 'var(--text-primary)', fontSize: '0.75rem',
};

var tdValueStyle = {
  padding: '8px 12px',
  fontFamily: "'JetBrains Mono', monospace",
  color: 'var(--text-primary)', fontSize: '0.75rem',
};
