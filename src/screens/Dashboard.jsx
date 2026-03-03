import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  const lineColors = contribVals ? ["#1a3a5c", "#005EB8", "#5aaff8"] : ["#1a3a5c", "#005EB8"];

  // Key projection values for stats cards
  const finalNoDrip = noDripVals[noDripVals.length - 1] || 0;
  const finalDrip = (contribVals || dripVals)[horizon] || 0;
  const dripAdvantage = finalDrip - finalNoDrip;

  // Expose for history widget compatibility
  if (typeof window !== "undefined") {
    window._h = holdings;
    window._pv = portfolioValue;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>

      {/* 4 Stats Cards — TODAY / NO DRIP / DRIP / DRIP ADVANTAGE */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8,
      }}>
        <StatCard
          label="TODAY"
          value={formatCurrency(portfolioValue)}
          sub={`${formatCurrency(totalIncome)}/yr · ${formatCurrency(monthlyAvg)}/mo`}
          accent="#5aaff8"
        />
        <StatCard
          label={`NO DRIP · ${horizon}Y`}
          value={formatCurrency(finalNoDrip)}
          sub={`${avgYield.toFixed(2)}% yield · no reinvestment`}
          accent="#3a5a78"
        />
        <StatCard
          label={`DRIP · ${horizon}Y`}
          value={formatCurrency(finalDrip)}
          sub={`${growth.toFixed(1)}% div growth · reinvested`}
          accent="#005EB8"
        />
        <StatCard
          label="DRIP ADVANTAGE"
          value={`+${formatCurrency(dripAdvantage)}`}
          sub={finalNoDrip > 0
            ? `+${((dripAdvantage / finalNoDrip) * 100).toFixed(1)}% more with DRIP`
            : ""}
          accent="#00cc66"
        />
      </div>

      {/* Controls bar */}
      <div style={{
        background: "#0a1628", border: "1px solid #0a1e30", padding: "0.8rem 1rem",
        display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
      }}>
        {/* Horizon */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: "0.55rem", color: "#1a4060", letterSpacing: "0.15em", marginRight: 4 }}>
            HORIZON
          </span>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} style={{
              padding: "3px 8px", fontSize: "0.7rem", cursor: "pointer",
              background: horizon === h ? "#005EB8" : "transparent",
              color: horizon === h ? "#c8dff0" : "#2a4a6a",
              border: `1px solid ${horizon === h ? "#005EB8" : "#0a1e30"}`,
            }}>
              {h}Y
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: "#0a1e30" }} />

        {/* Volatility toggle */}
        <button onClick={() => setUseVolatility(v => !v)} style={{
          padding: "3px 10px", fontSize: "0.7rem", cursor: "pointer",
          background: useVolatility ? "#005EB8" : "transparent",
          color: useVolatility ? "#c8dff0" : "#2a4a6a",
          border: `1px solid ${useVolatility ? "#005EB8" : "#0a1e30"}`,
        }}>
          {useVolatility ? "Volatility ON" : "Real World Returns"}
        </button>

        <div style={{ width: 1, height: 20, background: "#0a1e30" }} />

        {/* LINE / MONTHLY BAR toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: "0.55rem", color: "#1a4060", letterSpacing: "0.15em", marginRight: 4 }}>
            VIEW
          </span>
          {[
            { key: "line", label: "LINE" },
            { key: "monthly", label: "MONTHLY BAR" },
          ].map(m => (
            <button key={m.key} onClick={() => setChartMode(m.key)} style={{
              padding: "3px 10px", fontSize: "0.7rem", cursor: "pointer",
              background: chartMode === m.key ? "#005EB8" : "transparent",
              color: chartMode === m.key ? "#c8dff0" : "#2a4a6a",
              border: `1px solid ${chartMode === m.key ? "#005EB8" : "#0a1e30"}`,
            }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Extra contributions */}
      <div style={{
        background: "#0a1628", border: "1px solid #0a1e30", padding: "0.8rem 1rem",
        display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
      }}>
        <span style={{ fontSize: "0.55rem", color: "#1a4060", letterSpacing: "0.15em" }}>
          ANNUAL CONTRIBUTION
        </span>
        {CONTRIBUTIONS.map(c => (
          <button key={c} onClick={() => { setExtraContrib(c); setCustomContrib(""); }} style={{
            padding: "3px 8px", fontSize: "0.7rem", cursor: "pointer",
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
            width: 80, padding: "3px 8px", fontSize: "0.7rem",
            background: "#071020", border: "1px solid #0a1e30", color: "#c8dff0",
            fontFamily: "'EB Garamond', Georgia, serif",
          }}
        />
      </div>

      {/* DRIP vs No-DRIP chart + Legend */}
      <div style={{ background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: "0.8rem",
        }}>
          <div style={{
            fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}>
            DRIP vs No-DRIP — Portfolio Value
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, background: "#1a3050" }} />
              <span style={{ fontSize: "0.6rem", color: "#3a5a78" }}>No DRIP</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 10, height: 10, background: "#005EB8" }} />
              <span style={{ fontSize: "0.6rem", color: "#3a5a78" }}>DRIP Bonus</span>
            </div>
            {contribVals && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 10, height: 10, background: "#5aaff8" }} />
                <span style={{ fontSize: "0.6rem", color: "#3a5a78" }}>+ Contributions</span>
              </div>
            )}
          </div>
        </div>

        {chartMode === "line" ? (
          <MultiLineChart
            pts={lineData}
            keys={lineKeys}
            colors={lineColors}
            dashes={["4,4"]}
            fmt={formatCurrency}
            H={220}
          />
        ) : (
          <PortfolioBalanceMonthly
            dripVals={dripVals}
            contribVals={contribVals}
            monthlyData={monthlyData}
            totalIncome={totalIncome}
            avgYield={avgYield}
            horizon={horizon}
            extraContrib={contrib}
          />
        )}
      </div>

      {/* DRIP Comparison (stacked bars) — always show */}
      <DripComparisonBar
        projData={{ noDrip: noDripVals, drip: dripVals }}
        contribVals={contribVals}
        horizon={horizon}
        extraContrib={contrib}
        fmtY={formatCurrency}
      />

      {/* Historical & Projected Income */}
      <HistoricalProjectedChart
        portfolioValue={portfolioValue}
        avgYield={avgYield}
        growth={growth}
        horizon={horizon}
        holdings={holdings}
      />

      {/* Monthly dividend heatmap */}
      <MonthlyHeatmap
        fullYearData={fullYearData}
        avgYield={avgYield}
        monthlyData={monthlyData}
      />
    </div>
  );
}

/**
 * Single stat card used in the top row.
 */
function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: "#0a1628", border: "1px solid #0a1e30", padding: "1rem 1.2rem",
    }}>
      <div style={{
        fontSize: "0.5rem", color: "#1a4060", letterSpacing: "0.2em",
        textTransform: "uppercase", marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "1.4rem", fontWeight: 700, color: accent || "#c8dff0",
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: "0.65rem", color: "#2a4a6a", marginTop: 4,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}
