import React from 'react';
import SingleSeriesBar from '../components/charts/SingleSeriesBar';
import { formatCurrency } from '../utils/format';

/**
 * Financial fundamentals panel — revenue, EPS, FCF, margins, debt, shares.
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

  const section = (title, items, chartData, chartFmt) => (
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
              {value ?? "—"}
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

  const fmtB = v => {
    if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
    return formatCurrency(v);
  };

  const fmtPct = v => `${v?.toFixed(1)}%`;

  return (
    <div>
      {fd.revenueTTM != null && section("Revenue", [
        ["Revenue (TTM)", fmtB(fd.revenueTTM)],
        ["Sales Growth", fd.salesGrowth != null ? fmtPct(fd.salesGrowth) : "—"],
        ["Shares Out", fd.sharesOutstanding ? `${(fd.sharesOutstanding / 1e9).toFixed(2)}B` : "—"],
      ], fd.revenueHistory?.map((v, i) => ({ label: `Q${i + 1}`, value: v })), fmtB)}

      {fd.epsDiluted != null && section("Earnings Per Share", [
        ["EPS (Diluted)", `$${fd.epsDiluted?.toFixed(2)}`],
        ["EPS Growth", fd.epsGrowth != null ? fmtPct(fd.epsGrowth) : "—"],
        ["Payout Ratio", fd.payoutRatio != null ? fmtPct(fd.payoutRatio) : "—"],
      ], fd.epsHistory?.map((v, i) => ({ label: `Q${i + 1}`, value: v })), v => `$${v.toFixed(2)}`)}

      {fd.fcfTTM != null && section("Free Cash Flow", [
        ["FCF (TTM)", fmtB(fd.fcfTTM)],
        ["FCF/Share", fd.fcfPerShare != null ? `$${fd.fcfPerShare.toFixed(2)}` : "—"],
        ["FCF Margin", fd.fcfMargin != null ? fmtPct(fd.fcfMargin) : "—"],
        ["FCF Payout", fd.fcfPayout != null ? fmtPct(fd.fcfPayout) : "—"],
      ], fd.fcfHistory?.map((v, i) => ({ label: `Q${i + 1}`, value: v })), fmtB)}

      {(fd.operatingMargin != null || fd.netMargin != null) && section("Margins & Returns", [
        ["Operating Margin", fd.operatingMargin != null ? fmtPct(fd.operatingMargin) : "—"],
        ["Net Margin", fd.netMargin != null ? fmtPct(fd.netMargin) : "—"],
        ["ROE", fd.roe != null ? fmtPct(fd.roe) : "—"],
        ["ROA", fd.roa != null ? fmtPct(fd.roa) : "—"],
      ], fd.netIncomeHistory?.map((v, i) => ({ label: `Q${i + 1}`, value: v })), fmtB)}

      {fd.netDebtToEBITDA != null && section("Debt & Capital Structure", [
        ["Net Debt/EBITDA", fd.netDebtToEBITDA?.toFixed(1) + "x"],
        ["Interest Coverage", fd.interestCoverage != null ? fd.interestCoverage.toFixed(1) + "x" : "—"],
        ["Net Debt", fd.netDebt != null ? fmtB(fd.netDebt) : "—"],
      ], fd.netDebtHistory?.map((v, i) => ({ label: `Q${i + 1}`, value: v })), fmtB)}

      {fd.sharesHistory?.length > 0 && section("Shares Outstanding", [
        ["Current", fd.sharesOutstanding ? `${(fd.sharesOutstanding / 1e9).toFixed(2)}B` : "—"],
      ], fd.sharesHistory?.map((v, i) => ({ label: `Q${i + 1}`, value: v })), v => `${(v / 1e9).toFixed(2)}B`)}
    </div>
  );
}
