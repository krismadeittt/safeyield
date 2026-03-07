import React, { useMemo } from 'react';
import { formatCurrency } from '../../../utils/format';

// Section 199A QBI (Qualified Business Income) deduction for REIT dividends
// REIT ordinary dividends qualify for a 20% deduction (simplified)
var QBI_DEDUCTION_RATE = 0.20;

// Income phase-out thresholds (2024 tax year)
var PHASE_OUT = {
  single: 182100,
  married_joint: 364200,
  married_separate: 182100,
  head_of_household: 182100,
};

export default function QBIEstimator({ holdings, liveData, taxProfile, isMobile }) {
  var filingStatus = (taxProfile && taxProfile.profile && taxProfile.profile.filing_status) || 'single';
  var totalIncome = (taxProfile && taxProfile.profile && taxProfile.profile.total_income) || 0;
  var ordinaryRate = (taxProfile && taxProfile.profile && taxProfile.profile.ordinary_rate) || 22;

  var calc = useMemo(function() {
    if (!holdings || !liveData) return null;

    var knownREITs = ['O', 'STAG', 'VICI', 'NNN', 'ADC', 'WPC', 'MAA', 'DLR', 'CCI', 'VNQ', 'SCHH', 'GLPI', 'AMT', 'PSA', 'SPG', 'PLD', 'WELL', 'EQR', 'AVB'];
    var totalREITOrdinaryDiv = 0;

    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = liveData[h.ticker] || {};
      var shares = h.shares || 0;
      var annualDiv = (live.annualDiv || h.div || 0) * shares;
      if (annualDiv <= 0) continue;

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

      // Estimate ordinary portion of REIT dividend (~70% is common)
      var ordinaryPortion = annualDiv * 0.70;
      totalREITOrdinaryDiv += ordinaryPortion;
    }

    var qbiDeduction = totalREITOrdinaryDiv * QBI_DEDUCTION_RATE;
    var taxSavings = qbiDeduction * (ordinaryRate / 100);

    // Check phase-out
    var threshold = PHASE_OUT[filingStatus] || PHASE_OUT.single;
    var isPhaseOut = totalIncome > threshold;

    return {
      totalREITOrdinaryDiv: Math.round(totalREITOrdinaryDiv * 100) / 100,
      qbiDeduction: Math.round(qbiDeduction * 100) / 100,
      taxSavings: Math.round(taxSavings * 100) / 100,
      isPhaseOut: isPhaseOut,
      threshold: threshold,
    };
  }, [holdings, liveData, filingStatus, totalIncome, ordinaryRate]);

  if (!calc) return null;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
        Section 199A — QBI Deduction Estimator
      </div>
      <p style={{ margin: '0 0 12px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        REIT ordinary dividends qualify for a 20% Qualified Business Income (QBI) deduction.
      </p>

      {/* Calculation display */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <CalcRow label="Total REIT Ordinary Dividends" value={formatCurrency(calc.totalREITOrdinaryDiv)} sublabel="~70% of REIT distributions" />
        <CalcRow label="QBI Deduction (20%)" value={formatCurrency(calc.qbiDeduction)} color="var(--primary)" />
        <CalcRow label="Estimated Tax Savings" value={formatCurrency(calc.taxSavings)} color="#3CBFA3" bold />
      </div>

      {/* Phase-out warning */}
      {calc.isPhaseOut && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12,
        }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#ef4444', marginBottom: 2 }}>Phase-Out Warning</div>
          <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            Your taxable income exceeds the {formatCurrency(calc.threshold)} threshold for{' '}
            {filingStatus.replace('_', ' ')} filers. The QBI deduction may be reduced or eliminated
            based on your specific income and the type of REIT income. Consult a tax professional.
          </p>
        </div>
      )}

      {!calc.isPhaseOut && totalIncome > 0 && (
        <div style={{
          background: 'rgba(60,191,163,0.08)', border: '1px solid rgba(60,191,163,0.3)',
          borderRadius: 8, padding: '8px 12px', marginBottom: 12,
        }}>
          <div style={{ fontSize: '0.65rem', color: '#3CBFA3', fontWeight: 600 }}>
            Below phase-out threshold ({formatCurrency(calc.threshold)}) — full QBI deduction available.
          </div>
        </div>
      )}

      {/* Info */}
      <div style={{
        background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '8px 12px',
      }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>How QBI Works for REITs</div>
        <ul style={{ margin: 0, paddingLeft: 16, fontSize: '0.62rem', color: 'var(--text-dim)', lineHeight: 1.6 }}>
          <li>REIT dividends (ordinary income portion) qualify as QBI under Section 199A</li>
          <li>The deduction is 20% of qualified REIT dividends</li>
          <li>This deduction reduces your taxable income, not your tax bill directly</li>
          <li>Phase-out begins at {formatCurrency(PHASE_OUT.single)} (single) / {formatCurrency(PHASE_OUT.married_joint)} (MFJ)</li>
        </ul>
      </div>

      {/* Disclaimer */}
      <div style={{
        marginTop: 8, background: 'rgba(234,179,8,0.08)',
        border: '1px solid rgba(234,179,8,0.3)',
        borderRadius: 8, padding: '8px 12px',
      }}>
        <p style={{ margin: 0, fontSize: '0.58rem', color: 'var(--text-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
          This is a simplified estimate. The actual QBI calculation involves additional factors including
          SSTB limitations, W-2 wage tests, and taxable income limitations. Consult a tax professional.
        </p>
      </div>
    </div>
  );
}

function CalcRow({ label, value, sublabel, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <div>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-primary)' }}>{label}</span>
        {sublabel && <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{sublabel}</div>}
      </div>
      <span style={{
        fontSize: bold ? '0.9rem' : '0.78rem',
        fontWeight: bold ? 700 : 500,
        color: color || 'var(--text-primary)',
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value}
      </span>
    </div>
  );
}
