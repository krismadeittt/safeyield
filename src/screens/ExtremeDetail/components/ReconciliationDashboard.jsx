import React, { useState } from 'react';
import { formatCurrency } from '../../../utils/format';
import ConfirmDividendModal from './ConfirmDividendModal';
import ReconciliationChart from '../charts/ReconciliationChart';

var STATUS_COLORS = {
  pending: { bg: 'rgba(234,179,8,0.1)', text: '#eab308', border: 'rgba(234,179,8,0.3)' },
  confirmed: { bg: 'rgba(60,191,163,0.1)', text: '#3CBFA3', border: 'rgba(60,191,163,0.3)' },
  variance: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  missed: { bg: 'rgba(156,163,175,0.1)', text: '#9ca3af', border: 'rgba(156,163,175,0.3)' },
};

export default function ReconciliationDashboard({ reconciliation, holdings, liveData, divScheduleMap, isMobile }) {
  var { records, loading, generating, summary, filters, updateFilters, generate, confirm, reload } = reconciliation;
  var [confirmModal, setConfirmModal] = useState(null);
  var [sortKey, setSortKey] = useState('ex_date');
  var [sortDir, setSortDir] = useState(-1); // -1 = desc

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(function(d) { return d * -1; });
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  }

  var sorted = [...records].sort(function(a, b) {
    var va = a[sortKey] || '';
    var vb = b[sortKey] || '';
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb)) * sortDir;
  });

  async function handleGenerate() {
    // Build dividend data from divScheduleMap
    var dividendData = [];
    var now = new Date();
    var threeMonthsAgoDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    var threeMonthsAgo = threeMonthsAgoDate.toISOString().slice(0, 10);

    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = liveData[h.ticker] || {};
      var annualDiv = live.annualDiv || h.div || 0;
      var schedule = divScheduleMap[h.ticker];
      if (!schedule || !annualDiv) continue;

      var freq = schedule.freq || 4;
      var perPayment = annualDiv / freq;

      // Generate expected dividends for recent months
      var months = schedule.months || [];
      for (var m = 0; m < months.length; m++) {
        var month = months[m];
        var year = now.getFullYear();
        var candidate = new Date(year, month - 1, 15);
        if (candidate < threeMonthsAgoDate) {
          candidate = new Date(year + 1, month - 1, 15);
        }
        var exDate = candidate.getFullYear() + '-' + String(candidate.getMonth() + 1).padStart(2, '0') + '-15';
        dividendData.push({
          ticker: h.ticker,
          ex_date: exDate,
          amount: Math.round(perPayment * 100) / 100,
        });
      }
    }

    await generate(dividendData);
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--text-dim)', textAlign: 'center' }}>Loading reconciliation data...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Dividend Reconciliation</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            Track expected vs. actual dividends received.
          </p>
        </div>
        <button onClick={handleGenerate} disabled={generating} style={{
          padding: '8px 16px', cursor: generating ? 'default' : 'pointer',
          background: generating ? 'var(--border-accent)' : 'var(--primary)',
          color: 'white', border: 'none', fontSize: '0.8rem',
          fontWeight: 600, borderRadius: 8,
        }}>
          {generating ? 'Generating...' : 'Generate Expected'}
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard label="Total Records" value={summary.total} />
        <SummaryCard label="Pending" value={summary.pending} color="#eab308" />
        <SummaryCard label="Confirmed" value={summary.confirmed} color="#3CBFA3" />
        <SummaryCard label="Variances" value={summary.variance} color="#ef4444" />
        <SummaryCard label="Expected Total" value={formatCurrency(summary.expectedTotal)} />
        <SummaryCard label="Actual Total" value={formatCurrency(summary.actualTotal)} />
      </div>

      {/* Chart */}
      {records.length > 0 && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Expected vs Actual</div>
          <ReconciliationChart records={records} isMobile={isMobile} />
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['all', 'pending', 'confirmed', 'variance', 'missed'].map(function(s) {
          var active = (s === 'all' && !filters.status) || filters.status === s;
          return (
            <button key={s} onClick={() => updateFilters({ status: s === 'all' ? null : s })} style={{
              background: active ? 'var(--accent-bg)' : 'var(--bg-pill)',
              border: '1px solid ' + (active ? 'var(--primary)' : 'var(--border)'),
              color: active ? 'var(--primary)' : 'var(--text-muted)',
              padding: '4px 10px', cursor: 'pointer', fontSize: '0.7rem',
              borderRadius: 6, fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {records.length > 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {[
                  { key: 'ticker', label: 'Ticker' },
                  { key: 'ex_date', label: 'Ex-Date' },
                  { key: 'expected_amount', label: 'Expected/sh' },
                  { key: 'expected_total', label: 'Expected Total' },
                  { key: 'actual_total', label: 'Actual Total' },
                  { key: 'variance_pct', label: 'Variance' },
                  { key: 'status', label: 'Status' },
                ].map(function(col) {
                  return (
                    <th key={col.key} onClick={() => handleSort(col.key)} style={{
                      textAlign: 'left', padding: '10px 12px',
                      borderBottom: '1px solid var(--border)',
                      color: sortKey === col.key ? 'var(--primary)' : 'var(--text-dim)',
                      fontWeight: 500, fontSize: '0.7rem', cursor: 'pointer',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                      whiteSpace: 'nowrap',
                    }}>
                      {col.label} {sortKey === col.key ? (sortDir > 0 ? '\u25B2' : '\u25BC') : ''}
                    </th>
                  );
                })}
                <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-dim)', fontWeight: 500, fontSize: '0.7rem' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(function(r) {
                var sc = STATUS_COLORS[r.status] || STATUS_COLORS.pending;
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-row)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.ticker}</td>
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', fontSize: '0.72rem' }}>{r.ex_date}</td>
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }}>{r.expected_amount != null ? '$' + r.expected_amount.toFixed(4) : '-'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }}>{r.expected_total != null ? formatCurrency(r.expected_total) : '-'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-primary)' }}>{r.actual_total != null ? formatCurrency(r.actual_total) : '-'}</td>
                    <td style={{ padding: '8px 12px', fontFamily: "'JetBrains Mono', monospace", color: r.variance_pct != null ? (Math.abs(r.variance_pct) > 2 ? '#ef4444' : '#3CBFA3') : 'var(--text-dim)' }}>
                      {r.variance_pct != null ? (r.variance_pct > 0 ? '+' : '') + r.variance_pct.toFixed(2) + '%' : '-'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px',
                        background: sc.bg, color: sc.text, border: '1px solid ' + sc.border,
                        borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                      }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {r.status === 'pending' && (
                        <button onClick={() => setConfirmModal(r)} style={{
                          background: 'var(--bg-pill)', border: '1px solid var(--border)',
                          color: 'var(--primary)', padding: '3px 8px',
                          cursor: 'pointer', fontSize: '0.65rem', borderRadius: 4,
                          fontFamily: "'DM Sans', system-ui, sans-serif",
                        }}>
                          Confirm
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '3rem', textAlign: 'center',
          color: 'var(--text-dim)', fontSize: '0.85rem',
        }}>
          No reconciliation records yet. Click "Generate Expected" to create records based on your portfolio.
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <ConfirmDividendModal
          record={confirmModal}
          onConfirm={async (actualAmount, actualTotal, notes) => {
            await confirm(confirmModal.id, actualAmount, actualTotal, notes);
            setConfirmModal(null);
          }}
          onClose={() => setConfirmModal(null)}
        />
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
      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
