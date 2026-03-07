import React from 'react';
import useAfterTax from '../../../hooks/extreme/useAfterTax';
import AfterTaxChart from '../charts/AfterTaxChart';

export default function AfterTaxIncome({ holdings, liveData, taxProfile, isMobile }) {
  var { result, loading } = useAfterTax(holdings, liveData, taxProfile);

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--text-dim)', textAlign: 'center' }}>Calculating after-tax income...</div>;
  }

  if (!result || !taxProfile) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '3rem', textAlign: 'center',
        color: 'var(--text-dim)', fontSize: '0.85rem',
      }}>
        Set up your tax profile first to see after-tax income analysis.
      </div>
    );
  }

  var effectiveRate = result.totalGross > 0
    ? Math.round((result.totalTax / result.totalGross) * 10000) / 100
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>After-Tax Income</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Gross income adjusted for federal, state, and local taxes.
        </p>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard label="Total Gross" value={'$' + result.totalGross.toFixed(2)} />
        <SummaryCard label="Total Tax" value={'$' + result.totalTax.toFixed(2)} color="var(--red)" />
        <SummaryCard label="Total Net" value={'$' + result.totalNet.toFixed(2)} color="#3CBFA3" />
        <SummaryCard label="Tax Drag" value={result.taxDragPct.toFixed(1) + '%'} color="var(--red)" />
        <SummaryCard label="Effective Rate" value={effectiveRate.toFixed(1) + '%'} />
      </div>

      {/* Chart */}
      {result.perHolding.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 16, padding: isMobile ? '1rem' : '1.25rem',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
            Gross vs Net by Holding
          </div>
          <AfterTaxChart perHolding={result.perHolding} isMobile={isMobile} />
        </div>
      )}

      {/* Per-Holding Table */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, overflowX: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              {['Ticker', 'Gross', 'Classification', 'Tax Rate', 'Tax', 'Net'].map(function(label) {
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
            {result.perHolding.map(function(h) {
              var classColor = h.classification === 'qualified' ? '#3CBFA3'
                : h.classification === 'partial' ? '#eab308'
                : '#ef4444';

              return (
                <tr key={h.ticker} style={{ borderBottom: '1px solid var(--border-row)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {h.ticker}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }}>
                    ${h.grossAmount.toFixed(2)}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 6px',
                      background: classColor + '1a', color: classColor,
                      border: '1px solid ' + classColor + '4d',
                      borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                      textTransform: 'capitalize',
                    }}>
                      {h.classification}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                    {h.effectiveRate.toFixed(1)}%
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--red)' }}>
                    ${h.taxAmount.toFixed(2)}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: '#3CBFA3', fontWeight: 600 }}>
                    ${h.netAmount.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
