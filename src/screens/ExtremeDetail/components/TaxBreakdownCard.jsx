import React from 'react';

export default function TaxBreakdownCard({ holding }) {
  if (!holding) return null;

  var gross = holding.grossAmount || 0;
  var tax = holding.taxAmount || 0;
  var net = holding.netAmount || 0;
  var rate = holding.effectiveRate || 0;
  var classification = holding.classification || 'qualified';

  var netPct = gross > 0 ? (net / gross) * 100 : 100;
  var taxPct = gross > 0 ? (tax / gross) * 100 : 0;

  var classColors = {
    qualified: { bg: 'rgba(60,191,163,0.1)', text: '#3CBFA3', border: 'rgba(60,191,163,0.3)' },
    ordinary: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    partial: { bg: 'rgba(234,179,8,0.1)', text: '#eab308', border: 'rgba(234,179,8,0.3)' },
    unqualified: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
    reit: { bg: 'rgba(234,179,8,0.1)', text: '#eab308', border: 'rgba(234,179,8,0.3)' },
  };
  var cc = classColors[classification] || classColors.qualified;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '1rem', minWidth: 180,
    }}>
      {/* Ticker + Classification */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
          {holding.ticker}
        </span>
        <span style={{
          display: 'inline-block', padding: '2px 6px',
          background: cc.bg, color: cc.text, border: '1px solid ' + cc.border,
          borderRadius: 4, fontSize: '0.6rem', fontWeight: 600, textTransform: 'capitalize',
        }}>
          {classification}
        </span>
      </div>

      {/* Horizontal bar */}
      <div style={{
        width: '100%', height: 8, borderRadius: 4,
        background: 'var(--bg-input)', overflow: 'hidden',
        display: 'flex', marginBottom: 8,
      }}>
        <div style={{ width: netPct + '%', height: '100%', background: 'var(--chart-hist)', borderRadius: '4px 0 0 4px' }} />
        <div style={{ width: taxPct + '%', height: '100%', background: 'var(--red)', opacity: 0.5 }} />
      </div>

      {/* Numbers */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
        <div>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Gross</div>
          <div style={{ color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            ${gross.toFixed(2)}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tax</div>
          <div style={{ color: 'var(--red)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            ${tax.toFixed(2)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Net</div>
          <div style={{ color: 'var(--chart-hist-bright)', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
            ${net.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Effective Rate */}
      <div style={{ textAlign: 'center', marginTop: 6, fontSize: '0.6rem', color: 'var(--text-muted)' }}>
        Effective Rate: {rate.toFixed(1)}%
      </div>
    </div>
  );
}
