import React, { useState, useMemo } from 'react';
import { projectPortfolioPerStock, seededPRNG } from '../utils/monteCarlo';
import { calcMonthlyIncome } from '../utils/dividends';
import { formatCurrency } from '../utils/format';
import HistoricalProjectedChart from '../components/charts/HistoricalProjectedChart';
import useIsMobile from '../hooks/useIsMobile';

export default function Dashboard({
  totalIncome, holdings, liveData, portfolioValue, weightedYield, weightedGrowth, cashBalance = 0,
}) {
  const isMobile = useIsMobile();
  const [horizon, setHorizon] = useState(10);
  const [useVolatility, setUseVolatility] = useState(false);
  const [extraContrib, setExtraContrib] = useState(0);
  const [customContrib, setCustomContrib] = useState("");

  const contrib = customContrib ? parseFloat(customContrib) || 0 : extraContrib;
  const rng = useMemo(() => seededPRNG(42), []);

  const avgYield = weightedYield || 2.5;
  const growth = weightedGrowth;

  // Per-stock projection: each holding compounds with its own yield, g5, and expected return
  const projections = useMemo(() =>
    projectPortfolioPerStock(horizon, holdings, liveData, contrib, useVolatility, rng),
  [horizon, holdings, liveData, contrib, useVolatility]);

  const { noDripVals, dripVals, contribVals } = projections;

  // Monthly income data
  const monthlyData = useMemo(() => calcMonthlyIncome(holdings), [holdings]);
  const monthlyAvg = monthlyData.reduce((a, b) => a + b, 0) / 12;

  // Expose for history widget compatibility
  if (typeof window !== "undefined") {
    window._h = holdings;
    window._pv = portfolioValue;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Stats row — bordered strip */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)", gap: 0,
        marginBottom: isMobile ? "1rem" : "2rem",
        borderTop: "1px solid #0a1e30", borderBottom: "1px solid #0a1e30",
        background: "transparent",
      }}>
        <StatCell label="Portfolio Value" value={formatCurrency(portfolioValue)} sub={cashBalance > 0 ? `${holdings.length} holdings + ${formatCurrency(cashBalance)} cash` : `${holdings.length} holdings`} isMobile={isMobile} />
        <StatCell label="Portfolio Yield" value={`${avgYield.toFixed(2)}%`} sub="weighted avg" isMobile={isMobile} />
        <StatCell label="Annual Income" value={formatCurrency(totalIncome)} sub={`${formatCurrency(monthlyAvg)}/mo`} isMobile={isMobile} />
        <StatCell label="Monthly Avg" value={formatCurrency(monthlyAvg)} sub="estimated" isMobile={isMobile} />
        <StatCell label="Wtd Div Growth" value={`${growth.toFixed(1)}%`} sub="5-year avg" last isMobile={isMobile} />
      </div>

      {/* Single unified chart with all controls inside */}
      <HistoricalProjectedChart
        portfolioValue={portfolioValue}
        avgYield={avgYield}
        growth={growth}
        horizon={horizon}
        setHorizon={setHorizon}
        useVolatility={useVolatility}
        setUseVolatility={setUseVolatility}
        extraContrib={extraContrib}
        setExtraContrib={setExtraContrib}
        customContrib={customContrib}
        setCustomContrib={setCustomContrib}
        noDripVals={noDripVals}
        dripVals={dripVals}
        contribVals={contribVals}
        totalIncome={totalIncome}
        monthlyData={monthlyData}
        holdings={holdings}
      />
    </div>
  );
}

function StatCell({ label, value, sub, last, isMobile }) {
  return (
    <div style={{
      padding: isMobile ? "0.9rem 0.8rem" : "1.8rem 2rem",
      borderRight: last ? "none" : "1px solid #0a1e30",
      borderBottom: isMobile ? "1px solid #0a1e30" : "none",
    }}>
      <div style={{
        fontSize: isMobile ? "0.5rem" : "0.56rem", color: "#1e4060", textTransform: "uppercase",
        letterSpacing: "0.2em", marginBottom: isMobile ? "0.4rem" : "0.65rem",
        fontFamily: "'EB Garamond', Georgia, serif",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: isMobile ? "1.1rem" : "1.5rem", fontWeight: 600, color: "#c8dff0", lineHeight: 1,
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: isMobile ? "0.6rem" : "0.7rem", color: "#1a3a58", marginTop: "0.4rem", fontStyle: "italic",
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}
