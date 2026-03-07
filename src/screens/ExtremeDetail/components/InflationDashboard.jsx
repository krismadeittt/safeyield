import React, { useState } from 'react';
import useInflation from '../../../hooks/extreme/useInflation';
import InflationChart from '../charts/InflationChart';

export default function InflationDashboard({ holdings, liveData, summary, isMobile }) {
  var [viewMode, setViewMode] = useState('nominal'); // 'nominal' | 'real'

  // Calculate total annual income from summary or holdings
  var totalAnnualIncome = 0;
  if (summary && summary.totalAnnual != null) {
    totalAnnualIncome = summary.totalAnnual;
  } else if (holdings && liveData) {
    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = liveData[h.ticker] || {};
      var annualDiv = (live.annualDiv || h.div || 0) * (h.shares || 0);
      totalAnnualIncome += annualDiv;
    }
  }

  var { projections, currentRealIncome, avgInflation, loading } = useInflation(totalAnnualIncome, holdings, liveData);

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--text-dim)', textAlign: 'center' }}>Calculating inflation projections...</div>;
  }

  if (totalAnnualIncome <= 0) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '3rem', textAlign: 'center',
        color: 'var(--text-dim)', fontSize: '0.85rem',
      }}>
        Add holdings with dividends to see inflation-adjusted income analysis.
      </div>
    );
  }

  // Compute purchasing power loss over 10 years
  var lastProjection = projections.length > 0 ? projections[projections.length - 1] : null;
  var purchasingPowerLoss = 0;
  if (lastProjection && lastProjection.nominal > 0) {
    purchasingPowerLoss = ((lastProjection.nominal - lastProjection.real) / lastProjection.nominal) * 100;
  }

  // Per-holding dividend growth vs inflation
  var perHoldingGrowth = [];
  if (holdings && liveData) {
    for (var j = 0; j < holdings.length; j++) {
      var hh = holdings[j];
      var ll = liveData[hh.ticker] || {};
      var divGrowth = ll.divGrowth || ll.dividendGrowth || 0;
      var annDiv = (ll.annualDiv || hh.div || 0) * (hh.shares || 0);
      perHoldingGrowth.push({
        ticker: hh.ticker,
        divGrowth: divGrowth,
        annualIncome: annDiv,
        beatsInflation: divGrowth > avgInflation * 100,
      });
    }
    perHoldingGrowth.sort(function(a, b) { return b.annualIncome - a.annualIncome; });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Inflation Analysis</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Compare nominal vs real (inflation-adjusted) dividend income over 10 years.
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard
          label="Annual Income"
          value={'$' + Math.round(totalAnnualIncome).toLocaleString()}
        />
        <SummaryCard
          label="Real Income"
          value={'$' + Math.round(currentRealIncome).toLocaleString()}
          color="#3CBFA3"
        />
        <SummaryCard
          label="Purchasing Power Loss (10yr)"
          value={purchasingPowerLoss.toFixed(1) + '%'}
          color="var(--red)"
        />
        <SummaryCard
          label="Avg Inflation Rate"
          value={(avgInflation * 100).toFixed(2) + '%'}
        />
      </div>

      {/* Toggle */}
      <div style={{ display: 'flex', gap: 4 }}>
        {['nominal', 'real'].map(function(mode) {
          var active = viewMode === mode;
          return (
            <button key={mode} onClick={function() { setViewMode(mode); }} style={{
              background: active ? 'var(--accent-bg)' : 'var(--bg-pill)',
              border: '1px solid ' + (active ? 'var(--primary)' : 'var(--border)'),
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              padding: '5px 12px', cursor: 'pointer', fontSize: '0.72rem',
              borderRadius: 6, fontFamily: "'DM Sans', system-ui, sans-serif",
              fontWeight: active ? 600 : 400,
            }}>
              {mode === 'nominal' ? 'Nominal' : 'Real'}
            </button>
          );
        })}
      </div>

      {/* Chart */}
      {projections.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: isMobile ? '1rem' : '1.25rem',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
            {viewMode === 'nominal' ? 'Nominal vs Real Income Projection' : 'Real (Inflation-Adjusted) Income'}
          </div>
          <InflationChart projections={projections} isMobile={isMobile} viewMode={viewMode} />
        </div>
      )}

      {/* Per-holding growth vs inflation */}
      {perHoldingGrowth.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, overflowX: 'auto',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Dividend Growth vs Inflation
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 2 }}>
              Avg inflation: {(avgInflation * 100).toFixed(2)}% — holdings growing above this maintain purchasing power.
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {['Ticker', 'Annual Income', 'Div Growth', 'vs Inflation'].map(function(label) {
                  return (
                    <th key={label} style={{
                      textAlign: 'left', padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      color: 'var(--text-dim)', fontWeight: 500, fontSize: '0.7rem',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                      whiteSpace: 'nowrap',
                    }}>
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {perHoldingGrowth.map(function(ph) {
                var growthColor = ph.beatsInflation ? '#3CBFA3' : 'var(--red)';
                return (
                  <tr key={ph.ticker} style={{ borderBottom: '1px solid var(--border-row)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {ph.ticker}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }}>
                      ${ph.annualIncome.toFixed(2)}
                    </td>
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: growthColor }}>
                      {ph.divGrowth != null ? ph.divGrowth.toFixed(1) + '%' : '-'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 6px',
                        background: ph.beatsInflation ? 'rgba(60,191,163,0.1)' : 'rgba(239,68,68,0.1)',
                        color: growthColor,
                        border: '1px solid ' + (ph.beatsInflation ? 'rgba(60,191,163,0.3)' : 'rgba(239,68,68,0.3)'),
                        borderRadius: 4, fontSize: '0.6rem', fontWeight: 600,
                      }}>
                        {ph.beatsInflation ? 'Beats' : 'Below'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 16px', flex: '1 1 120px', minWidth: 100,
    }}>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </div>
  );
}
