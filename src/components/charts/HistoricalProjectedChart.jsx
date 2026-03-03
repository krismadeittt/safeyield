import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatCurrency } from '../../utils/format';

/**
 * Historical & Projected Income chart.
 *
 * Shows green historical bars (past years with backward DRIP calculation)
 * merging into blue projected bars (future), with a dashed "NOW" divider line.
 *
 * The key insight: when a user selects $500k starting balance, the CURRENT year
 * shows exactly $500k. We calculate backward to show what the portfolio would
 * have looked like historically (un-growing the DRIP reinvestment).
 */
const HIST_YEARS = 5; // years of history to show

export default function HistoricalProjectedChart({
  portfolioValue, avgYield, growth, horizon, holdings,
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const currentYear = new Date().getFullYear();
  const projYears = Math.min(horizon, 10);

  // Calculate backward historical values (reverse DRIP)
  // Current year = portfolioValue (exact)
  // Each year back: value / (1 + yield + growth adjustments)
  const data = useMemo(() => {
    const yieldRate = (avgYield || 2.5) / 100;
    const growthRate = (growth || 5) / 100;
    const annualReturn = 0.08; // assumed 8% market return

    const bars = [];

    // Historical bars (going backward from current)
    const histValues = [portfolioValue];
    let backVal = portfolioValue;
    for (let i = 1; i <= HIST_YEARS; i++) {
      // Reverse the compound growth: value_prev = value_current / (1 + totalReturn)
      const pastYield = yieldRate * Math.pow(1 + growthRate, -i);
      const totalGrowth = 1 + annualReturn + pastYield;
      backVal = backVal / totalGrowth;
      histValues.unshift(Math.round(backVal));
    }

    // Historical bars — with and without DRIP
    const histNoDrip = [histValues[0]];
    let noDripVal = histValues[0];
    for (let i = 1; i <= HIST_YEARS; i++) {
      noDripVal = noDripVal * (1 + annualReturn);
      histNoDrip.push(Math.round(noDripVal));
    }

    for (let i = 0; i <= HIST_YEARS; i++) {
      const year = currentYear - HIST_YEARS + i;
      bars.push({
        year,
        label: String(year),
        value: histValues[i],
        noDripValue: histNoDrip[i],
        isHistorical: true,
        isCurrent: i === HIST_YEARS,
      });
    }

    // Future projected bars
    let projDrip = portfolioValue;
    let projNoDrip = portfolioValue;
    let currentYieldRate = yieldRate;
    for (let i = 1; i <= projYears; i++) {
      // DRIP projection
      const divIncome = projDrip * currentYieldRate;
      projDrip = projDrip * (1 + annualReturn) + divIncome;
      currentYieldRate *= (1 + growthRate);

      // No-DRIP projection
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
  }, [portfolioValue, avgYield, growth, projYears, currentYear]);

  // Stats
  const startingValue = data[0]?.value || 0;
  const currentValue = portfolioValue;
  const currentNoDrip = data[HIST_YEARS]?.noDripValue || portfolioValue;
  const dripAdvantage = currentValue - currentNoDrip;
  const projectedFinal = data[data.length - 1]?.value || 0;
  const pctGain = startingValue > 0 ? ((currentValue - startingValue) / startingValue * 100) : 0;

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

  // Hovered data
  const hovData = hovered != null ? data[hovered] : null;
  let tipX = 0, flipLeft = false;
  if (hovData) {
    tipX = padL + hovered * stepW + stepW / 2;
    flipLeft = tipX > width - 190;
  }

  // NOW line position (between last historical and first projected bar)
  const nowIdx = HIST_YEARS;
  const nowX = padL + nowIdx * stepW + stepW;

  return (
    <div ref={containerRef} style={{
      background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: "0.8rem",
      }}>
        <div style={{
          fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}>
          Historical & Projected Income
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, background: "#00cc66" }} />
            <span style={{ fontSize: "0.55rem", color: "#3a5a78" }}>Hist DRIP</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, background: "#1a3a2a" }} />
            <span style={{ fontSize: "0.55rem", color: "#3a5a78" }}>Hist</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, background: "#005EB8" }} />
            <span style={{ fontSize: "0.55rem", color: "#3a5a78" }}>Proj DRIP</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 8, height: 8, background: "#1a3050" }} />
            <span style={{ fontSize: "0.55rem", color: "#3a5a78" }}>Proj</span>
          </div>
        </div>
      </div>

      {/* Stats cards row */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8,
        marginBottom: "1rem",
      }}>
        <MiniStat
          label={`STARTING (${currentYear - HIST_YEARS})`}
          value={formatCurrency(startingValue)}
        />
        <MiniStat
          label="CURRENT (DRIP)"
          value={formatCurrency(currentValue)}
          accent="#00cc66"
          sub={pctGain > 0 ? `+${pctGain.toFixed(1)}%` : ""}
        />
        <MiniStat
          label="DRIP ADVANTAGE"
          value={`+${formatCurrency(Math.max(0, dripAdvantage))}`}
          accent="#005EB8"
        />
        <MiniStat
          label={`PROJECTED ${projYears}Y`}
          value={formatCurrency(projectedFinal)}
          accent="#5aaff8"
        />
      </div>

      {/* SVG Chart */}
      <svg width={width} height={H} style={{ display: "block" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padTop + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#0a1e30" strokeWidth={0.5} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="8" fill="#1a4060">
                {formatCurrency(maxVal * pct)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((bar, i) => {
          const x = padL + i * stepW + (stepW - barW) / 2;
          const isHov = hovered === i;

          // No-DRIP bar (background)
          const noDripH = maxVal > 0 ? (bar.noDripValue / maxVal) * chartH : 0;
          // DRIP bar (full height)
          const dripH = maxVal > 0 ? (bar.value / maxVal) * chartH : 0;

          const noDripColor = bar.isHistorical ? "#1a3a2a" : "#1a3050";
          const dripColor = bar.isHistorical
            ? (isHov ? "#33dd88" : "#00cc66")
            : (isHov ? "#1a8eff" : "#005EB8");
          const noDripHovColor = bar.isHistorical ? "#2a5a3a" : "#2a4a70";

          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              {/* No-DRIP portion */}
              <rect
                x={x} y={padTop + chartH - noDripH}
                width={barW} height={noDripH}
                fill={isHov ? noDripHovColor : noDripColor}
                opacity={isHov ? 1 : 0.85}
              />
              {/* DRIP advantage portion on top */}
              {dripH > noDripH && (
                <rect
                  x={x} y={padTop + chartH - dripH}
                  width={barW} height={dripH - noDripH}
                  fill={dripColor}
                  opacity={isHov ? 1 : 0.8}
                />
              )}
              {/* Year label */}
              <text
                x={padL + i * stepW + stepW / 2}
                y={H - padBot + 14}
                textAnchor="middle" fontSize={barCount > 12 ? 7 : 8}
                fill={isHov ? "#5a9ad0" : bar.isCurrent ? "#5aaff8" : "#1e3a58"}
                fontWeight={bar.isCurrent ? 700 : 400}
                fontFamily="system-ui"
              >
                {bar.label}
              </text>
            </g>
          );
        })}

        {/* NOW divider line */}
        <line
          x1={nowX} y1={padTop - 8}
          x2={nowX} y2={padTop + chartH + 4}
          stroke="#5aaff8" strokeWidth={1.5}
          strokeDasharray="4,3"
          opacity={0.7}
        />
        <text
          x={nowX} y={padTop - 12}
          textAnchor="middle" fontSize={9}
          fill="#5aaff8" fontWeight={700}
          fontFamily="system-ui"
        >
          NOW
        </text>

        {/* SVG tooltip */}
        {hovData && (
          <g>
            <rect
              x={flipLeft ? tipX - 174 : tipX + 10}
              y={padTop}
              width={164} height={76}
              fill="#071020" stroke="#1a3a5c" strokeWidth={1}
            />
            <text x={flipLeft ? tipX - 166 : tipX + 18} y={padTop + 14}
              fontSize={10} fontWeight={700} fill="#c8dff0" fontFamily="system-ui">
              {hovData.label} {hovData.isCurrent ? "(NOW)" : hovData.isHistorical ? "(Hist)" : "(Proj)"}
            </text>
            <text x={flipLeft ? tipX - 166 : tipX + 18} y={padTop + 30}
              fontSize={9.5} fill={hovData.isHistorical ? "#00cc66" : "#1a8eff"} fontFamily="system-ui">
              With DRIP: {formatCurrency(hovData.value)}
            </text>
            <text x={flipLeft ? tipX - 166 : tipX + 18} y={padTop + 46}
              fontSize={9.5} fill="#5a8ab0" fontFamily="system-ui">
              No DRIP: {formatCurrency(hovData.noDripValue)}
            </text>
            <text x={flipLeft ? tipX - 166 : tipX + 18} y={padTop + 62}
              fontSize={9.5} fontWeight={700} fill={hovData.isHistorical ? "#00cc66" : "#005EB8"} fontFamily="system-ui">
              Advantage: +{formatCurrency(Math.max(0, hovData.value - hovData.noDripValue))}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

function MiniStat({ label, value, accent, sub }) {
  return (
    <div style={{
      background: "#0a1628", border: "1px solid #0e1e30", padding: "0.6rem 0.8rem",
    }}>
      <div style={{
        fontSize: "0.45rem", color: "#1a4060", letterSpacing: "0.15em",
        textTransform: "uppercase", marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "1rem", fontWeight: 700, color: accent || "#c8dff0",
        fontFamily: "'Playfair Display', Georgia, serif",
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
