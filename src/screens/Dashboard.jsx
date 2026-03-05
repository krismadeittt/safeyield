import React, { useState, useMemo } from 'react';
import { projectPortfolioPerStock, seededPRNG } from '../utils/monteCarlo';
import { calcMonthlyIncome } from '../utils/dividends';
import { formatCurrency } from '../utils/format';
import HistoricalProjectedChart from '../components/charts/HistoricalProjectedChart';
import VisualizerToggle from '../components/VisualizerToggle';
import InfoTooltip from '../components/InfoTooltip';
import useIsMobile from '../hooks/useIsMobile';

export default function Dashboard({
  totalIncome, holdings, liveData, portfolioValue, weightedYield, weightedGrowth, cashBalance = 0,
  vizType, setVizType, monthlyAvg,
}) {
  const isMobile = useIsMobile();
  const [horizon, setHorizon] = useState(10);
  const [useVolatility, setUseVolatility] = useState(false);
  const [extraContrib, setExtraContrib] = useState(0);
  const [customContrib, setCustomContrib] = useState("");
  const [vizExpanded, setVizExpanded] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [granularity, setGranularity] = useState("monthly");

  const contrib = customContrib ? parseFloat(customContrib) || 0 : extraContrib;
  const rng = useMemo(() => seededPRNG(42), []);

  const avgYield = weightedYield ?? 0;
  const growth = weightedGrowth;

  // Per-stock projection: each holding compounds with its own yield, g5, and expected return
  // Simulation always runs at fixed resolution (monthly for Real World) — decoupled from display granularity
  const projections = useMemo(() =>
    projectPortfolioPerStock(horizon, holdings, liveData, contrib, useVolatility, rng),
  [horizon, holdings, liveData, contrib, useVolatility]);

  const { noDripVals, dripVals, contribVals, divIncomePerYear, simPeriodsPerYear } = projections;

  // Monthly income data — uses live dividend rates via liveData
  const monthlyData = useMemo(() => calcMonthlyIncome(holdings, liveData), [holdings, liveData]);

  // Expose for history widget compatibility
  if (typeof window !== "undefined") {
    window._h = holdings;
    window._pv = portfolioValue;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Stats row — card layout */}
      <div data-tour="stats" style={{
        display: "flex", flexWrap: "wrap", gap: 12,
        marginBottom: isMobile ? "1rem" : "1.5rem",
      }}>
        <StatCell label="Portfolio Value" value={formatCurrency(portfolioValue)} sub={cashBalance > 0 ? `${holdings.length} holdings + ${formatCurrency(cashBalance)} cash` : `${holdings.length} holdings`} isMobile={isMobile} />
        <StatCell label="Portfolio Yield" value={`${avgYield.toFixed(2)}%`} sub="weighted avg" isMobile={isMobile} tooltip="Weighted average dividend yield across all holdings, based on each position's share of total portfolio value." />
        <StatCell label="Annual Income" value={formatCurrency(totalIncome)} sub={`${formatCurrency(monthlyAvg || 0)}/mo`} isMobile={isMobile} tooltip="Total estimated annual dividend income from all holdings, based on current annual dividend rates." />
        <StatCell label="Monthly Avg" value={formatCurrency(monthlyAvg || 0)} sub="estimated" isMobile={isMobile} />
        <StatCell label="Div Growth" value={`${growth.toFixed(1)}%`} sub="5-year avg" isGrowth isMobile={isMobile} tooltip="Weighted average 5-year dividend growth rate across all holdings. Higher growth means your income is increasing faster." />
      </div>

      {/* Chart row — side-by-side grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns:
          isMobile ? '1fr' :
          vizExpanded ? '1fr' :
          chartExpanded ? '1fr' :
          vizType === 'none' ? '1fr' :
          '380px 1fr',
        gap: 16,
        marginBottom: 16,
      }}>
        {/* Left: Portfolio Visualizer */}
        {!chartExpanded && (
          <VisualizerToggle
            vizType={vizType}
            setVizType={setVizType}
            holdings={holdings}
            liveData={liveData}
            portfolioValue={portfolioValue}
            weightedYield={avgYield}
            annualIncome={totalIncome}
            expanded={vizExpanded}
            setExpanded={setVizExpanded}
            cashBalance={cashBalance}
          />
        )}

        {/* Right: Historical & Projected Income Chart */}
        {!vizExpanded && (
          <div data-tour="chart">
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
            divIncomePerYear={divIncomePerYear}
            simPeriodsPerYear={simPeriodsPerYear}
            totalIncome={totalIncome}
            monthlyData={monthlyData}
            holdings={holdings}
            expanded={chartExpanded}
            setExpanded={setChartExpanded}
            granularity={granularity}
            setGranularity={setGranularity}
          />
          </div>
        )}
      </div>

    </div>
  );
}

function StatCell({ label, value, sub, isMobile, tooltip, isGrowth }) {
  return (
    <div style={{
      flex: isMobile ? "1 1 calc(50% - 6px)" : "1 1 0",
      minWidth: isMobile ? 140 : 160,
      padding: isMobile ? "0.9rem 0.8rem" : "1.2rem 1.4rem",
      background: "var(--bg-card)",
      borderRadius: 14,
      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      border: "1px solid var(--border)",
    }}>
      <div style={{
        fontSize: 12, color: "var(--text-muted)",
        marginBottom: isMobile ? "0.4rem" : "0.6rem",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        fontWeight: 500,
        display: "flex", alignItems: "center",
      }}>
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div style={{
        fontSize: isMobile ? "1.2rem" : "1.6rem", fontWeight: 700,
        color: isGrowth ? "var(--green)" : "var(--text-primary)",
        lineHeight: 1,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: 11, color: "var(--text-sub)", marginTop: "0.35rem",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}
