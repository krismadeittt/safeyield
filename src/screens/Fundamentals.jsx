import React from 'react';
import SingleSeriesBar from '../components/charts/SingleSeriesBar';
import { formatCurrency } from '../utils/format';

/**
 * Financial fundamentals panel — key-value stats with quarterly bar charts.
 */
export default function Fundamentals({ fd, loading }) {
  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "2rem", color: "#2a4a6a" }}>
        Loading fundamentals...
      </div>
    );
  }

  if (!fd) return null;

  const fmtB = v => {
    if (v == null) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return `$${Math.round(v)}`;
  };

  const fmtPct = v => v != null ? `${v.toFixed(1)}%` : '—';

  // Build quarterly chart points from history arrays
  const qPts = (arr) => {
    if (!arr?.length) return null;
    return arr.map(d => ({
      label: d.date ? d.date.slice(0, 7) : '',
      value: d.value,
    }));
  };

  const h = fd.history || {};

  const section = (title, items, chartData, chartFmt) => {
    const validItems = items.filter(([, val]) => val !== '—' && val != null);
    if (!validItems.length) return null;
    return (
      <div style={{
        background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem", marginBottom: "1rem",
      }}>
        <div style={{
          fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
          textTransform: "uppercase", marginBottom: "0.8rem",
        }}>
          {title}
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 8, marginBottom: chartData ? 12 : 0,
        }}>
          {items.map(([label, value]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.55rem", color: "#1a4060", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                {label}
              </div>
              <div style={{ fontSize: "1rem", color: "#c8dff0", fontWeight: 600 }}>
                {value ?? '—'}
              </div>
            </div>
          ))}
        </div>
        {chartData?.length > 0 && (
          <SingleSeriesBar
            pts={chartData}
            valKey="value"
            color="#005EB8"
            fmt={chartFmt || formatCurrency}
            H={120}
            PL={50}
            PB={24}
          />
        )}
      </div>
    );
  };

  return (
    <div>
      {section("Revenue & Growth", [
        ["Revenue (TTM)", fd.revenue != null ? fmtB(fd.revenue) : '—'],
        ["Sales Growth", fmtPct(fd.salesGrowth)],
        ["Shares Out", fd.sharesOut ? `${fd.sharesOut >= 1000 ? (fd.sharesOut / 1000).toFixed(2) + 'B' : fd.sharesOut.toFixed(0) + 'M'}` : '—'],
      ], qPts(h.revenue), fmtB)}

      {section("Earnings", [
        ["EPS (Diluted)", fd.eps != null ? `$${fd.eps.toFixed(2)}` : '—'],
        ["EPS Growth", fmtPct(fd.epsGrowth)],
        ["Payout Ratio", fmtPct(fd.payout)],
      ], qPts(h.netIncome), fmtB)}

      {section("Free Cash Flow", [
        ["FCF (TTM)", fd.fcfTTM != null ? fmtB(fd.fcfTTM) : '—'],
        ["FCF/Share", fd.fcfPerShare != null ? `$${fd.fcfPerShare.toFixed(2)}` : '—'],
        ["FCF Margin", fmtPct(fd.fcfMargin)],
        ["FCF Payout", fmtPct(fd.fcfPayout)],
      ], qPts(h.fcf), fmtB)}

      {section("Margins & Returns", [
        ["Operating Margin", fmtPct(fd.opMargin)],
        ["Net Margin", fmtPct(fd.profitMargin)],
        ["ROE", fmtPct(fd.roe)],
        ["ROA", fmtPct(fd.roa)],
      ], qPts(h.ebit), fmtB)}

      {section("Debt & Capital", [
        ["Net Debt/EBITDA", fd.netDebtToEbitda != null ? `${fd.netDebtToEbitda.toFixed(1)}x` : '—'],
        ["Interest Coverage", fd.interestCoverage != null ? `${fd.interestCoverage.toFixed(1)}x` : '—'],
        ["Net Debt", fd.netDebt != null ? fmtB(fd.netDebt) : '—'],
        ["EBITDA", fd.ebitda != null ? fmtB(fd.ebitda) : '—'],
      ], qPts(h.netDebt), fmtB)}

      {section("Shares Outstanding", [
        ["Current", fd.sharesOut ? `${fd.sharesOut >= 1000 ? (fd.sharesOut / 1000).toFixed(2) + 'B' : fd.sharesOut.toFixed(0) + 'M'}` : '—'],
      ], qPts(h.shares), v => {
        if (v >= 1000) return `${(v / 1000).toFixed(2)}B`;
        return `${v.toFixed(0)}M`;
      })}

      {section("Valuation", [
        ["Market Cap", fd.marketCap != null ? `$${fd.marketCap}B` : '—'],
        ["52W High", fd.week52High != null ? `$${fd.week52High.toFixed(2)}` : '—'],
        ["52W Low", fd.week52Low != null ? `$${fd.week52Low.toFixed(2)}` : '—'],
        ["Beta", fd.beta != null ? fd.beta.toFixed(2) : '—'],
      ])}
    </div>
  );
}
