import React, { useState, useMemo } from 'react';
import { findTLHCandidates, estimateTaxSavings } from '../../../utils/tlh';
import { formatCurrency } from '../../../utils/format';
import TLHSimulator from './TLHSimulator';

export default function TLHDashboard({ holdings, liveData, taxProfile, isMobile }) {
  var [sortKey, setSortKey] = useState('unrealizedLoss');
  var [sortDir, setSortDir] = useState(1); // 1=asc (most negative first)

  var candidates = useMemo(function() {
    if (!holdings || !liveData) return [];
    return findTLHCandidates(holdings, liveData);
  }, [holdings, liveData]);

  // Effective tax rate for savings estimate
  var taxRate = 0;
  if (taxProfile && taxProfile.profile) {
    taxRate = (taxProfile.profile.ordinary_rate || 22) + (taxProfile.profile.state_rate || 0);
  } else {
    taxRate = 22; // Default federal rate
  }

  // Summary values
  var totalLoss = 0;
  var totalSavings = 0;
  for (var i = 0; i < candidates.length; i++) {
    totalLoss += candidates[i].unrealizedLoss;
    totalSavings += estimateTaxSavings(candidates[i].unrealizedLoss, taxRate);
  }

  // Sort candidates — add savings property for sortability
  var sorted = candidates.map(function(c) {
    return Object.assign({}, c, { savings: estimateTaxSavings(c.unrealizedLoss, taxRate) });
  });
  sorted.sort(function(a, b) {
    var va = a[sortKey] || 0;
    var vb = b[sortKey] || 0;
    return (va - vb) * sortDir;
  });

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(function(d) { return d * -1; });
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Tax-Loss Harvesting</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Identify holdings with unrealized losses to offset capital gains.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard label="Total Unrealized Losses" value={formatCurrency(Math.abs(totalLoss))} color="#ef4444" />
        <SummaryCard label="Est. Tax Savings" value={formatCurrency(totalSavings)} color="#3CBFA3" />
        <SummaryCard label="# Candidates" value={candidates.length} />
        <SummaryCard label="Annual Harvest Limit" value="$3,000" color="var(--text-dim)" />
      </div>

      {/* Candidate table */}
      {candidates.length > 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {[
                  { key: 'ticker', label: 'Ticker' },
                  { key: 'shares', label: 'Shares' },
                  { key: 'costBasis', label: 'Cost Basis' },
                  { key: 'currentValue', label: 'Current Value' },
                  { key: 'unrealizedLoss', label: 'Loss' },
                  { key: 'lossPct', label: 'Loss %' },
                  { key: 'substitute', label: 'Substitute' },
                  { key: 'savings', label: 'Est. Savings' },
                ].map(function(col) {
                  return (
                    <th key={col.key} onClick={function() { handleSort(col.key); }} style={{
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
              </tr>
            </thead>
            <tbody>
              {sorted.map(function(c) {
                // Color intensity based on loss severity
                var lossIntensity = Math.min(Math.abs(c.lossPct) / 30, 1);
                var lossColor = 'rgba(239,68,68,' + (0.3 + lossIntensity * 0.7).toFixed(2) + ')';
                var savings = estimateTaxSavings(c.unrealizedLoss, taxRate);

                return (
                  <tr key={c.ticker} style={{ borderBottom: '1px solid var(--border-row)' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.ticker}</td>
                    <td style={monoCell}>{c.shares.toFixed(2)}</td>
                    <td style={monoCell}>{formatCurrency(c.costBasis)}</td>
                    <td style={monoCell}>{formatCurrency(c.currentValue)}</td>
                    <td style={Object.assign({}, monoCell, { color: lossColor, fontWeight: 600 })}>{formatCurrency(c.unrealizedLoss)}</td>
                    <td style={Object.assign({}, monoCell, { color: lossColor })}>{c.lossPct.toFixed(2)}%</td>
                    <td style={{ padding: '8px 12px' }}>
                      {c.substitute ? (
                        <span style={{
                          padding: '2px 6px', background: 'rgba(60,191,163,0.1)',
                          border: '1px solid rgba(60,191,163,0.3)', borderRadius: 4,
                          fontSize: '0.68rem', fontWeight: 600, color: '#3CBFA3',
                        }}>
                          {c.substitute}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>--</span>
                      )}
                    </td>
                    <td style={Object.assign({}, monoCell, { color: '#3CBFA3' })}>{formatCurrency(savings)}</td>
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
          No tax-loss harvesting candidates found. All holdings have unrealized gains.
        </div>
      )}

      {/* Wash sale note */}
      <div style={{
        background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '10px 14px',
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Wash Sale Rule</div>
        <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
          You cannot buy a "substantially identical" security within 31 days before or after selling at a loss.
          The substitute tickers shown are from different fund families to help avoid wash sale violations.
          Consult a tax professional for your specific situation.
        </p>
      </div>

      {/* TLH Simulator */}
      {candidates.length > 0 && (
        <TLHSimulator
          candidates={candidates}
          taxProfile={taxProfile}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}

var monoCell = {
  padding: '8px 12px',
  fontFamily: "'JetBrains Mono', monospace",
  color: 'var(--text-primary)', fontSize: '0.72rem',
};

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
