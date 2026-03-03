import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatCurrency } from '../../utils/format';
import { fetchBatchHistory, calcHistoricalPortfolioValues } from '../../api/history';

const HIST_YEARS = 10;
const HORIZONS = [1, 5, 10, 15, 25, 30, 40, 50];
const CONTRIBUTIONS = [0, 1000, 5000, 10000, 20000, 25000, 50000];

function shortMoney(val) {
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${Math.round(val / 1e3)}k`;
  return `$${Math.round(val)}`;
}

export default function HistoricalProjectedChart({
  portfolioValue, avgYield, growth, horizon, setHorizon,
  useVolatility, setUseVolatility,
  extraContrib, setExtraContrib, customContrib, setCustomContrib,
  noDripVals, dripVals, contribVals, totalIncome,
  monthlyData, holdings,
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [hovered, setHovered] = useState(null);       // portfolio chart hover (independent)
  const [divHovered, setDivHovered] = useState(null);  // dividend chart hover (independent)
  const [historyMap, setHistoryMap] = useState({});
  const [histLoading, setHistLoading] = useState(false);
  const [granularity, setGranularity] = useState("quarterly");
  const [showDivReturn, setShowDivReturn] = useState(true); // show dividend contribution on historical bars

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
  const projYears = Math.min(horizon, 10);

  // realHistData returns [{ year, value (with divs), noDripValue (price only) }, ...]
  const realHistData = useMemo(() => {
    if (Object.keys(historyMap).length === 0) return null;
    return calcHistoricalPortfolioValues(historyMap, holdings, portfolioValue);
  }, [historyMap, holdings, portfolioValue]);

  // Key projection stats
  const finalNoDrip = noDripVals?.[horizon] || noDripVals?.[noDripVals.length - 1] || 0;
  const finalDrip = contribVals ? (contribVals[horizon] || contribVals[contribVals.length - 1] || 0)
    : (dripVals?.[horizon] || dripVals?.[dripVals.length - 1] || 0);
  const dripAdvantage = finalDrip - finalNoDrip;
  const incomeAtHorizon = Math.round(totalIncome * Math.pow(1 + (growth || 5) / 100, horizon));
  const noDripIncome = Math.round(totalIncome * Math.pow(1 + (growth || 5) / 100, horizon) * 0.6);

  // Build bar data: 10yr back + projected forward
  // Historical: stacked priceOnly (bottom) + divReturn (top) when showDivReturn is ON
  // Projected: stacked noDrip (bottom) + dripBonus (top)
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

    // --- HISTORICAL ---
    let histYearlyValues;
    if (realHistData && realHistData.length > 1) {
      histYearlyValues = realHistData; // has { year, value, noDripValue }
    } else {
      let backVal = portfolioValue;
      const vals = [{ year: currentYear, value: portfolioValue, noDripValue: portfolioValue }];
      for (let i = 1; i <= HIST_YEARS; i++) {
        const pastYield = yieldRate * Math.pow(1 + growthRate, -i);
        const totalGrowth = 1 + annualReturn + pastYield;
        backVal = backVal / totalGrowth;
        vals.unshift({
          year: currentYear - i,
          value: Math.round(backVal),
          noDripValue: Math.round(backVal * 0.85), // estimate: price-only ~85% of total return
        });
      }
      histYearlyValues = vals;
    }

    // Interpolate yearly into quarterly/monthly
    for (let yi = 0; yi < histYearlyValues.length - 1; yi++) {
      const from = histYearlyValues[yi];
      const to = histYearlyValues[yi + 1];
      for (let p = 0; p < periodsPerYear; p++) {
        const t = p / periodsPerYear;
        const value = Math.round(from.value + (to.value - from.value) * t);
        const noDripValue = Math.round(
          (from.noDripValue || from.value) + ((to.noDripValue || to.value) - (from.noDripValue || from.value)) * t
        );
        const divContrib = Math.max(0, value - noDripValue);
        result.push({
          label: isQuarterly ? `${from.year} ${periodLabels[p]}` : `${periodLabels[p]} ${from.year}`,
          shortLabel: p === 0 ? String(from.year) : "",
          total: value,
          bottom: noDripValue,     // price-only portion
          top: divContrib,         // dividend contribution
          isHistorical: true,
          isCurrent: false,
          year: from.year,
          periodIndex: p,
          yearsFromNow: from.year - currentYear,
        });
      }
    }

    // "Now" bar
    result.push({
      label: "Now",
      shortLabel: "Now",
      total: portfolioValue,
      bottom: portfolioValue,
      top: 0,
      isHistorical: true,
      isCurrent: true,
      year: currentYear,
      periodIndex: 0,
      yearsFromNow: 0,
    });

    const nowBarIndex = result.length - 1;

    // --- PROJECTED: stacked No DRIP + DRIP Bonus ---
    for (let yr = 1; yr <= projYears; yr++) {
      const noDripVal = noDripVals?.[yr] || portfolioValue;
      const dripVal = contribVals ? (contribVals[yr] || portfolioValue) : (dripVals?.[yr] || portfolioValue);

      for (let p = 0; p < periodsPerYear; p++) {
        const prevNoDrip = noDripVals?.[yr - 1] || portfolioValue;
        const prevDrip = contribVals ? (contribVals[yr - 1] || portfolioValue) : (dripVals?.[yr - 1] || portfolioValue);
        const t = (p + 1) / periodsPerYear;
        const interpNoDrip = Math.round(prevNoDrip + (noDripVal - prevNoDrip) * t);
        const interpDrip = Math.round(prevDrip + (dripVal - prevDrip) * t);
        const interpBonus = Math.max(0, interpDrip - interpNoDrip);

        const label = isQuarterly
          ? `${currentYear + yr} ${periodLabels[p]}`
          : `${periodLabels[p]} ${currentYear + yr}`;
        result.push({
          label,
          shortLabel: p === 0 ? `Y${yr}` : "",
          total: interpDrip,
          bottom: interpNoDrip,    // No DRIP
          top: interpBonus,        // DRIP Bonus
          isHistorical: false,
          isCurrent: false,
          year: currentYear + yr,
          periodIndex: p,
          yearsFromNow: yr,
        });
      }
    }

    return { bars: result, nowBarIndex };
  }, [portfolioValue, avgYield, growth, projYears, currentYear, realHistData, granularity, noDripVals, dripVals, contribVals]);

  const { bars: barData, nowBarIndex } = bars;

  // Dividend income bars (separate data)
  const divBars = useMemo(() => {
    if (!monthlyData?.length) return [];
    const growthRate = (growth || 5) / 100;
    const isQuarterly = granularity === "quarterly";

    return barData.map(bar => {
      const yearsFromNow = bar.yearsFromNow || 0;
      const growthFactor = Math.pow(1 + growthRate, yearsFromNow);
      let divIncome;
      if (isQuarterly) {
        const qStart = (bar.periodIndex || 0) * 3;
        divIncome = 0;
        for (let m = qStart; m < qStart + 3 && m < 12; m++) {
          divIncome += (monthlyData[m] || 0);
        }
      } else {
        divIncome = monthlyData[bar.periodIndex || 0] || 0;
      }
      divIncome = Math.round(divIncome * growthFactor);
      return {
        label: bar.label,
        shortLabel: bar.shortLabel,
        value: Math.max(0, divIncome),
        isHistorical: bar.isHistorical,
        isCurrent: bar.isCurrent,
      };
    });
  }, [barData, monthlyData, growth, granularity]);

  // Shared chart layout dimensions
  const padL = 55;
  const padR = 10;
  const svgW = width - 48;
  const chartW = svgW - padL - padR;
  const barCount = barData.length;
  const stepW = chartW / barCount;
  const barW = Math.max(2, Math.min(stepW * 0.7, 20));
  const maxVal = Math.max(...barData.map(b => b.total), 1);

  // Main chart
  const mainH = 300;
  const mainPadTop = 40;
  const mainPadBot = 4;
  const mainChartH = mainH - mainPadTop - mainPadBot;

  // Dividend chart
  const divH = 120;
  const divPadTop = 4;
  const divPadBot = 24;
  const divChartH = divH - divPadTop - divPadBot;
  const maxDiv = divBars.length > 0 ? Math.max(...divBars.map(b => b.value), 1) : 1;

  const nowX = padL + nowBarIndex * stepW + stepW / 2;

  return (
    <div ref={containerRef} style={{
      background: "#0a1628", border: "1px solid #1a3a5c",
    }}>
      {/* ==================== HEADER ==================== */}
      <div style={{ padding: "1.5rem 1.5rem 0" }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
          marginBottom: "0.3rem",
        }}>
          <div>
            <div style={{
              fontWeight: 800, fontSize: "1.1rem", color: "#c8dff0",
              fontFamily: "'Playfair Display', Georgia, serif",
            }}>
              Historical & Projected Income
            </div>
            <div style={{
              fontSize: "0.72rem", color: "#2a4a6a", marginTop: 2,
              fontFamily: "Georgia, serif", fontStyle: "italic",
            }}>
              {horizon}-yr · {growth.toFixed(1)}% avg div growth · 7% base return
              {realHistData && " · real data"}
              {histLoading && " · loading..."}
            </div>
          </div>
          <div style={{
            padding: "6px 16px", border: "1px solid #1a3a5c",
            fontWeight: 700, fontSize: "1rem", color: "#5aaff8",
            fontFamily: "'Playfair Display', Georgia, serif",
          }}>
            {shortMoney(totalIncome)}/yr
          </div>
        </div>

        {/* Horizon selector */}
        <div style={{
          display: "flex", gap: 0, marginTop: "1rem", marginBottom: "0.6rem",
          flexWrap: "wrap",
        }}>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} style={{
              padding: "6px 14px", border: "1px solid #1a3a5c",
              cursor: "pointer", fontSize: "0.82rem", fontWeight: horizon === h ? 700 : 400,
              fontFamily: "'EB Garamond', Georgia, serif",
              background: horizon === h ? "#005EB8" : "transparent",
              color: horizon === h ? "#ffffff" : "#2a4a6a",
              marginRight: -1, transition: "all 0.15s",
            }}>
              {h}Y
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button onClick={() => setUseVolatility(v => !v)} style={{
            padding: "6px 16px", border: "1px solid #1a3a5c",
            cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
            fontFamily: "Georgia, serif",
            background: useVolatility ? "rgba(0,94,184,0.15)" : "transparent",
            color: useVolatility ? "#5aaff8" : "#2a4a6a",
            transition: "all 0.15s",
          }}>
            ~ Real World Returns
          </button>
        </div>

        {/* Contribution selector */}
        <div style={{
          display: "flex", gap: 0, alignItems: "center", marginBottom: "1rem",
          flexWrap: "wrap",
        }}>
          <span style={{
            fontSize: "0.72rem", color: "#2a4a6a", marginRight: 10,
            fontFamily: "Georgia, serif",
          }}>
            + Invest yearly:
          </span>
          {[{ label: "None", value: 0 }, ...CONTRIBUTIONS.filter(c => c > 0).map(c => ({
            label: `$${c >= 1000 ? (c/1000) + 'k' : c}`,
            value: c,
          }))].map(c => (
            <button key={c.value} onClick={() => { setExtraContrib(c.value); setCustomContrib(""); }} style={{
              padding: "5px 12px", border: "1px solid #1a3a5c",
              cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
              fontFamily: "'EB Garamond', Georgia, serif",
              background: extraContrib === c.value && !customContrib ? "#005EB8" : "transparent",
              color: extraContrib === c.value && !customContrib ? "#ffffff" : "#2a4a6a",
              marginRight: -1, transition: "all 0.15s",
            }}>
              {c.label}
            </button>
          ))}
          <input
            placeholder="Custom"
            value={customContrib}
            onChange={e => setCustomContrib(e.target.value.replace(/[^0-9]/g, ""))}
            style={{
              width: 70, padding: "5px 10px", fontSize: "0.78rem",
              background: "transparent", border: "1px solid #1a3a5c",
              color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif",
              outline: "none", marginLeft: -1,
            }}
          />
        </div>

        {/* 4 Stat Cards */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0,
          marginBottom: "1rem",
        }}>
          <StatCard label="TODAY" value={shortMoney(portfolioValue)} sub={`${avgYield.toFixed(1)}% avg yield`} />
          <StatCard label={`NO DRIP · ${horizon}Y`} value={shortMoney(finalNoDrip)} sub={`${shortMoney(noDripIncome)}/yr income`} color="#5a8ab8" />
          <StatCard label={`DRIP · ${horizon}Y`} value={shortMoney(finalDrip)} sub={`${shortMoney(incomeAtHorizon)}/yr income`} color="#005EB8" />
          <StatCard label="DRIP ADVANTAGE" value={`+${shortMoney(dripAdvantage)}`} sub="vs no reinvestment" color="#5aaff8" last />
        </div>

        {/* Controls row: granularity toggle + div return toggle + legend */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: "0.5rem", flexWrap: "wrap", gap: 8,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 0, border: "1px solid #1a3a5c" }}>
              {["quarterly", "monthly"].map(m => (
                <button key={m} onClick={() => setGranularity(m)} style={{
                  padding: "5px 14px", border: "none",
                  fontSize: "0.72rem", fontWeight: 600, cursor: "pointer",
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  fontFamily: "'EB Garamond', Georgia, serif",
                  background: granularity === m ? "#005EB8" : "transparent",
                  color: granularity === m ? "#ffffff" : "#2a4a6a",
                  transition: "all 0.15s",
                }}>
                  {m}
                </button>
              ))}
            </div>
            {/* Dividend return overlay toggle */}
            <button onClick={() => setShowDivReturn(v => !v)} style={{
              padding: "5px 12px", border: "1px solid #1a3a5c",
              cursor: "pointer", fontSize: "0.7rem", fontWeight: 600,
              fontFamily: "'EB Garamond', Georgia, serif",
              background: showDivReturn ? "rgba(26,122,58,0.15)" : "transparent",
              color: showDivReturn ? "#2a9a5a" : "#2a4a6a",
              transition: "all 0.15s",
            }}>
              {showDivReturn ? "Div Return ON" : "Div Return OFF"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <LegendItem color="#5a8ab8" label="Price Return" />
            {showDivReturn && <LegendItem color="#2a9a5a" label="Div Return" />}
            <LegendItem color="#1a3a5c" label="No DRIP" />
            <LegendItem color="#005EB8" label="DRIP Bonus" />
          </div>
        </div>
      </div>

      {/* ==================== PORTFOLIO VALUE CHART ==================== */}
      <div style={{ background: "#071020", borderTop: "1px solid #0a1e30", padding: "0.5rem 0 0" }}>
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
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#081828" strokeWidth={0.5} />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#1a4060" fontFamily="system-ui">
                  {shortMoney(maxVal * pct)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {barData.map((bar, i) => {
            const x = padL + i * stepW + (stepW - barW) / 2;
            const isHov = hovered === i;

            if (bar.isHistorical) {
              // Historical: show stacked (price bottom + div top) or single
              const showStack = showDivReturn && bar.top > 0;
              const totalH = maxVal > 0 ? (bar.total / maxVal) * mainChartH : 0;
              const bottomH = showStack ? (maxVal > 0 ? (bar.bottom / maxVal) * mainChartH : 0) : totalH;
              const topH = showStack ? totalH - bottomH : 0;

              let bottomFill, topFill;
              if (isHov) {
                bottomFill = "#c8dff0";
                topFill = "#ffffff";
              } else if (hovered != null) {
                bottomFill = i <= hovered ? "#5a9ad0" : "#1a3050";
                topFill = i <= hovered ? "#3aaa6a" : "#0f3020";
              } else {
                bottomFill = "#5a8ab8";
                topFill = "#2a9a5a";
              }

              return (
                <g key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Price return (bottom) */}
                  <rect x={x} y={mainPadTop + mainChartH - bottomH} width={barW} height={bottomH}
                    fill={bottomFill}
                    opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.5 : 0.85}
                  />
                  {/* Div return (top) — only if showDivReturn */}
                  {showStack && (
                    <rect x={x} y={mainPadTop + mainChartH - totalH} width={barW} height={topH}
                      fill={topFill}
                      filter={isHov ? "url(#neonGlow)" : undefined}
                      opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.5 : 0.9}
                    />
                  )}
                  {/* If not stacked, apply glow to the single bar */}
                  {!showStack && isHov && (
                    <rect x={x} y={mainPadTop + mainChartH - bottomH} width={barW} height={bottomH}
                      fill="transparent" filter="url(#neonGlow)" opacity={0.5}
                    />
                  )}
                </g>
              );
            }

            // Projected: stacked No DRIP (bottom) + DRIP Bonus (top)
            const totalH = maxVal > 0 ? (bar.total / maxVal) * mainChartH : 0;
            const bottomH = maxVal > 0 ? (bar.bottom / maxVal) * mainChartH : 0;
            const topH = totalH - bottomH;
            const yBase = mainPadTop + mainChartH - totalH;

            let bottomFill, topFill;
            if (isHov) {
              bottomFill = "#c8dff0";
              topFill = "#ffffff";
            } else if (hovered != null) {
              bottomFill = i <= hovered ? "#3a6a9a" : "#0f1e30";
              topFill = i <= hovered ? "#5a9ad0" : "#1a3050";
            } else {
              bottomFill = "#1a3a5c";
              topFill = "#005EB8";
            }

            return (
              <g key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <rect x={x} y={mainPadTop + mainChartH - bottomH} width={barW} height={bottomH}
                  fill={bottomFill}
                  opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.5 : 0.85}
                />
                <rect x={x} y={yBase} width={barW} height={topH}
                  fill={topFill}
                  filter={isHov ? "url(#neonGlow)" : undefined}
                  opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.5 : 0.9}
                />
              </g>
            );
          })}

          {/* NOW divider */}
          <line x1={nowX} y1={mainPadTop - 8} x2={nowX} y2={mainPadTop + mainChartH + 4}
            stroke="#5aaff8" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />

          {/* Hovered bar tooltip */}
          {hovered != null && barData[hovered] && (() => {
            const bar = barData[hovered];
            const totalH = maxVal > 0 ? (bar.total / maxVal) * mainChartH : 0;
            const barY = mainPadTop + mainChartH - totalH;
            const barX = padL + hovered * stepW + stepW / 2;

            return (
              <g>
                <line x1={barX} y1={mainPadTop - 4} x2={barX} y2={barY}
                  stroke="#5aaff8" strokeWidth={1} strokeDasharray="3,2" opacity={0.6} />
                <text x={barX} y={Math.max(mainPadTop - 4, barY - 8)}
                  textAnchor="middle" fontSize={11} fontWeight={800}
                  fill="#ffffff" fontFamily="system-ui">
                  {formatCurrency(bar.total)}
                </text>
              </g>
            );
          })()}
        </svg>

        {/* X-axis labels */}
        <svg width={svgW} height={20} style={{ display: "block" }}>
          {barData.map((bar, i) => {
            if (!bar.shortLabel) return null;
            const x = padL + i * stepW + stepW / 2;
            const isHov = hovered === i;
            return (
              <text key={i} x={x} y={14}
                textAnchor="middle" fontSize={barCount > 60 ? 6 : 8}
                fill={isHov ? "#5aaff8" : bar.isCurrent ? "#5aaff8" : "#1a4060"}
                fontWeight={isHov || bar.isCurrent ? 700 : 400}
                fontFamily="system-ui">
                {bar.shortLabel}
              </text>
            );
          })}
        </svg>

        {/* Hover info for portfolio chart */}
        {hovered != null && barData[hovered] && (
          <div style={{
            padding: "0.3rem 0.8rem", fontSize: "0.7rem", fontFamily: "system-ui",
            borderTop: "1px solid #0a1e30", display: "flex", justifyContent: "center", gap: 20,
          }}>
            <span style={{ color: "#5a8ab8" }}>{barData[hovered].label}</span>
            <span style={{ color: "#c8dff0" }}>
              Value: <strong>{formatCurrency(barData[hovered].total)}</strong>
            </span>
            {barData[hovered].isHistorical && showDivReturn && barData[hovered].top > 0 && (
              <>
                <span style={{ color: "#5a8ab8" }}>
                  Price: {formatCurrency(barData[hovered].bottom)}
                </span>
                <span style={{ color: "#2a9a5a" }}>
                  Div Return: +{formatCurrency(barData[hovered].top)}
                </span>
              </>
            )}
            {!barData[hovered].isHistorical && (
              <>
                <span style={{ color: "#5a8ab8" }}>
                  No DRIP: {shortMoney(barData[hovered].bottom)}
                </span>
                <span style={{ color: "#005EB8" }}>
                  DRIP Bonus: +{shortMoney(barData[hovered].top)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* ==================== DIVIDEND INCOME CHART (INDEPENDENT) ==================== */}
      <div style={{ background: "#071020", borderTop: "1px solid #1a3a5c", padding: "0.5rem 0 0", marginTop: "1rem" }}>
        <div style={{
          fontSize: "0.5rem", color: "#1a4060", letterSpacing: "0.15em",
          textTransform: "uppercase", padding: "0 0.8rem 0.3rem",
          fontFamily: "system-ui",
        }}>
          Dividend Income
        </div>

        <svg width={svgW} height={divH} style={{ display: "block" }}>
          {/* Grid lines */}
          {[0, 0.5, 1].map(pct => {
            const y = divPadTop + divChartH * (1 - pct);
            return (
              <g key={pct}>
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="#081828" strokeWidth={0.5} />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="8" fill="#1a4060" fontFamily="system-ui">
                  ${Math.round(maxDiv * pct).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Dividend bars — INDEPENDENT hover */}
          {divBars.map((bar, i) => {
            const x = padL + i * stepW + (stepW - barW) / 2;
            const barH = maxDiv > 0 ? (bar.value / maxDiv) * divChartH : 0;
            const y = divPadTop + divChartH - barH;
            const isHov = divHovered === i;

            let fill;
            if (isHov) fill = "#ffffff";
            else if (divHovered != null) fill = i <= divHovered ? "#2a9a5a" : "#0f3020";
            else fill = bar.isHistorical ? "#1a7a3a" : "#145a2a";

            return (
              <g key={i}
                onMouseEnter={() => setDivHovered(i)}
                onMouseLeave={() => setDivHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <rect x={x} y={y} width={barW} height={barH}
                  fill={fill}
                  filter={isHov ? "url(#neonGlow)" : undefined}
                  opacity={isHov ? 1 : (divHovered != null && i > divHovered) ? 0.5 : 0.85}
                />
              </g>
            );
          })}

          {/* NOW divider */}
          <line x1={nowX} y1={0} x2={nowX} y2={divPadTop + divChartH + 4}
            stroke="#5aaff8" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />

          {/* Hovered value */}
          {divHovered != null && divBars[divHovered] && (() => {
            const bar = divBars[divHovered];
            const barH = maxDiv > 0 ? (bar.value / maxDiv) * divChartH : 0;
            const barY = divPadTop + divChartH - barH;
            const barX = padL + divHovered * stepW + stepW / 2;
            return (
              <g>
                <line x1={barX} y1={0} x2={barX} y2={barY}
                  stroke="#2a9a5a" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                <text x={barX} y={Math.max(10, barY - 5)}
                  textAnchor="middle" fontSize={9} fontWeight={700}
                  fill="#2a9a5a" fontFamily="system-ui">
                  ${bar.value.toLocaleString()}
                </text>
              </g>
            );
          })()}

          {/* X-axis labels */}
          {barData.map((bar, i) => {
            if (!bar.shortLabel) return null;
            const x = padL + i * stepW + stepW / 2;
            const isHov = divHovered === i;
            return (
              <text key={i} x={x} y={divH - 4}
                textAnchor="middle" fontSize={barCount > 60 ? 5 : 7}
                fill={isHov ? "#2a9a5a" : bar.isCurrent ? "#5aaff8" : "#1a4060"}
                fontWeight={isHov || bar.isCurrent ? 700 : 400}
                fontFamily="system-ui">
                {bar.shortLabel}
              </text>
            );
          })}
        </svg>

        {/* Hover info for dividend chart */}
        {divHovered != null && divBars[divHovered] && (
          <div style={{
            padding: "0.3rem 0.8rem", fontSize: "0.7rem", fontFamily: "system-ui",
            borderTop: "1px solid #0a1e30", display: "flex", justifyContent: "center", gap: 20,
          }}>
            <span style={{ color: "#1a7a3a" }}>{divBars[divHovered].label}</span>
            <span style={{ color: "#2a9a5a" }}>
              Income: <strong>${divBars[divHovered].value.toLocaleString()}</strong>
            </span>
          </div>
        )}
      </div>

      {/* ==================== FOOTER LEGEND ==================== */}
      <div style={{
        padding: "0.6rem 1.5rem", display: "flex", justifyContent: "space-between",
        alignItems: "center", borderTop: "1px solid #0a1e30",
      }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <LegendItem color="#5a8ab8" label="Price Return" />
          {showDivReturn && <LegendItem color="#2a9a5a" label="Div Return" />}
          <LegendItem color="#1a3a5c" dashed label="No DRIP" />
          <LegendItem color="#005EB8" label="DRIP Bonus" />
          <LegendItem color="#1a7a3a" label="Div Income" />
        </div>
        <span style={{
          fontSize: "0.65rem", color: "#1a3a58", fontStyle: "italic",
          fontFamily: "Georgia, serif",
        }}>
          7% avg return · divs reinvested quarterly
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, last }) {
  return (
    <div style={{
      padding: "1rem 1.2rem",
      border: "1px solid #1a3a5c",
      marginRight: last ? 0 : -1,
      marginBottom: -1,
    }}>
      <div style={{
        fontSize: "0.55rem", color: "#2a4a6a", textTransform: "uppercase",
        letterSpacing: "0.15em", marginBottom: "0.5rem",
        fontFamily: "system-ui",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "1.5rem", fontWeight: 700, color: color || "#c8dff0",
        lineHeight: 1,
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontSize: "0.7rem", color: "#2a4a6a", marginTop: "0.35rem",
          fontFamily: "Georgia, serif",
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label, dashed }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 14, height: 0,
        borderTop: dashed ? `2px dashed ${color}` : `2px solid ${color}`,
      }} />
      <span style={{ fontSize: "0.65rem", color: "#2a4a6a", fontFamily: "Georgia, serif" }}>{label}</span>
    </div>
  );
}
