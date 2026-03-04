import React from 'react';
import SingleSeriesBar from '../components/charts/SingleSeriesBar';
import { formatCurrency } from '../utils/format';
import useIsMobile from '../hooks/useIsMobile';

/**
 * Financial fundamentals panel — key-value stats with quarterly bar charts.
 */
export default function Fundamentals({ fd, loading }) {
  const isMobile = useIsMobile();

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-dim)" }}>
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
        background: "var(--bg-card)", border: "1px solid var(--border-accent)", padding: "1rem",
        overflow: "hidden", minWidth: 0,
      }}>
        <div style={{
          fontSize: "0.55rem", color: "var(--text-label)", letterSpacing: "0.2em",
          textTransform: "uppercase", marginBottom: "0.6rem",
        }}>
          {title}
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
          gap: 6, marginBottom: chartData ? 10 : 0,
        }}>
          {items.map(([label, value]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "0.45rem", color: "var(--text-label)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
                {label}
              </div>
              <div style={{ fontSize: "0.9rem", color: "var(--text-primary)", fontWeight: 600 }}>
                {value ?? '—'}
              </div>
            </div>
          ))}
        </div>
        {chartData?.length > 0 && (
          <div style={{ overflow: "hidden", minWidth: 0 }}>
            <SingleSeriesBar
              pts={chartData}
              valKey="value"
              color="var(--primary)"
              fmt={chartFmt || formatCurrency}
              H={100}
              PL={isMobile ? 30 : 35}
              PB={22}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {/* Revenue & Growth + Earnings — side by side */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: "1rem",
        marginBottom: "1rem",
        alignItems: "stretch",
      }}>
        {section("Revenue & Growth", [
          ["Revenue (TTM)", fd.revenue != null ? fmtB(fd.revenue) : '—'],
          ["Sales Growth", fmtPct(fd.salesGrowth)],
        ], qPts(h.revenue), fmtB)}

        {section("Earnings", [
          ["EPS (Diluted)", fd.eps != null ? `$${fd.eps.toFixed(2)}` : '—'],
          ["EPS Growth", fd.epsGrowth != null && Math.abs(fd.epsGrowth) > 200 ? 'N/M' : fmtPct(fd.epsGrowth)],
        ], qPts(h.netIncome), fmtB)}
      </div>

      {/* Margins & Returns + Debt & Capital — side by side */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: "1rem",
        alignItems: "stretch",
      }}>
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
      </div>
    </div>
  );
}
