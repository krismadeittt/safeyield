import React, { useMemo, useState } from 'react';
import REITDetailCard from './REITDetailCard';
import { formatCurrency } from '../../../utils/format';

export default function REITDashboard({ holdings, liveData, isMobile }) {
  var [expandedTicker, setExpandedTicker] = useState(null);

  var reitData = useMemo(function() {
    if (!holdings || !liveData) return null;

    var reits = [];
    var totalREITValue = 0;
    var totalREITIncome = 0;
    var totalPortfolioValue = 0;

    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = liveData[h.ticker] || {};
      var price = live.price || h.price || 0;
      var shares = h.shares || 0;
      var value = shares * price;
      var annualDiv = (live.annualDiv || h.div || 0) * shares;
      var yld = live.divYield || h.yld || 0;

      totalPortfolioValue += value;

      // Detect REITs from fundamentals
      var isREIT = false;
      if (live.fundamentals) {
        var gen = live.fundamentals.General || {};
        var sector = gen.GicsSector || gen.Sector || '';
        var type = gen.Type || '';
        if (sector === 'Real Estate' || type === 'REIT' || type.indexOf('REIT') >= 0) {
          isREIT = true;
        }
      }

      // Also check common REIT tickers as fallback
      var knownREITs = ['O', 'STAG', 'VICI', 'NNN', 'ADC', 'WPC', 'MAA', 'DLR', 'CCI', 'VNQ', 'SCHH', 'GLPI', 'AMT', 'PSA', 'SPG', 'PLD', 'WELL', 'EQR', 'AVB'];
      if (!isREIT && knownREITs.indexOf(h.ticker) >= 0) {
        isREIT = true;
      }

      if (isREIT) {
        // Extract FFO if available
        var ffo = null;
        var pffo = null;
        if (live.fundamentals && live.fundamentals.Highlights) {
          ffo = live.fundamentals.Highlights.FFO || null;
        }
        if (ffo && price > 0) {
          pffo = Math.round((price / ffo) * 100) / 100;
        }

        reits.push({
          ticker: h.ticker,
          name: (live.fundamentals && live.fundamentals.General && live.fundamentals.General.Name) || h.ticker,
          shares: shares,
          price: price,
          value: value,
          yld: yld,
          annualDiv: annualDiv,
          ffo: ffo,
          pffo: pffo,
        });

        totalREITValue += value;
        totalREITIncome += annualDiv;
      }
    }

    var reitPct = totalPortfolioValue > 0 ? Math.round((totalREITValue / totalPortfolioValue) * 10000) / 100 : 0;
    var avgYield = totalREITValue > 0 ? Math.round((totalREITIncome / totalREITValue) * 10000) / 100 : 0;

    return {
      reits: reits,
      totalREITValue: totalREITValue,
      totalREITIncome: totalREITIncome,
      reitPct: reitPct,
      avgYield: avgYield,
    };
  }, [holdings, liveData]);

  if (!reitData) return null;

  if (reitData.reits.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>REIT Analysis</h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
            Real Estate Investment Trust tracking and analysis.
          </p>
        </div>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '3rem', textAlign: 'center',
          color: 'var(--text-dim)', fontSize: '0.85rem',
        }}>
          No REITs detected in your portfolio. Add real estate holdings like O, VNQ, STAG, or VICI to see REIT analysis.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>REIT Analysis</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Real Estate Investment Trust tracking and analysis.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard label="REIT Allocation" value={formatCurrency(reitData.totalREITValue)} />
        <SummaryCard label="REIT Income" value={formatCurrency(reitData.totalREITIncome)} color="#3CBFA3" />
        <SummaryCard label="% of Portfolio" value={reitData.reitPct + '%'} />
        <SummaryCard label="Avg REIT Yield" value={reitData.avgYield + '%'} color="var(--primary)" />
      </div>

      {/* REIT table */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, overflowX: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Ticker</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Shares</th>
              <th style={thStyle}>Price</th>
              <th style={thStyle}>Value</th>
              <th style={thStyle}>Yield</th>
              <th style={thStyle}>FFO/sh</th>
              <th style={thStyle}>P/FFO</th>
            </tr>
          </thead>
          <tbody>
            {reitData.reits.map(function(r) {
              var isExpanded = expandedTicker === r.ticker;
              return (
                <React.Fragment key={r.ticker}>
                  <tr
                    style={{ borderBottom: '1px solid var(--border-row)', cursor: 'pointer' }}
                    onClick={function() { setExpandedTicker(isExpanded ? null : r.ticker); }}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--primary)' }}>{r.ticker}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontSize: '0.72rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                    <td style={monoCell}>{r.shares.toFixed(2)}</td>
                    <td style={monoCell}>${r.price.toFixed(2)}</td>
                    <td style={monoCell}>{formatCurrency(r.value)}</td>
                    <td style={Object.assign({}, monoCell, { color: 'var(--green)' })}>{r.yld.toFixed(2)}%</td>
                    <td style={monoCell}>{r.ffo ? '$' + r.ffo.toFixed(2) : '--'}</td>
                    <td style={monoCell}>{r.pffo ? r.pffo.toFixed(1) + 'x' : '--'}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} style={{ padding: 0 }}>
                        <REITDetailCard
                          ticker={r.ticker}
                          shares={r.shares}
                          liveData={liveData[r.ticker] || {}}
                          isMobile={isMobile}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
