import React, { useState } from 'react';

export default function SafetyAlertBanner({ alerts }) {
  var [dismissed, setDismissed] = useState(false);
  var [expanded, setExpanded] = useState(false);

  if (!alerts || alerts.length === 0 || dismissed) return null;

  var highSeverity = alerts.filter(function(a) { return a.severity === 'high'; }).length;
  var bannerBg = highSeverity > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(234,179,8,0.08)';
  var bannerBorder = highSeverity > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(234,179,8,0.3)';
  var bannerTextColor = highSeverity > 0 ? '#ef4444' : '#eab308';

  return (
    <div style={{
      background: bannerBg, border: '1px solid ' + bannerBorder,
      borderRadius: 10, padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          onClick={function() { setExpanded(function(v) { return !v; }); }}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}
        >
          <span style={{ fontSize: '1rem' }}>{highSeverity > 0 ? '\u26A0' : '\u26A0'}</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: bannerTextColor }}>
            {alerts.length} safety alert{alerts.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
            {expanded ? '\u25B2' : '\u25BC'}
          </span>
        </div>
        <button
          onClick={function() { setDismissed(true); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '0.85rem', padding: '2px 6px',
            lineHeight: 1,
          }}
        >
          {'\u2715'}
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {alerts.map(function(alert, idx) {
            var sevColor = alert.severity === 'high' ? '#ef4444' : alert.severity === 'medium' ? '#f97316' : '#eab308';
            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem' }}>
                <span style={{
                  fontWeight: 700, color: 'var(--text-primary)',
                  fontFamily: "'JetBrains Mono', monospace", minWidth: 50,
                }}>
                  {alert.ticker}
                </span>
                <span style={{
                  display: 'inline-block', padding: '1px 5px',
                  background: sevColor + '1a', color: sevColor,
                  border: '1px solid ' + sevColor + '4d',
                  borderRadius: 3, fontSize: '0.55rem', fontWeight: 600,
                  textTransform: 'uppercase',
                }}>
                  {alert.severity}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>{alert.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
