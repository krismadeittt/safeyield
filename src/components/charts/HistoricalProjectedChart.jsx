import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatCurrency } from '../../utils/format';
import { fetchBatchHistory, calcHistoricalPortfolioValues } from '../../api/history';
import MultiLineChart from './MultiLineChart';
import PortfolioBalanceMonthly from './PortfolioBalanceMonthly';

const HIST_YEARS = 5;
const HORIZONS = [1, 5, 10, 15, 25, 30, 40, 50];

export default function HistoricalProjectedChart({
  portfolioValue, avgYield, growth, horizon, setHorizon,
  useVolatility, setUseVolatility, chartMode, setChartMode,
  extraContrib, noDripVals, dripVals, contribVals, totalIncome,
  lineData, lineKeys, lineColors, monthlyData, holdings,
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [hovered, setHovered] = useState(null);
  const [historyMap, setHistoryMap] = useState({});
  const [histLoading, setHistLoading] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Fetch real history data for portfolio holdings
  useEffect(() => {
    if (!holdings?.length) return;
    const tickers = holdings.map(h => h.ticker);
    setHistLoading(true);
    fetchBatchHistory(tickers)
      .then(map => setHistoryMap(map))
      .finally(() => setHistLoading(false));
  }, [holdings]);

  const currentYear = new Date().getFullYear();
  const projYears = Math.min(horizon, 10);

  // Use real historical data if available, otherwise fall back to calculated
  const realHistData = useMemo(() => {
    if (Object.keys(historyMap).length === 0) return null;
    return calcHistoricalPortfolioValues(historyMap, holdings, portfolioValue);
  }, [historyMap, holdings, portfolioValue]);

  // Build chart data: historical + projected
  const data = useMemo(() => {
    const yieldRate = (avgYield || 2.5) / 100;
    const growthRate = (growth || 5) / 100;
    const annualReturn = 0.08;
    const bars = [];

    if (realHistData && realHistData.length > 1) {
      // Use REAL historical data from KV
      realHistData.forEach((entry, i) => {
        bars.push({
          year: entry.year,
          label: String(entry.year),
          value: entry.value,
          noDripValue: entry.noDripValue,
          isHistorical: true,
          isCurrent: entry.year === currentYear,
        });
      });
    } else {
      // Fallback: backward calculation
      const histValues = [portfolioValue];
      let backVal = portfolioValue;
      for (let i = 1; i <= HIST_YEARS; i++) {
        const pastYield = yieldRate * Math.pow(1 + growthRate, -i);
        const totalGrowth = 1 + annualReturn + pastYield;
        backVal = backVal / totalGrowth;
        histValues.unshift(Math.round(backVal));
      }
      const histNoDrip = [histValues[0]];
      let noDripVal = histValues[0];
      for (let i = 1; i <= HIST_YEARS; i++) {
        noDripVal = noDripVal * (1 + annualReturn);
        histNoDrip.push(Math.round(noDripVal));
      }
      for (let i = 0; i <= HIST_YEARS; i++) {
        bars.push({
          year: currentYear - HIST_YEARS + i,
          label: String(currentYear - HIST_YEARS + i),
          value: histValues[i],
          noDripValue: histNoDrip[i],
          isHistorical: true,
          isCurrent: i === HIST_YEARS,
        });
      }
    }

    // Forward projections
    let projDrip = portfolioValue;
    let projNoDrip = portfolioValue;
    let currentYieldRate = yieldRate;
    for (let i = 1; i <= projYears; i++) {
      const divIncome = projDrip * currentYieldRate;
      projDrip = projDrip * (1 + annualReturn) + divIncome;
      currentYieldRate *= (1 + growthRate);
      projNoDrip = projNoDrip * (1 + annualReturn);
      bars.push({
        year: currentYear + i,
        label: String(currentYear + i),
        value: Math.round(projDrip),
        noDripValue: Math.round(projNoDrip),
        isHistorical: false,
        isCurrent: false,
      });
    }

    return bars;
  }, [portfolioValue, avgYield, growth, projYears, currentYear, realHistData]);

  // Stats
  const startingValue = data[0]?.value || 0;
  const currentEntry = data.find(d => d.isCurrent);
  const currentNoDrip = currentEntry?.noDripValue || portfolioValue;
  const dripAdvantage = portfolioValue - currentNoDrip;
  const projectedFinal = data[data.length - 1]?.value || 0;
  const pctGain = startingValue > 0 ? ((portfolioValue - startingValue) / startingValue * 100) : 0;

  // Key DRIP projection stats
  const finalNoDrip = noDripVals[noDripVals.length - 1] || 0;
  const finalDrip = (contribVals || dripVals)[horizon] || 0;
  const projDripAdv = finalDrip - finalNoDrip;

  // Chart dimensions
  const H = 260;
  const padL = 60;
  const padR = 20;
  const padTop = 30;
  const padBot = 36;
  const chartW = width - padL - padR;
  const chartH = H - padTop - padBot;
  const barCount = data.length;
  const stepW = chartW / barCount;
  const barW = Math.max(6, stepW * 0.6);
  const maxVal = Math.max(...data.map(d => d.value), ...data.map(d => d.noDripValue), 1);

  const hovData = hovered != null ? data[hovered] : null;
  let tipX = 0, flipLeft = false;
  if (hovData) {
    tipX = padL + hovered * stepW + stepW / 2;
    flipLeft = tipX > width - 190;
  }

  // Find the NOW divider position (last historical bar)
  const nowIdx = data.findIndex(d => d.isCurrent);
  const nowX = nowIdx >= 0 ? padL + nowIdx * stepW + stepW : 0;

  return (
    <div ref={containerRef} style={{
      background: "#0a1628", border: "1px solid #1a3a5c", padding: "1.5rem",
    }}>
      {/* Title row */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "1rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 800, fontSize: "0.95rem", fontFamily: "system-ui", color: "#c8dff0" }}>
            Historical & Projected Income
          </span>
          <span style={{
            background: "#071020", color: "#005EB8", padding: "0.3rem 0.8rem",
            fontSize: "0.78rem", fontWeight: 700, fontFamily: "system-ui",
          }}>
            {formatCurrency(totalIncome)}/yr
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
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} style={{
              padding: "0.28rem 0.6rem", fontSize: "0.75rem", fontWeight: 700,
              cursor: "pointer", fontFamily: "system-ui", transition: "all 0.15s",
              background: horizon === h ? "#071020" : "#0f2035",
              color: horizon === h ? "#005EB8" : "#2a4a6a",
              border: `1px solid ${horizon === h ? "#005EB8" : "#1a3a5c"}`,
            }}>
              {h}Y
            </button>
          ))}
          <div style={{ width: 1, height: 20, background: "#1a3a5c", margin: "0 4px" }} />
          <button onClick={() => setUseVolatility(v => !v)} style={{
            padding: "0.28rem 0.9rem", fontSize: "0.75rem", fontWeight: 700,
            cursor: "pointer", fontFamily: "system-ui", transition: "all 0.15s",
            background: useVolatility ? "rgba(245,158,11,0.15)" : "#0f2035",
            color: useVolatility ? "#005EB8" : "#2a4a6a",
            border: `1px solid ${useVolatility ? "#005EB8" : "#1a3a5c"}`,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {useVolatility ? "⚡ Volatility" : "Real World Returns"}
          </button>
        </div>
      </div>

      {/* Stats cards row */}
      <div style={{
        display: "grid", gridTemplateColumns: contribVals ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
        gap: "0.7rem", marginBottom: "1.2rem",
      }}>
        <MiniStat
          label={`Starting (${currentYear - HIST_YEARS})`}
          value={formatCurrency(startingValue)}
          valueColor="#2a4a6a"
        />
        <MiniStat
          label="Current (DRIP)"
          value={formatCurrency(portfolioValue)}
          valueColor="#00cc66"
          sub={pctGain > 0 ? `+${pctGain.toFixed(1)}%` : ""}
          borderColor="rgba(0,94,184,0.2)"
        />
        <MiniStat
          label="DRIP Advantage"
          value={`+${formatCurrency(Math.max(0, dripAdvantage))}`}
          valueColor="#005EB8"
          borderColor="rgba(0,94,184,0.2)"
        />
        <MiniStat
          label={`Projected ${projYears}Y`}
          value={formatCurrency(projectedFinal)}
          valueColor="#5aaff8"
        />
        {contribVals && (
          <MiniStat
            label={`+Contrib ${horizon}Y`}
            value={formatCurrency(contribVals[horizon])}
            valueColor="#1a5a9e"
            borderColor="rgba(0,94,184,0.3)"
          />
        )}
      </div>

      {/* Chart type toggle + Legend */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "0.8rem",
      }}>
        {/* LINE / MONTHLY BAR toggle */}
        <div style={{ display: "flex", gap: 0, border: "1px solid #0a1e30" }}>
          {[
            { key: "line", label: "LINE" },
            { key: "monthly", label: "MONTHLY BAR" },
          ].map(m => (
            <button key={m.key} onClick={() => setChartMode(m.key)} style={{
              padding: "0.28rem 0.9rem", border: "none",
              fontSize: "0.7rem", fontWeight: 600, cursor: "pointer",
              letterSpacing: "0.1em", textTransform: "uppercase",
              background: chartMode === m.key ? "#005EB8" : "transparent",
              color: chartMode === m.key ? "#ffffff" : "#1e4060",
              transition: "all 0.15s",
            }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <LegendItem color="#1a7a3a" label="Hist DRIP" />
          <LegendItem color="#0f4a22" label="Hist" />
          <LegendItem color="#005EB8" label="Proj DRIP" />
          <LegendItem color="#1a3a5c" label="Proj" />
        </div>
      </div>

      {/* Chart */}
      {chartMode === "line" ? (
        <div style={{
          background: "#071525", border: "1px solid #0a1e30", padding: "1rem 0 0.5rem 0",
        }}>
          <MultiLineChart
            pts={lineData}
            keys={lineKeys}
            colors={lineColors}
            dashes={["6,3"]}
            fmt={formatCurrency}
            H={220}
          />
          {/* Line legend below chart */}
          <div style={{
            display: "flex", gap: "1.5rem", padding: "0.5rem 1rem 0.3rem",
            borderTop: "1px solid #081828", marginTop: "0.3rem",
          }}>
            <LineLegend color="#1a3a5c" dashed label="No DRIP" />
            <LineLegend color="#005EB8" label="With DRIP" />
            {contribVals && <LineLegend color="#1a5a9e" label="+Contrib" />}
          </div>
        </div>
      ) : (
        <PortfolioBalanceMonthly
          dripVals={dripVals}
          contribVals={contribVals}
          monthlyData={monthlyData}
          totalIncome={totalIncome}
          avgYield={avgYield}
          horizon={horizon}
          extraContrib={extraContrib}
        />
      )}

      {/* Historical bar chart (always shown below the main chart) */}
      <div style={{ marginTop: "1.2rem" }}>
        <svg width={width - 48} height={H} style={{ display: "block" }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = padTop + chartH * (1 - pct);
            return (
              <g key={pct}>
                <line x1={padL} y1={y} x2={width - 48 - padR} y2={y}
                  stroke="#081828" strokeWidth={0.5} />
                <text x={padL - 6} y={y + 3} textAnchor="end"
                  fontSize="9" fill="#1a4060" fontFamily="system-ui">
                  {formatCurrency(maxVal * pct)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((bar, i) => {
            const x = padL + i * stepW + (stepW - barW) / 2;
            const isHov = hovered === i;
            const noDripH = maxVal > 0 ? (bar.noDripValue / maxVal) * chartH : 0;
            const dripH = maxVal > 0 ? (bar.value / maxVal) * chartH : 0;

            const noDripColor = bar.isHistorical ? "#0f4a22" : "#1a3a5c";
            const dripColor = bar.isHistorical
              ? (isHov ? "#22aa55" : "#1a7a3a")
              : (isHov ? "#1a8eff" : "#005EB8");
            const noDripHovColor = bar.isHistorical ? "#1a5a2a" : "#2a4a70";

            return (
              <g key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <rect x={x} y={padTop + chartH - noDripH}
                  width={barW} height={noDripH}
                  fill={isHov ? noDripHovColor : noDripColor}
                  opacity={isHov ? 1 : 0.85} />
                {dripH > noDripH && (
                  <rect x={x} y={padTop + chartH - dripH}
                    width={barW} height={dripH - noDripH}
                    fill={dripColor}
                    opacity={isHov ? 1 : 0.8} />
                )}
                <text
                  x={padL + i * stepW + stepW / 2}
                  y={H - padBot + 14}
                  textAnchor="middle" fontSize={barCount > 12 ? 7 : 8}
                  fill={bar.isCurrent ? "#5aaff8" : "#1a4060"}
                  fontWeight={bar.isCurrent ? 700 : 400}
                  fontFamily="system-ui"
                >
                  {bar.label}
                </text>
              </g>
            );
          })}

          {/* NOW divider */}
          <line x1={nowX} y1={padTop - 8} x2={nowX} y2={padTop + chartH + 4}
            stroke="#005EB8" strokeWidth={2} strokeDasharray="6,3" opacity={0.8} />
          <text x={nowX} y={padTop - 12} textAnchor="middle"
            fontSize={10} fill="#005EB8" fontWeight={700} fontFamily="system-ui">
            NOW
          </text>

          {/* SVG tooltip */}
          {hovData && (
            <g>
              <rect
                x={flipLeft ? tipX - 184 : tipX + 10}
                y={padTop}
                width={174} height={76}
                fill="#071525" stroke="rgba(0,94,184,0.4)" strokeWidth={1} />
              <text x={flipLeft ? tipX - 176 : tipX + 18} y={padTop + 14}
                fontSize={10} fontWeight={700} fill="#c8dff0" fontFamily="system-ui">
                {hovData.label} {hovData.isCurrent ? "(NOW)" : hovData.isHistorical ? "(Hist)" : "(Proj)"}
              </text>
              <text x={flipLeft ? tipX - 176 : tipX + 18} y={padTop + 30}
                fontSize={9.5} fill={hovData.isHistorical ? "#1a7a3a" : "#005EB8"} fontFamily="system-ui">
                With DRIP: {formatCurrency(hovData.value)}
              </text>
              <text x={flipLeft ? tipX - 176 : tipX + 18} y={padTop + 46}
                fontSize={9.5} fill="#5a8ab0" fontFamily="system-ui">
                No DRIP: {formatCurrency(hovData.noDripValue)}
              </text>
              <text x={flipLeft ? tipX - 176 : tipX + 18} y={padTop + 62}
                fontSize={9.5} fontWeight={700}
                fill={hovData.isHistorical ? "#1a7a3a" : "#005EB8"} fontFamily="system-ui">
                Advantage: +{formatCurrency(Math.max(0, hovData.value - hovData.noDripValue))}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

function MiniStat({ label, value, valueColor, sub, borderColor }) {
  return (
    <div style={{
      background: "#0f2035", padding: "0.85rem 1rem",
      border: `1px solid ${borderColor || "#1a3a5c"}`,
    }}>
      <div style={{
        fontSize: "0.6rem", color: "#2a4a6a", textTransform: "uppercase",
        letterSpacing: "0.07em", fontFamily: "system-ui", marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "1.05rem", fontWeight: 800, color: valueColor || "#c8dff0",
        fontFamily: "system-ui",
      }}>
        {value}
        {sub && (
          <span style={{ fontSize: "0.65rem", marginLeft: 6, color: "#00cc66" }}>
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 12, height: 8, background: color }} />
      <span style={{ fontSize: "0.65rem", color: "#2a4a6a", fontFamily: "system-ui" }}>{label}</span>
    </div>
  );
}

function LineLegend({ color, dashed, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: "0.7rem", color: "#5a8ab0", fontFamily: "'EB Garamond', Georgia, serif" }}>
      <svg width="22" height="8">
        <line x1="0" y1="4" x2="22" y2="4"
          stroke={color} strokeWidth={2}
          strokeDasharray={dashed ? "6,3" : "none"} />
      </svg>
      {label}
    </div>
  );
}
