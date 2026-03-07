import React, { useState, useMemo } from 'react';
import { getWithholdingRate } from '../../../data/withholdingRates';
import { formatCurrency } from '../../../utils/format';

export default function Form1116Helper({ holdings, liveData, taxProfile, isMobile }) {
  // Default worldwide income from tax profile or fallback
  var defaultIncome = 0;
  if (taxProfile && taxProfile.profile && taxProfile.profile.total_income) {
    defaultIncome = taxProfile.profile.total_income;
  }
  var [worldwideIncome, setWorldwideIncome] = useState(defaultIncome || 75000);

  var calc = useMemo(function() {
    if (!holdings || !liveData) return null;

    var totalForeignTaxPaid = 0;
    var totalForeignIncome = 0;
    var totalDomesticIncome = 0;

    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = liveData[h.ticker] || {};
      var annualDiv = (live.annualDiv || h.div || 0) * (h.shares || 0);
      if (annualDiv <= 0) continue;

      var country = 'US';
      if (live.fundamentals) {
        var gen = live.fundamentals.General || {};
        country = gen.CountryISO || gen.Country || 'US';
        if (country === 'USA' || country === 'United States') country = 'US';
        if (country === 'GB' || country === 'United Kingdom') country = 'UK';
      }

      var rate = getWithholdingRate(country);
      var withheld = annualDiv * (rate / 100);

      if (country !== 'US') {
        totalForeignTaxPaid += withheld;
        totalForeignIncome += annualDiv;
      } else {
        totalDomesticIncome += annualDiv;
      }
    }

    // FTC Limitation: (Foreign source income / Worldwide income) * US tax liability
    // Simplified: use effective rate on worldwide income
    var effectiveRate = 0;
    if (taxProfile && taxProfile.profile) {
      effectiveRate = (taxProfile.profile.ordinary_rate || 22) / 100;
    } else {
      effectiveRate = 0.22; // Default 22%
    }
    var usTaxLiability = worldwideIncome * effectiveRate;
    var ftcLimitation = worldwideIncome > 0
      ? (totalForeignIncome / worldwideIncome) * usTaxLiability
      : 0;

    // Creditable amount = lesser of tax paid vs limitation
    var creditableAmount = Math.min(totalForeignTaxPaid, ftcLimitation);

    // Credit vs deduction comparison
    var creditBenefit = creditableAmount; // Dollar-for-dollar offset
    var deductionBenefit = totalForeignTaxPaid * effectiveRate; // Only reduces taxable income

    return {
      totalForeignTaxPaid: Math.round(totalForeignTaxPaid * 100) / 100,
      totalForeignIncome: Math.round(totalForeignIncome * 100) / 100,
      ftcLimitation: Math.round(ftcLimitation * 100) / 100,
      creditableAmount: Math.round(creditableAmount * 100) / 100,
      creditBenefit: Math.round(creditBenefit * 100) / 100,
      deductionBenefit: Math.round(deductionBenefit * 100) / 100,
      preferCredit: creditBenefit >= deductionBenefit,
    };
  }, [holdings, liveData, taxProfile, worldwideIncome]);

  if (!calc) {
    return (
      <div style={{ padding: '2rem', color: 'var(--text-dim)', textAlign: 'center', fontSize: '0.85rem' }}>
        No data available for Form 1116 estimation.
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Form 1116 — Foreign Tax Credit Estimator</div>
      <p style={{ margin: '0 0 12px', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
        Simplified estimate of your Foreign Tax Credit eligibility.
      </p>

      {/* Worldwide income input */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
          Total Worldwide Income
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>$</span>
          <input
            type="number"
            value={worldwideIncome}
            onChange={function(e) { setWorldwideIncome(Number(e.target.value) || 0); }}
            style={{
              width: 150, padding: '6px 8px',
              background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-primary)',
              fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace",
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Calculation breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <CalcRow label="Total Foreign Taxes Paid" value={formatCurrency(calc.totalForeignTaxPaid)} />
        <CalcRow label="FTC Limitation" value={formatCurrency(calc.ftcLimitation)} sublabel="(foreign income / worldwide income) x US tax" />
        <CalcRow label="Creditable Amount" value={formatCurrency(calc.creditableAmount)} color="var(--primary)" bold />
      </div>

      {/* Credit vs Deduction comparison */}
      <div style={{
        background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 12px', marginBottom: 12,
      }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Credit vs. Deduction</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{
            flex: '1 1 120px', padding: '8px 10px',
            border: '1px solid ' + (calc.preferCredit ? 'rgba(60,191,163,0.4)' : 'var(--border)'),
            borderRadius: 6,
            background: calc.preferCredit ? 'rgba(60,191,163,0.06)' : 'transparent',
          }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: 2 }}>CREDIT (Form 1116)</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: calc.preferCredit ? '#3CBFA3' : 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(calc.creditBenefit)}
            </div>
            {calc.preferCredit && <div style={{ fontSize: '0.55rem', color: '#3CBFA3', fontWeight: 600 }}>RECOMMENDED</div>}
          </div>
          <div style={{
            flex: '1 1 120px', padding: '8px 10px',
            border: '1px solid ' + (!calc.preferCredit ? 'rgba(60,191,163,0.4)' : 'var(--border)'),
            borderRadius: 6,
            background: !calc.preferCredit ? 'rgba(60,191,163,0.06)' : 'transparent',
          }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: 2 }}>DEDUCTION (Schedule A)</div>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: !calc.preferCredit ? '#3CBFA3' : 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(calc.deductionBenefit)}
            </div>
            {!calc.preferCredit && <div style={{ fontSize: '0.55rem', color: '#3CBFA3', fontWeight: 600 }}>RECOMMENDED</div>}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={{
        background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)',
        borderRadius: 8, padding: '8px 12px',
      }}>
        <p style={{ margin: 0, fontSize: '0.62rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
          This is an estimate only — consult a tax professional. The actual Form 1116 calculation
          is more complex, involving category-by-category analysis, carryover/carryback provisions,
          and alternative minimum tax adjustments.
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
