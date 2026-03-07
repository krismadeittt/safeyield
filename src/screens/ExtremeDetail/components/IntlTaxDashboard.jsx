import React, { useMemo } from 'react';
import { WITHHOLDING_RATES, COUNTRY_NAMES, getWithholdingRate } from '../../../data/withholdingRates';
import { formatCurrency } from '../../../utils/format';

export default function IntlTaxDashboard({ holdings, liveData, isMobile }) {
  var analysis = useMemo(function() {
    if (!holdings || !liveData) return null;

    var byCountry = {};
    var totalForeignDiv = 0;
    var totalWithheld = 0;

    for (var i = 0; i < holdings.length; i++) {
      var h = holdings[i];
      var live = liveData[h.ticker] || {};
      var annualDiv = ((live.annualDiv || h.div || 0) * (h.shares || 0));
      if (annualDiv <= 0) continue;

      // Determine country from fundamentals
      var country = 'US';
      if (live.fundamentals) {
        var gen = live.fundamentals.General || {};
        country = gen.CountryISO || gen.Country || 'US';
        // Normalize country codes
        if (country === 'USA' || country === 'United States') country = 'US';
        if (country === 'United Kingdom' || country === 'GB') country = 'UK';
        if (country === 'Canada') country = 'CA';
        if (country === 'Germany') country = 'DE';
        if (country === 'France') country = 'FR';
        if (country === 'Japan') country = 'JP';
        if (country === 'Australia') country = 'AU';
        if (country === 'Switzerland') country = 'CH';
        if (country === 'Ireland') country = 'IE';
        if (country === 'Netherlands') country = 'NL';
      }

      var rate = getWithholdingRate(country);
      var withheld = annualDiv * (rate / 100);
      var net = annualDiv - withheld;

      if (!byCountry[country]) {
        byCountry[country] = {
          code: country,
          name: COUNTRY_NAMES[country] || country,
          holdings: [],
          grossDiv: 0,
          rate: rate,
          withheld: 0,
          net: 0,
        };
      }
      byCountry[country].holdings.push(h.ticker);
      byCountry[country].grossDiv += annualDiv;
      byCountry[country].withheld += withheld;
      byCountry[country].net += net;

      if (country !== 'US') {
        totalForeignDiv += annualDiv;
        totalWithheld += withheld;
      }
    }

    var countries = Object.values(byCountry).sort(function(a, b) { return b.grossDiv - a.grossDiv; });

    return {
      countries: countries,
      totalForeignDiv: totalForeignDiv,
      totalWithheld: totalWithheld,
      totalNetAfterWithholding: totalForeignDiv - totalWithheld,
      potentialFTC: totalWithheld, // Foreign Tax Credit = taxes actually paid to foreign governments
    };
  }, [holdings, liveData]);

  if (!analysis) {
    return (
      <div style={{ padding: '2rem', color: 'var(--text-dim)', textAlign: 'center', fontSize: '0.85rem' }}>
        No holdings data available.
      </div>
    );
  }

  function rateColor(rate) {
    if (rate === 0) return '#3CBFA3';
    if (rate <= 15) return '#eab308';
    return '#ef4444';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>International Tax</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Foreign withholding tax impact on your dividend income.
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <SummaryCard label="Total Foreign Dividends" value={formatCurrency(analysis.totalForeignDiv)} />
        <SummaryCard label="Total Withheld" value={formatCurrency(analysis.totalWithheld)} color="#ef4444" />
        <SummaryCard label="Net After Withholding" value={formatCurrency(analysis.totalNetAfterWithholding)} color="#3CBFA3" />
        <SummaryCard label="Potential FTC" value={formatCurrency(analysis.potentialFTC)} color="var(--primary)" />
      </div>

      {/* Country breakdown table */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, overflowX: 'auto',
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', padding: '12px 12px 0' }}>Country Breakdown</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              <th style={thStyle}>Country</th>
              <th style={thStyle}>Holdings</th>
              <th style={thStyle}>Gross Dividends</th>
              <th style={thStyle}>Rate</th>
              <th style={thStyle}>Amount Withheld</th>
              <th style={thStyle}>Net</th>
            </tr>
          </thead>
          <tbody>
            {analysis.countries.map(function(c) {
              return (
                <tr key={c.code} style={{ borderBottom: '1px solid var(--border-row)' }}>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.75rem' }}>{c.name}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{c.code}</div>
                  </td>
                  <td style={{ padding: '8px 12px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    {c.holdings.join(', ')}
                  </td>
                  <td style={monoCell}>{formatCurrency(c.grossDiv)}</td>
                  <td style={Object.assign({}, monoCell, { color: rateColor(c.rate), fontWeight: 600 })}>
                    {c.rate}%
                  </td>
                  <td style={Object.assign({}, monoCell, { color: c.withheld > 0 ? '#ef4444' : 'var(--text-primary)' })}>
                    {formatCurrency(c.withheld)}
                  </td>
                  <td style={monoCell}>{formatCurrency(c.net)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rate color legend */}
      <div style={{
        background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '8px 14px',
        display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>Rates:</span>
        <RateBadge rate="0%" color="#3CBFA3" label="Treaty exempt" />
        <RateBadge rate="10-15%" color="#eab308" label="Standard treaty" />
        <RateBadge rate="20%+" color="#ef4444" label="High / non-treaty" />
      </div>

      {/* Info note */}
      <div style={{
        background: 'var(--bg-input)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '10px 14px',
      }}>
        <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
          Withholding rates are based on US tax treaty rates. Actual rates may vary depending on account type
          (taxable vs. IRA), fund structure, and individual circumstances. Foreign taxes withheld may be
          recoverable as a Foreign Tax Credit (Form 1116) or itemized deduction.
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

function RateBadge({ rate, color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: '0.6rem', color: color, fontWeight: 600 }}>{rate}</span>
      <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}
