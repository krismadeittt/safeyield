import React, { useState, useMemo } from 'react';
import { projectPortfolioPerStock, seededPRNG } from '../utils/monteCarlo';
import { calcMonthlyIncome } from '../utils/dividends';
import { formatCurrency } from '../utils/format';
import HistoricalProjectedChart from '../components/charts/HistoricalProjectedChart';

export default function Dashboard({
  totalIncome, holdings, liveData, portfolioValue, weightedYield, weightedGrowth,
}) {
  const [horizon, setHorizon] = useState(10);
  const [useVolatility, setUseVolatility] = useState(false);
  const [extraContrib, setExtraContrib] = useState(0);
  const [customContrib, setCustomContrib] = useState("");

  const contrib = customContrib ? parseFloat(customContrib) || 0 : extraContrib;
  const rng = useMemo(() => seededPRNG(42), []);

  const avgYield = weightedYield || 2.5;
  const growth = weightedGrowth || 5;

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
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0,
        marginBottom: "2rem",
        borderTop: "1px solid #0a1e30", borderBottom: "1px solid #0a1e30",
        background: "transparent",
      }}>
        <StatCell label="Portfolio Value" value={formatCurrency(portfolioValue)} sub={`${holdings.length} holdings`} />
        <StatCell label="Portfolio Yield" value={`${avgYield.toFixed(2)}%`} sub="weighted avg" />
        <StatCell label="Annual Income" value={formatCurrency(totalIncome)} sub={`${formatCurrency(monthlyAvg)}/mo`} />
        <StatCell label="Monthly Avg" value={formatCurrency(monthlyAvg)} sub="estimated" />
        <StatCell label="Wtd Div Growth" value={`${growth.toFixed(1)}%`} sub="5-year avg" last />
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

function StatCell({ label, value, sub, last }) {
  return (
    <div style={{
      padding: "1.8rem 2rem",
      borderRight: last ? "none" : "1px solid #0a1e30",
    }}>
      <div style={{
        fontSize: "0.56rem", color: "#1e4060", textTransform: "uppercase",
        letterSpacing: "0.2em", marginBottom: "0.65rem",
        fontFamily: "'EB Garamond', Georgia, serif",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "1.5rem", fontWeight: 600, color: "#c8dff0", lineHeight: 1,
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: "0.7rem", color: "#1a3a58", marginTop: "0.4rem", fontStyle: "italic",
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}
