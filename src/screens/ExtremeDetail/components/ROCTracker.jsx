import React, { useMemo } from 'react';
import { formatCurrency } from '../../../utils/format';

var ROC_DEFAULT_PCT = 15; // Common default ROC estimate for REITs (%)

export default function ROCTracker({ holdings, liveData, isMobile }) {
  var reitData = useMemo(function() {
    if (!holdings || !liveData) return [];

    var knownREITs = ['O', 'STAG', 'VICI', 'NNN', 'ADC', 'WPC', 'MAA', 'DLR', 'CCI', 'VNQ', 'SCHH', 'GLPI', 'AMT', 'PSA', 'SPG', 'PLD', 'WELL', 'EQR', 'AVB'];
    var results = [];

    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = liveData[h.ticker] || {};
      var price = live.price || h.price || 0;
      var shares = h.shares || 0;
      if (shares <= 0) continue;

      // Detect REITs
      var isREIT = false;
      if (live.fundamentals) {
        var gen = live.fundamentals.General || {};
        var sector = gen.GicsSector || gen.Sector || '';
        var type = gen.Type || '';
        if (sector === 'Real Estate' || type === 'REIT' || type.indexOf('REIT') >= 0) {
          isREIT = true;
        }
      }
      if (!isREIT && knownREITs.indexOf(h.ticker) >= 0) {
        isREIT = true;
      }
      if (!isREIT) continue;

      var costBasisPerShare = h.cost_basis || h.costBasis || h.price || price;
      var originalCostBasis = shares * costBasisPerShare;
      var annualDiv = (live.annualDiv || h.div || 0) * shares;
      var estimatedROC = annualDiv * (ROC_DEFAULT_PCT / 100);
      var adjustedCostBasis = Math.max(0, originalCostBasis - estimatedROC);

      results.push({
        ticker: h.ticker,
        shares: shares,
        originalCostBasis: Math.round(originalCostBasis * 100) / 100,
        estimatedROC: Math.round(estimatedROC * 100) / 100,
        adjustedCostBasis: Math.round(adjustedCostBasis * 100) / 100,
        annualDiv: Math.round(annualDiv * 100) / 100,
        rocPct: ROC_DEFAULT_PCT,
      });
    }

    return results;
  }, [holdings, liveData]);

  if (reitData.length === 0) return null;

  var totalOriginal = 0;
  var totalROC = 0;
  var totalAdjusted = 0;
  for (var i = 0; i < reitData.length; i++) {
    totalOriginal += reitData[i].originalCostBasis;
    totalROC += reitData[i].estimatedROC;
    totalAdjusted += reitData[i].adjustedCostBasis;
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Return of Capital Tracker</div>
      <p style={{ margin: '0 0 12px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        REIT distributions often include Return of Capital (ROC), which reduces your cost basis and defers taxes.
      </p>

      {/* Explanation */}
      <div style={{
        background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px', marginBottom: 12,
      }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>What is ROC?</div>
        <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Return of Capital is a portion of a distribution that is not taxed as income. Instead, it reduces your
          cost basis in the investment. This defers taxes until you sell the holding, at which point the lower
          cost basis results in a larger capital gain. ROC is common in REIT distributions.
        </p>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Ticker</th>
              <th style={thStyle}>Original Cost Basis</th>
              <th style={thStyle}>Est. Annual ROC</th>
              <th style={thStyle}>Adjusted Cost Basis</th>
            </tr>
          </thead>
          <tbody>
            {reitData.map(function(r) {
              return (
                <tr key={r.ticker} style={{ borderBottom: '1px solid var(--border-row)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.ticker}</td>
                  <td style={monoCell}>{formatCurrency(r.originalCostBasis)}</td>
                  <td style={Object.assign({}, monoCell, { color: '#eab308' })}>{formatCurrency(r.estimatedROC)}</td>
                  <td style={Object.assign({}, monoCell, { color: 'var(--primary)' })}>{formatCurrency(r.adjustedCostBasis)}</td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.75rem' }}>Total</td>
              <td style={Object.assign({}, monoCell, { fontWeight: 700 })}>{formatCurrency(totalOriginal)}</td>
              <td style={Object.assign({}, monoCell, { fontWeight: 700, color: '#eab308' })}>{formatCurrency(totalROC)}</td>
              <td style={Object.assign({}, monoCell, { fontWeight: 700, color: 'var(--primary)' })}>{formatCurrency(totalAdjusted)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Note */}
      <div style={{
        marginTop: 12, background: 'rgba(234,179,8,0.08)',
        border: '1px solid rgba(234,179,8,0.3)',
        borderRadius: 8, padding: '8px 12px',
      }}>
        <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
          ROC estimate uses a {ROC_DEFAULT_PCT}% default assumption, which is common for REITs. Actual ROC varies by
          holding and year. Check your 1099-DIV (Box 3 — Nondividend Distributions) for the exact ROC amounts.
        </p>
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
