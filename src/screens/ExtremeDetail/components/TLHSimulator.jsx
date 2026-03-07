import React, { useState, useMemo } from 'react';
import { estimateTaxSavings, calcWashSaleDate } from '../../../utils/tlh';
import { formatCurrency } from '../../../utils/format';

export default function TLHSimulator({ candidates, taxProfile, isMobile }) {
  var [selected, setSelected] = useState({});

  var taxRate = 0;
  if (taxProfile && taxProfile.profile) {
    taxRate = (taxProfile.profile.ordinary_rate || 22) + (taxProfile.profile.state_rate || 0);
  } else {
    taxRate = 22;
  }

  function toggleCandidate(ticker) {
    setSelected(function(prev) {
      var next = Object.assign({}, prev);
      if (next[ticker]) {
        delete next[ticker];
      } else {
        next[ticker] = true;
      }
      return next;
    });
  }

  var summary = useMemo(function() {
    var totalLoss = 0;
    var totalSavings = 0;
    var count = 0;

    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (selected[c.ticker]) {
        totalLoss += c.unrealizedLoss;
        totalSavings += estimateTaxSavings(c.unrealizedLoss, taxRate);
        count++;
      }
    }

    return {
      selectedLoss: totalLoss,
      totalSavings: totalSavings,
      count: count,
      netBenefit: totalSavings, // Net benefit = tax savings (no transaction cost model)
    };
  }, [candidates, selected, taxRate]);

  // Wash sale timeline for selected
  var today = new Date();
  var washSaleEnd = calcWashSaleDate(today);
  var washSaleDateStr = washSaleEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Harvest Simulator</div>
      <p style={{ margin: '0 0 12px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        Select candidates to see total impact. Check boxes to "harvest" specific losses.
      </p>

      {/* Checkbox list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
        {candidates.map(function(c) {
          var isSelected = !!selected[c.ticker];
          return (
            <label key={c.ticker} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', cursor: 'pointer',
              background: isSelected ? 'rgba(60,191,163,0.06)' : 'transparent',
              borderRadius: 6, border: '1px solid ' + (isSelected ? 'rgba(60,191,163,0.3)' : 'var(--border)'),
            }}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={function() { toggleCandidate(c.ticker); }}
                style={{ accentColor: 'var(--primary)' }}
              />
              <span style={{ fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-primary)', minWidth: 50 }}>{c.ticker}</span>
              <span style={{ fontSize: '0.68rem', color: '#ef4444', fontFamily: "'JetBrains Mono', monospace" }}>
                {formatCurrency(c.unrealizedLoss)}
              </span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>({c.lossPct.toFixed(1)}%)</span>
              {c.substitute && (
                <span style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginLeft: 'auto' }}>
                  swap to {c.substitute}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {/* Running total */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <MiniStat label="Selected Losses" value={formatCurrency(Math.abs(summary.selectedLoss))} color="#ef4444" />
        <MiniStat label="Tax Savings" value={formatCurrency(summary.totalSavings)} color="#3CBFA3" />
        <MiniStat label="Net Benefit" value={formatCurrency(summary.netBenefit)} color="var(--primary)" />
      </div>

      {/* Wash sale timeline */}
      {summary.count > 0 && (
        <div style={{
          background: 'var(--bg-input)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12,
        }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Wash Sale Window</div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
            If you sell today, the wash sale restriction ends <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{washSaleDateStr}</span>.
          </div>
        </div>
      )}

      {/* What happens explanation */}
      <div style={{
        background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px',
      }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>How TLH Works</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.65rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          <li>Sell the holding at a loss to realize the tax deduction</li>
          <li>Immediately buy the substitute ETF to maintain market exposure</li>
          <li>Wait at least 31 days (wash sale window)</li>
          <li>Optionally switch back to the original holding after the window</li>
        </ol>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ flex: '1 1 100px', minWidth: 90 }}>
      <div style={{ fontSize: '0.55rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
