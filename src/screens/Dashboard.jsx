import React, { useState, useMemo } from 'react';
import { projectPortfolio, seededPRNG } from '../utils/monteCarlo';
import { calcMonthlyIncome } from '../utils/dividends';
import { formatCurrency, MONTHS } from '../utils/format';
import PortfolioBalanceMonthly from '../components/charts/PortfolioBalanceMonthly';
import DripComparisonBar from '../components/charts/DripComparisonBar';
import MonthlyHeatmap from '../components/charts/MonthlyHeatmap';
import MultiLineChart from '../components/charts/MultiLineChart';

const HORIZONS = [1, 5, 10, 15, 25, 30, 40, 50];
const CONTRIBUTIONS = [0, 1000, 5000, 10000, 20000, 25000, 50000];

export default function Dashboard({
  totalIncome, holdings, liveData, portfolioValue, weightedYield, weightedGrowth,
}) {
  const [horizon, setHorizon] = useState(10);
  const [useVolatility, setUseVolatility] = useState(false);
  const [extraContrib, setExtraContrib] = useState(0);
  const [customContrib, setCustomContrib] = useState("");
  const [chartMode, setChartMode] = useState("bar"); // "bar" or "line"

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
  const lineColors = contribVals ? ["#1a3a5c", "#005EB8", "#5aaff8"] : ["#1a3a5c", "#005EB8"];

  // Expose for history widget compatibility
  if (typeof window !== "undefined") {
    window._h = holdings;
    window._pv = portfolioValue;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
      {/* Stats bar */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 8,
      }}>
        {[
          { label: "Portfolio Value", value: formatCurrency(portfolioValue) },
          { label: "Annual Income", value: formatCurrency(totalIncome) },
          { label: "Monthly Avg", value: formatCurrency(monthlyAvg) },
          { label: "Weighted Yield", value: `${avgYield.toFixed(2)}%` },
          { label: "Div Growth (5Y)", value: `${growth.toFixed(1)}%` },
        ].map(stat => (
          <div key={stat.label} style={{
            background: "#0a1628", border: "1px solid #0a1e30", padding: "1rem",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: "0.55rem", color: "#1a4060", letterSpacing: "0.2em",
              textTransform: "uppercase", marginBottom: 4,
            }}>
              {stat.label}
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 600, color: "#c8dff0" }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{
        background: "#0a1628", border: "1px solid #0a1e30", padding: "1rem",
        display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
      }}>
        {/* Horizon */}
        <div>
          <span style={{ fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.15em", marginRight: 8 }}>
            HORIZON
          </span>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} style={{
              padding: "4px 10px", fontSize: "0.75rem", cursor: "pointer", margin: "0 2px",
              background: horizon === h ? "#005EB8" : "transparent",
              color: horizon === h ? "#c8dff0" : "#2a4a6a",
              border: `1px solid ${horizon === h ? "#005EB8" : "#0a1e30"}`,
            }}>
              {h}Y
            </button>
          ))}
        </div>

        {/* Volatility toggle */}
        <button onClick={() => setUseVolatility(v => !v)} style={{
          padding: "4px 12px", fontSize: "0.75rem", cursor: "pointer",
          background: useVolatility ? "#005EB8" : "transparent",
          color: useVolatility ? "#c8dff0" : "#2a4a6a",
          border: `1px solid ${useVolatility ? "#005EB8" : "#0a1e30"}`,
        }}>
          {useVolatility ? "Volatility ON" : "Real World Returns"}
        </button>

        {/* Chart mode */}
        <button onClick={() => setChartMode(m => m === "bar" ? "line" : "bar")} style={{
          padding: "4px 12px", fontSize: "0.75rem", cursor: "pointer",
          background: "transparent", color: "#2a4a6a", border: "1px solid #0a1e30",
        }}>
          {chartMode === "bar" ? "Line View" : "Bar View"}
        </button>
      </div>

      {/* Extra contributions */}
      <div style={{
        background: "#0a1628", border: "1px solid #0a1e30", padding: "1rem",
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
      }}>
        <span style={{ fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.15em" }}>
          ANNUAL CONTRIBUTION
        </span>
        {CONTRIBUTIONS.map(c => (
          <button key={c} onClick={() => { setExtraContrib(c); setCustomContrib(""); }} style={{
            padding: "4px 10px", fontSize: "0.75rem", cursor: "pointer",
            background: extraContrib === c && !customContrib ? "#005EB8" : "transparent",
            color: extraContrib === c && !customContrib ? "#c8dff0" : "#2a4a6a",
            border: `1px solid ${extraContrib === c && !customContrib ? "#005EB8" : "#0a1e30"}`,
          }}>
          {c === 0 ? "$0" : `$${(c/1000).toFixed(0)}k`}
          </button>
        ))}
        <input
          placeholder="Custom $"
          value={customContrib}
          onChange={e => setCustomContrib(e.target.value.replace(/[^0-9]/g, ""))}
          style={{
            width: 80, padding: "4px 8px", fontSize: "0.75rem",
            background: "#071020", border: "1px solid #0a1e30", color: "#c8dff0",
            fontFamily: "'EB Garamond', Georgia, serif",
          }}
        />
      </div>

      {/* Charts */}
      {chartMode === "bar" ? (
        <>
          <DripComparisonBar
            projData={{ noDrip: noDripVals, drip: dripVals }}
            contribVals={contribVals}
            horizon={horizon}
            extraContrib={contrib}
            fmtY={formatCurrency}
          />
          <PortfolioBalanceMonthly
            dripVals={dripVals}
            contribVals={contribVals}
            monthlyData={monthlyData}
            totalIncome={totalIncome}
            avgYield={avgYield}
            horizon={horizon}
            extraContrib={contrib}
          />
        </>
      ) : (
        <div style={{ background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem" }}>
          <div style={{
            fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
            textTransform: "uppercase", marginBottom: "0.8rem",
          }}>
            Portfolio Value — DRIP vs No-DRIP
          </div>
          <MultiLineChart
            pts={lineData}
            keys={lineKeys}
            colors={lineColors}
            dashes={["4,4"]}
            fmt={formatCurrency}
            H={220}
          />
        </div>
      )}

      <MonthlyHeatmap
        fullYearData={fullYearData}
        avgYield={avgYield}
        monthlyData={monthlyData}
      />
    </div>
  );
}
