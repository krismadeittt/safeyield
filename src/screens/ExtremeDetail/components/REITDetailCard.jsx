import React from 'react';

export default function REITDetailCard({ ticker, liveData, isMobile }) {
  var price = liveData.price || 0;
  var annualDiv = liveData.annualDiv || 0;
  var fundamentals = liveData.fundamentals || {};
  var highlights = fundamentals.Highlights || {};

  // Extract REIT-specific metrics
  var ffo = highlights.FFO || null;
  var affo = highlights.AFFO || null;
  var nav = highlights.BookValue || null; // Approximate NAV from book value
  var pffo = (ffo && price > 0) ? Math.round((price / ffo) * 100) / 100 : null;
  var divPerShare = annualDiv;
  var divPayout = (ffo && ffo > 0 && divPerShare > 0) ? Math.round((divPerShare / ffo) * 10000) / 100 : null;

  // Estimated distribution breakdown for REITs (common defaults)
  // Most REITs have ~60-80% ordinary, 5-15% capital gain, 10-25% ROC
  var estOrdinary = 70;
  var estCapGain = 10;
  var estROC = 20;

  return (
    <div style={{
      background: 'var(--bg-input)', border: '1px solid var(--border)',
      borderRadius: 0, padding: isMobile ? '12px' : '16px',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
        {ticker} — Detailed REIT Metrics
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <MetricBox label="FFO/Share" value={ffo ? '$' + ffo.toFixed(2) : 'N/A'} />
        <MetricBox label="AFFO/Share" value={affo ? '$' + affo.toFixed(2) : 'N/A'} />
        <MetricBox label="NAV (Book)" value={nav ? '$' + nav.toFixed(2) : 'N/A'} />
        <MetricBox label="P/FFO" value={pffo ? pffo.toFixed(1) + 'x' : 'N/A'} color={pffo && pffo < 15 ? '#3CBFA3' : pffo && pffo > 25 ? '#ef4444' : null} />
        <MetricBox label="Div/FFO Payout" value={divPayout ? divPayout + '%' : 'N/A'} color={divPayout && divPayout > 90 ? '#ef4444' : divPayout && divPayout < 75 ? '#3CBFA3' : null} />
      </div>

      {/* Distribution type breakdown estimate */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Est. Distribution Breakdown (Generic Industry Estimate)
        </div>
        <div style={{ display: 'flex', gap: 2, height: 16, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ flex: estOrdinary, background: 'var(--chart-proj)', borderRadius: '4px 0 0 4px' }} />
          <div style={{ flex: estCapGain, background: '#3CBFA3' }} />
          <div style={{ flex: estROC, background: '#eab308', borderRadius: '0 4px 4px 0' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: '0.58rem', color: 'var(--text-dim)' }}>
          <span><span style={{ color: 'var(--chart-proj)', fontWeight: 600 }}>{estOrdinary}%</span> Ordinary</span>
          <span><span style={{ color: '#3CBFA3', fontWeight: 600 }}>{estCapGain}%</span> Capital Gain</span>
          <span><span style={{ color: '#eab308', fontWeight: 600 }}>{estROC}%</span> Return of Capital</span>
        </div>
      </div>

      <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Distribution breakdown is estimated. Check your 1099-DIV for actual classification.
      </div>
    </div>
  );
}

function MetricBox({ label, value, color }) {
  return (
    <div style={{ flex: '1 1 80px', minWidth: 70 }}>
      <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
