import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatCurrency, MONTHS } from '../../utils/format';
import { fetchBatchHistory, calcHistoricalPortfolioValues } from '../../api/history';

const HIST_YEARS = 10;
const PROJ_YEARS = 10;

export default function HistoricalProjectedChart({
  portfolioValue, avgYield, growth, horizon, setHorizon,
  useVolatility, setUseVolatility,
  extraContrib, noDripVals, dripVals, contribVals, totalIncome,
  monthlyData, holdings,
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [hovered, setHovered] = useState(null);
  const [divHovered, setDivHovered] = useState(null);
  const [historyMap, setHistoryMap] = useState({});
  const [histLoading, setHistLoading] = useState(false);
  const [granularity, setGranularity] = useState("quarterly");

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Fetch real history data
  useEffect(() => {
    if (!holdings?.length) return;
    const tickers = holdings.map(h => h.ticker);
    setHistLoading(true);
    fetchBatchHistory(tickers)
      .then(map => setHistoryMap(map))
      .finally(() => setHistLoading(false));
  }, [holdings]);

  const currentYear = new Date().getFullYear();
  const projYears = Math.min(horizon, PROJ_YEARS);

  const realHistData = useMemo(() => {
    if (Object.keys(historyMap).length === 0) return null;
    return calcHistoricalPortfolioValues(historyMap, holdings, portfolioValue);
  }, [historyMap, holdings, portfolioValue]);

  // Build quarterly or monthly bar data: 10 years back + 10 years forward
  const bars = useMemo(() => {
    const yieldRate = (avgYield || 2.5) / 100;
    const growthRate = (growth || 5) / 100;
    const annualReturn = 0.08;
    const isQuarterly = granularity === "quarterly";
    const periodsPerYear = isQuarterly ? 4 : 12;
    const periodLabels = isQuarterly
      ? ["Q1", "Q2", "Q3", "Q4"]
      : ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const result = [];

    // --- HISTORICAL: 10 years back ---
    let histYearlyValues;
    if (realHistData && realHistData.length > 1) {
      histYearlyValues = realHistData;
    } else {
      histYearlyValues = [];
      let backVal = portfolioValue;
      const vals = [{ year: currentYear, value: portfolioValue, noDripValue: portfolioValue }];
      for (let i = 1; i <= HIST_YEARS; i++) {
        const pastYield = yieldRate * Math.pow(1 + growthRate, -i);
        const totalGrowth = 1 + annualReturn + pastYield;
        backVal = backVal / totalGrowth;
        vals.unshift({ year: currentYear - i, value: Math.round(backVal), noDripValue: Math.round(backVal * 0.92) });
      }
      histYearlyValues = vals;
    }

    // Interpolate yearly values into quarterly/monthly bars
    for (let yi = 0; yi < histYearlyValues.length - 1; yi++) {
      const from = histYearlyValues[yi];
      const to = histYearlyValues[yi + 1];
      for (let p = 0; p < periodsPerYear; p++) {
        const t = p / periodsPerYear;
        const value = Math.round(from.value + (to.value - from.value) * t);
        result.push({
          label: isQuarterly ? `${from.year} ${periodLabels[p]}` : `${periodLabels[p]} ${from.year}`,
          shortLabel: p === 0 ? String(from.year) : "",
          value,
          isHistorical: true,
          isCurrent: false,
          year: from.year,
          periodIndex: p,
          yearsFromNow: from.year - currentYear,
        });
      }
    }
    // Add the current year point
    result.push({
      label: "Now",
      shortLabel: "Now",
      value: portfolioValue,
      isHistorical: true,
      isCurrent: true,
      year: currentYear,
      periodIndex: 0,
      yearsFromNow: 0,
    });

    const nowBarIndex = result.length - 1;

    // --- PROJECTED: 10 years forward ---
    let projVal = portfolioValue;
    let curYield = yieldRate;
    for (let yr = 1; yr <= projYears; yr++) {
      for (let p = 0; p < periodsPerYear; p++) {
        const periodReturn = annualReturn / periodsPerYear;
        const periodDiv = projVal * curYield / periodsPerYear;
        projVal = projVal * (1 + periodReturn) + periodDiv;
        curYield *= Math.pow(1 + growthRate, 1 / periodsPerYear);
        const label = isQuarterly
          ? `${currentYear + yr} ${periodLabels[p]}`
          : `${periodLabels[p]} ${currentYear + yr}`;
        result.push({
          label,
          shortLabel: p === 0 ? `Y${yr}` : "",
          value: Math.round(projVal),
          isHistorical: false,
          isCurrent: false,
          year: currentYear + yr,
          periodIndex: p,
          yearsFromNow: yr,
        });
      }
    }

    return { bars: result, nowBarIndex };
  }, [portfolioValue, avgYield, growth, projYears, currentYear, realHistData, granularity]);

  const { bars: barData, nowBarIndex } = bars;

  // Build dividend income bars aligned with main chart bars
  const divBars = useMemo(() => {
    if (!monthlyData?.length) return [];
    const growthRate = (growth || 5) / 100;
    const isQuarterly = granularity === "quarterly";

    return barData.map(bar => {
      const yearsFromNow = bar.yearsFromNow || 0;
      const growthFactor = Math.pow(1 + growthRate, yearsFromNow);

      let divIncome;
      if (isQuarterly) {
        // Sum 3 months for the quarter
        const qStart = (bar.periodIndex || 0) * 3;
        divIncome = 0;
        for (let m = qStart; m < qStart + 3 && m < 12; m++) {
          divIncome += (monthlyData[m] || 0);
        }
      } else {
        divIncome = monthlyData[bar.periodIndex || 0] || 0;
      }

      // Scale by growth factor (positive for future, negative for past)
      divIncome = Math.round(divIncome * growthFactor);

      return {
        label: bar.label,
        value: Math.max(0, divIncome),
        isHistorical: bar.isHistorical,
        isCurrent: bar.isCurrent,
      };
    });
  }, [barData, monthlyData, growth, granularity]);

  // Quarterly income stats
  const quarterlyIncome = Math.round(totalIncome / 4);
  const projY10Quarterly = Math.round(totalIncome * Math.pow(1 + (growth || 5) / 100, 10) / 4);
  const totalIncomeOver10Y = useMemo(() => {
    let sum = 0;
    let inc = totalIncome;
    for (let i = 0; i < 10; i++) {
      sum += inc;
      inc *= (1 + (growth || 5) / 100);
    }
    return Math.round(sum);
  }, [totalIncome, growth]);

  // Shared chart layout — both charts use the same X axis
  const padL = 50;
  const padR = 10;
  const svgW = width - 48;
  const chartW = svgW - padL - padR;
  const barCount = barData.length;
  const stepW = chartW / barCount;
  const barW = Math.max(2, Math.min(stepW * 0.7, 20));

  // Main chart dimensions
  const mainH = 280;
  const mainPadTop = 40;
  const mainPadBot = 4; // no x-axis labels on main — they go between the charts
  const mainChartH = mainH - mainPadTop - mainPadBot;
  const maxVal = Math.max(...barData.map(b => b.value), 1);

  // Dividend chart dimensions
  const divH = 120;
  const divPadTop = 4;
  const divPadBot = 28;
  const divChartH = divH - divPadTop - divPadBot;
  const maxDiv = divBars.length > 0 ? Math.max(...divBars.map(b => b.value), 1) : 1;

  // NOW divider X position
  const nowX = padL + nowBarIndex * stepW + stepW / 2;

  // Unified hover across both charts
  const activeHover = hovered ?? divHovered;

  return (
    <div ref={containerRef} style={{
      background: "#0a1628", border: "1px solid #1a3a5c", padding: "1.5rem",
    }}>
      {/* Title row */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "1rem", flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: "0.95rem", fontFamily: "system-ui", color: "#c8dff0" }}>
            Portfolio & Income Overview
          </span>
          {realHistData && (
            <span style={{
              fontSize: "0.55rem", color: "#1a7a3a", fontFamily: "system-ui",
              padding: "2px 6px", border: "1px solid rgba(26,122,58,0.3)",
            }}>
              REAL DATA
            </span>
          )}
          {histLoading && (
            <span style={{ fontSize: "0.6rem", color: "#2a4a6a", fontFamily: "system-ui" }}>
              Loading history...
            </span>
          )}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 0, border: "1px solid #0a1e30" }}>
            {[
              { key: "quarterly", label: "QUARTERLY" },
              { key: "monthly", label: "MONTHLY" },
            ].map(m => (
              <button key={m.key} onClick={() => setGranularity(m.key)} style={{
                padding: "0.28rem 0.7rem", border: "none",
                fontSize: "0.65rem", fontWeight: 600, cursor: "pointer",
                letterSpacing: "0.1em", textTransform: "uppercase",
                background: granularity === m.key ? "#005EB8" : "transparent",
                color: granularity === m.key ? "#ffffff" : "#1e4060",
                transition: "all 0.15s",
              }}>
                {m.label}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: "#1a3a5c" }} />
          <button onClick={() => setUseVolatility(v => !v)} style={{
            padding: "0.28rem 0.7rem", fontSize: "0.65rem", fontWeight: 700,
            cursor: "pointer", fontFamily: "system-ui", transition: "all 0.15s",
            background: useVolatility ? "rgba(245,158,11,0.15)" : "#0f2035",
            color: useVolatility ? "#005EB8" : "#2a4a6a",
            border: `1px solid ${useVolatility ? "#005EB8" : "#1a3a5c"}`,
          }}>
            {useVolatility ? "⚡ Volatility" : "Real World Returns"}
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0,
        marginBottom: "1.2rem",
        borderTop: "1px solid #1a3a5c", borderBottom: "1px solid #1a3a5c",
      }}>
        <StatCell
          label="Current Quarterly"
          value={`$${quarterlyIncome.toLocaleString()}/qtr`}
          sub={`${formatCurrency(totalIncome)}/yr`}
        />
        <StatCell
          label="Y10 Quarterly"
          value={`$${projY10Quarterly.toLocaleString()}/qtr`}
          sub={`${formatCurrency(projY10Quarterly * 4)}/yr`}
        />
        <StatCell
          label="Total Income"
          value={formatCurrency(totalIncomeOver10Y)}
          sub="over 10 years"
          last
        />
      </div>

      {/* ============================================ */}
      {/* MAIN CHART — Portfolio Value (top section)   */}
      {/* ============================================ */}
      <div style={{ background: "#071020", border: "1px solid #0a1e30", padding: "0.5rem 0 0" }}>
        {/* Portfolio Value label */}
        <div style={{
          fontSize: "0.5rem", color: "#1a4060", letterSpacing: "0.15em",
          textTransform: "uppercase", padding: "0 0.8rem 0.3rem",
          fontFamily: "system-ui",
        }}>
          Portfolio Value
        </div>

        <svg width={svgW} height={mainH} style={{ display: "block" }}>
          <defs>
            <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = mainPadTop + mainChartH * (1 - pct);
            return (
              <g key={pct}>
                <line x1={padL} y1={y} x2={svgW - padR} y2={y}
                  stroke="#081828" strokeWidth={0.5} />
                <text x={padL - 6} y={y + 3} textAnchor="end"
                  fontSize="9" fill="#1a4060" fontFamily="system-ui">
                  {formatCurrency(maxVal * pct)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {barData.map((bar, i) => {
            const x = padL + i * stepW + (stepW - barW) / 2;
            const barH = maxVal > 0 ? (bar.value / maxVal) * mainChartH : 0;
            const y = mainPadTop + mainChartH - barH;
            const isHov = activeHover === i;

            let fill;
            if (isHov) {
              fill = "#ffffff";
            } else if (activeHover != null) {
              fill = i <= activeHover
                ? (bar.isHistorical ? "#5a9ad0" : "#5a9ad0")
                : (bar.isHistorical ? "#1a3050" : "#1a3050");
            } else {
              fill = bar.isHistorical ? "#5a8ab8" : "#2a5a8a";
            }

            return (
              <g key={i}
                onMouseEnter={() => { setHovered(i); setDivHovered(null); }}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={x} y={y} width={barW} height={barH}
                  fill={fill}
                  filter={isHov ? "url(#neonGlow)" : undefined}
                  opacity={isHov ? 1 : (activeHover != null && i > activeHover) ? 0.6 : 0.85}
                />
              </g>
            );
          })}

          {/* NOW divider */}
          <line x1={nowX} y1={mainPadTop - 8} x2={nowX} y2={mainPadTop + mainChartH + 4}
            stroke="#5aaff8" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />

          {/* Hovered bar: dashed line above + value label */}
          {activeHover != null && barData[activeHover] && (() => {
            const bar = barData[activeHover];
            const barH = maxVal > 0 ? (bar.value / maxVal) * mainChartH : 0;
            const barY = mainPadTop + mainChartH - barH;
            const barX = padL + activeHover * stepW + stepW / 2;
            return (
              <g>
                <line x1={barX} y1={mainPadTop - 4} x2={barX} y2={barY}
                  stroke="#5aaff8" strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
                <text x={barX} y={barY - 8}
                  textAnchor="middle" fontSize={11} fontWeight={800}
                  fill="#ffffff" fontFamily="system-ui">
                  {formatCurrency(bar.value)}
                </text>
              </g>
            );
          })()}
        </svg>

        {/* ============================================ */}
        {/* SHARED X-AXIS LABELS (between the two charts)*/}
        {/* ============================================ */}
        <svg width={svgW} height={20} style={{ display: "block" }}>
          {barData.map((bar, i) => {
            if (!bar.shortLabel) return null;
            const x = padL + i * stepW + stepW / 2;
            const isHov = activeHover === i;
            return (
              <text key={i}
                x={x} y={14}
                textAnchor="middle" fontSize={barCount > 60 ? 6 : 7}
                fill={isHov ? "#5aaff8" : bar.isCurrent ? "#5aaff8" : "#1a4060"}
                fontWeight={isHov || bar.isCurrent ? 700 : 400}
                fontFamily="system-ui"
              >
                {bar.shortLabel}
              </text>
            );
          })}
        </svg>

        {/* ============================================ */}
        {/* DIVIDEND INCOME CHART (bottom section)       */}
        {/* ============================================ */}
        <div style={{
          fontSize: "0.5rem", color: "#1a4060", letterSpacing: "0.15em",
          textTransform: "uppercase", padding: "0.3rem 0.8rem 0.2rem",
          fontFamily: "system-ui", borderTop: "1px solid #0a1e30",
        }}>
          Dividend Income
        </div>

        <svg width={svgW} height={divH} style={{ display: "block" }}>
          {/* Grid lines for dividend chart */}
          {[0, 0.5, 1].map(pct => {
            const y = divPadTop + divChartH * (1 - pct);
            return (
              <g key={pct}>
                <line x1={padL} y1={y} x2={svgW - padR} y2={y}
                  stroke="#081828" strokeWidth={0.5} />
                <text x={padL - 6} y={y + 3} textAnchor="end"
                  fontSize="8" fill="#1a4060" fontFamily="system-ui">
                  ${Math.round(maxDiv * pct).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Dividend bars — aligned with main chart */}
          {divBars.map((bar, i) => {
            const x = padL + i * stepW + (stepW - barW) / 2;
            const barH = maxDiv > 0 ? (bar.value / maxDiv) * divChartH : 0;
            const y = divPadTop + divChartH - barH;
            const isHov = activeHover === i;

            let fill;
            if (isHov) {
              fill = "#ffffff";
            } else if (activeHover != null) {
              fill = i <= activeHover ? "#2a9a5a" : "#0f3020";
            } else {
              fill = bar.isHistorical ? "#1a7a3a" : "#145a2a";
            }

            return (
              <g key={i}
                onMouseEnter={() => { setDivHovered(i); setHovered(null); }}
                onMouseLeave={() => setDivHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={x} y={y} width={barW} height={barH}
                  fill={fill}
                  filter={isHov ? "url(#neonGlow)" : undefined}
                  opacity={isHov ? 1 : (activeHover != null && i > activeHover) ? 0.6 : 0.85}
                />
              </g>
            );
          })}

          {/* NOW divider continues through dividend chart */}
          <line x1={nowX} y1={0} x2={nowX} y2={divPadTop + divChartH + 4}
            stroke="#5aaff8" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />

          {/* Hovered dividend bar: value label */}
          {activeHover != null && divBars[activeHover] && (() => {
            const bar = divBars[activeHover];
            const barH = maxDiv > 0 ? (bar.value / maxDiv) * divChartH : 0;
            const barY = divPadTop + divChartH - barH;
            const barX = padL + activeHover * stepW + stepW / 2;
            return (
              <g>
                <line x1={barX} y1={0} x2={barX} y2={barY}
                  stroke="#2a9a5a" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                <text x={barX} y={barY - 6}
                  textAnchor="middle" fontSize={10} fontWeight={700}
                  fill="#2a9a5a" fontFamily="system-ui">
                  ${bar.value.toLocaleString()}
                </text>
              </g>
            );
          })()}

          {/* X-axis year labels (bottom of dividend chart) */}
          {barData.map((bar, i) => {
            if (!bar.shortLabel) return null;
            const x = padL + i * stepW + stepW / 2;
            return (
              <text key={i}
                x={x} y={divH - 6}
                textAnchor="middle" fontSize={barCount > 60 ? 6 : 7}
                fill={bar.isCurrent ? "#5aaff8" : "#1a4060"}
                fontWeight={bar.isCurrent ? 700 : 400}
                fontFamily="system-ui"
              >
                {bar.shortLabel}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Hover info strip */}
      {activeHover != null && barData[activeHover] && (
        <div style={{
          display: "flex", justifyContent: "center", gap: 24,
          padding: "0.5rem 0", fontSize: "0.7rem", fontFamily: "system-ui",
        }}>
          <span style={{ color: "#5a8ab8" }}>
            {barData[activeHover].label}
          </span>
          <span style={{ color: "#c8dff0" }}>
            Value: <strong>{formatCurrency(barData[activeHover].value)}</strong>
          </span>
          {divBars[activeHover] && (
            <span style={{ color: "#2a9a5a" }}>
              Income: <strong>${divBars[activeHover].value.toLocaleString()}</strong>
            </span>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{
        display: "flex", gap: 16, alignItems: "center",
        padding: "0.4rem 0 0", justifyContent: "center",
      }}>
        <LegendItem color="#5a8ab8" label="Historical Value" />
        <LegendItem color="#2a5a8a" label="Projected Value" />
        <LegendItem color="#1a7a3a" label="Historical Income" />
        <LegendItem color="#145a2a" label="Projected Income" />
        <LegendItem color="#ffffff" label="Selected" glow />
      </div>
    </div>
  );
}

function StatCell({ label, value, sub, last }) {
  return (
    <div style={{
      padding: "1.2rem 1.5rem",
      borderRight: last ? "none" : "1px solid #1a3a5c",
    }}>
      <div style={{
        fontSize: "0.56rem", color: "#1e4060", textTransform: "uppercase",
        letterSpacing: "0.2em", marginBottom: "0.5rem",
        fontFamily: "system-ui",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "1.4rem", fontWeight: 700, color: "#5a8ab8", lineHeight: 1,
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: "0.7rem", color: "#1a3a58", marginTop: "0.35rem", fontStyle: "italic",
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, glow }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{
        width: 12, height: 8, background: color,
        boxShadow: glow ? "0 0 6px rgba(255,255,255,0.5)" : "none",
      }} />
      <span style={{ fontSize: "0.65rem", color: "#2a4a6a", fontFamily: "system-ui" }}>{label}</span>
    </div>
  );
}
