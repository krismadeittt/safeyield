import React, { useState, useMemo } from 'react';
import { projectPortfolio, seededPRNG } from '../utils/monteCarlo';
import { calcMonthlyIncome } from '../utils/dividends';
import { formatCurrency, MONTHS } from '../utils/format';
import PortfolioBalanceMonthly from '../components/charts/PortfolioBalanceMonthly';
import DripComparisonBar from '../components/charts/DripComparisonBar';
import MonthlyHeatmap from '../components/charts/MonthlyHeatmap';
import MultiLineChart from '../components/charts/MultiLineChart';
import HistoricalProjectedChart from '../components/charts/HistoricalProjectedChart';

const HORIZONS = [1, 5, 10, 15, 25, 30, 40, 50];
const CONTRIBUTIONS = [0, 1000, 5000, 10000, 20000, 25000, 50000];

export default function Dashboard({
  totalIncome, holdings, liveData, portfolioValue, weightedYield, weightedGrowth,
}) {
  const [horizon, setHorizon] = useState(10);
  const [useVolatility, setUseVolatility] = useState(false);
  const [extraContrib, setExtraContrib] = useState(0);
  const [customContrib, setCustomContrib] = useState("");
  const [chartMode, setChartMode] = useState("line"); // "line" or "monthly"

  const contrib = customContrib ? parseFloat(customContrib) || 0 : extraContrib;
  const rng = useMemo(() => seededPRNG(42), []);

  const avgYield = weightedYield || 2.5;
  const growth = weightedGrowth || 5;

  // Run projections
  const noDripVals = useMemo(() =>
    projectPortfolio(horizon, false, 0, portfolioValue, avgYield, 8, useVolatility, rng, growth),
  [horizon, portfolioValue, avgYield, useVolatility, growth]);

  const dripVals = useMemo(() =>
    projectPortfolio(horizon, true, 0, portfolioValue, avgYield, 8, useVolatility, rng, growth),
  [horizon, portfolioValue, avgYield, useVolatility, growth]);

  const contribVals = useMemo(() =>
    contrib > 0 ? projectPortfolio(horizon, true, contrib, portfolioValue, avgYield, 8, useVolatility, rng, growth) : null,
  [horizon, portfolioValue, avgYield, contrib, useVolatility, growth]);

  // Monthly income data
  const monthlyData = useMemo(() => calcMonthlyIncome(holdings), [holdings]);
  const monthlyAvg = monthlyData.reduce((a, b) => a + b, 0) / 12;

  // Build yearly dividend heatmap data
  const fullYearData = useMemo(() => {
    const years = [];
    for (let yr = 0; yr <= Math.min(horizon, 30); yr++) {
      const growthFactor = Math.pow(1 + (growth / 100), yr);
      const months = monthlyData.map(m => Math.round(m * growthFactor));
      years.push({ months });
    }
    return years;
  }, [horizon, monthlyData, growth]);

  // Line chart data for multi-line view
  const lineData = useMemo(() => {
    const pts = [];
    for (let i = 0; i <= horizon; i++) {
      pts.push({
        label: `Y${i}`,
        noDrip: noDripVals[i],
        drip: dripVals[i],
        ...(contribVals ? { contrib: contribVals[i] } : {}),
      });
    }
    return pts;
  }, [noDripVals, dripVals, contribVals, horizon]);

  const lineKeys = contribVals ? ["noDrip", "drip", "contrib"] : ["noDrip", "drip"];
  const lineColors = contribVals ? ["#1a3a5c", "#005EB8", "#1a5a9e"] : ["#1a3a5c", "#005EB8"];

  // Key projection values
  const finalNoDrip = noDripVals[noDripVals.length - 1] || 0;
  const finalDrip = (contribVals || dripVals)[horizon] || 0;
  const dripAdvantage = finalDrip - finalNoDrip;

  // Expose for history widget compatibility
  if (typeof window !== "undefined") {
    window._h = holdings;
    window._pv = portfolioValue;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Stats row — bordered strip like old monolith */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0,
        marginBottom: "2.5rem",
        borderTop: "1px solid #0a1e30", borderBottom: "1px solid #0a1e30",
        background: "transparent",
      }}>
        <StatCell label="Portfolio Value" value={formatCurrency(portfolioValue)} sub={`${holdings.length} holdings`} />
        <StatCell label="Portfolio Yield" value={`${avgYield.toFixed(2)}%`} sub="weighted avg" />
        <StatCell label="Annual Income" value={formatCurrency(totalIncome)} sub={`${formatCurrency(monthlyAvg)}/mo`} />
        <StatCell label="Monthly Avg" value={formatCurrency(monthlyAvg)} sub="estimated" />
        <StatCell label="Wtd Div Growth" value={`${growth.toFixed(1)}%`} sub="5-year avg" last />
      </div>

      {/* Historical & Projected Income */}
      <HistoricalProjectedChart
        portfolioValue={portfolioValue}
        avgYield={avgYield}
        growth={growth}
        horizon={horizon}
        setHorizon={setHorizon}
        useVolatility={useVolatility}
        setUseVolatility={setUseVolatility}
        chartMode={chartMode}
        setChartMode={setChartMode}
        extraContrib={contrib}
        noDripVals={noDripVals}
        dripVals={dripVals}
        contribVals={contribVals}
        totalIncome={totalIncome}
        lineData={lineData}
        lineKeys={lineKeys}
        lineColors={lineColors}
        monthlyData={monthlyData}
        holdings={holdings}
      />

      {/* Extra contributions */}
      <div style={{
        background: "#0a1628", border: "1px solid #1a3a5c", padding: "0.9rem 1.5rem",
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
        marginTop: "1.5rem",
      }}>
        <span style={{
          fontSize: "0.6rem", color: "#2a4a6a", letterSpacing: "0.07em",
          textTransform: "uppercase", fontFamily: "system-ui",
        }}>
          Annual Contribution
        </span>
        {CONTRIBUTIONS.map(c => (
          <button key={c} onClick={() => { setExtraContrib(c); setCustomContrib(""); }} style={{
            padding: "0.28rem 0.6rem", fontSize: "0.75rem", fontWeight: 700,
            cursor: "pointer", fontFamily: "system-ui",
            background: extraContrib === c && !customContrib ? "#071020" : "#0f2035",
            color: extraContrib === c && !customContrib ? "#005EB8" : "#2a4a6a",
            border: `1px solid ${extraContrib === c && !customContrib ? "#005EB8" : "#1a3a5c"}`,
            transition: "all 0.15s",
          }}>
          {c === 0 ? "$0" : `$${(c/1000).toFixed(0)}k`}
          </button>
        ))}
        <input
          placeholder="Custom $"
          value={customContrib}
          onChange={e => setCustomContrib(e.target.value.replace(/[^0-9]/g, ""))}
          style={{
            width: 80, padding: "0.28rem 0.6rem", fontSize: "0.75rem",
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            color: "#c8dff0", fontFamily: "system-ui", outline: "none",
          }}
        />
      </div>

      {/* Monthly dividend heatmap */}
      <div style={{ marginTop: "1.5rem" }}>
        <MonthlyHeatmap
          fullYearData={fullYearData}
          avgYield={avgYield}
          monthlyData={monthlyData}
        />
      </div>
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
