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

// Compact axis label: "J'22" for Jan 2022
function axisLabel(year, periodIndex, isQuarterly) {
  const qMonths = ["J", "A", "J", "O"]; // Jan, Apr, Jul, Oct
  const months = ["J","F","M","A","M","J","J","A","S","O","N","D"];
  const shortYear = "'" + String(year).slice(2);
  if (isQuarterly) return qMonths[periodIndex] + shortYear;
  return months[periodIndex] + shortYear;
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
  const [hovered, setHovered] = useState(null);
  const [divHovered, setDivHovered] = useState(null);
  const [historyMap, setHistoryMap] = useState({});
  const [histLoading, setHistLoading] = useState(false);
  const [granularity, setGranularity] = useState("quarterly");
  const [showDivReturn, setShowDivReturn] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

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

  const realHistData = useMemo(() => {
    if (Object.keys(historyMap).length === 0) return null;
    return calcHistoricalPortfolioValues(historyMap, holdings, portfolioValue);
  }, [historyMap, holdings, portfolioValue]);

  // Stat card values
  const finalNoDrip = noDripVals?.[horizon] || noDripVals?.[noDripVals.length - 1] || 0;
  const finalDrip = contribVals ? (contribVals[horizon] || contribVals[contribVals.length - 1] || 0)
    : (dripVals?.[horizon] || dripVals?.[dripVals.length - 1] || 0);
  const dripAdvantage = finalDrip - finalNoDrip;
  const incomeAtHorizon = Math.round(totalIncome * Math.pow(1 + (growth || 5) / 100, horizon));

  // Starting value (10 years ago)
  const startingValue = useMemo(() => {
    if (realHistData && realHistData.length > 1) return realHistData[0].value;
    return Math.round(portfolioValue / Math.pow(1.10, HIST_YEARS));
  }, [realHistData, portfolioValue]);
  const startingYear = useMemo(() => {
    if (realHistData && realHistData.length > 1) return realHistData[0].year;
    return currentYear - HIST_YEARS;
  }, [realHistData, currentYear]);

  // Growth percentage from starting to current
  const growthPct = startingValue > 0 ? ((portfolioValue / startingValue - 1) * 100).toFixed(1) : "0";

  // Build bar data: 10yr back + projected forward
  const bars = useMemo(() => {
    const yieldRate = (avgYield || 2.5) / 100;
    const growthRate = (growth || 5) / 100;
    const annualReturn = 0.08;
    const isQuarterly = granularity === "quarterly";
    const periodsPerYear = isQuarterly ? 4 : 12;

    const result = [];

    // --- HISTORICAL: exactly 10 years back ---
    let histYearlyValues;
    if (realHistData && realHistData.length > 1) {
      // Filter to last 10 years only
      const cutoffYear = currentYear - HIST_YEARS;
      histYearlyValues = realHistData.filter(d => d.year >= cutoffYear);
      if (histYearlyValues.length === 0) histYearlyValues = realHistData.slice(-11);
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
          noDripValue: Math.round(backVal * 0.85),
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
        result.push({
          label: isQuarterly
            ? `Q${p+1} ${from.year}`
            : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][p]} ${from.year}`,
          axisLabel: p === 0 ? axisLabel(from.year, p, isQuarterly) : "",
          fullLabel: isQuarterly
            ? `Q${p+1} ${from.year} (actual)`
            : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][p]} ${from.year} (actual)`,
          total: value,            // with DRIP (adjusted close)
          noDrip: noDripValue,     // without DRIP (raw close)
          dripBonus: Math.max(0, value - noDripValue),
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
      axisLabel: "Now",
      fullLabel: `${currentYear} (current)`,
      total: portfolioValue,
      noDrip: portfolioValue,
      dripBonus: 0,
      isHistorical: true,
      isCurrent: true,
      year: currentYear,
      periodIndex: 0,
      yearsFromNow: 0,
    });

    const nowBarIndex = result.length - 1;

    // --- PROJECTED ---
    for (let yr = 1; yr <= projYears; yr++) {
      const noDripVal = noDripVals?.[yr] || portfolioValue;
      const dripVal = contribVals ? (contribVals[yr] || portfolioValue) : (dripVals?.[yr] || portfolioValue);

      for (let p = 0; p < periodsPerYear; p++) {
        const prevNoDrip = noDripVals?.[yr - 1] || portfolioValue;
        const prevDrip = contribVals ? (contribVals[yr - 1] || portfolioValue) : (dripVals?.[yr - 1] || portfolioValue);
        const t = (p + 1) / periodsPerYear;
        const interpNoDrip = Math.round(prevNoDrip + (noDripVal - prevNoDrip) * t);
        const interpDrip = Math.round(prevDrip + (dripVal - prevDrip) * t);

        result.push({
          label: isQuarterly ? `Q${p+1} ${currentYear + yr}` : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][p]} ${currentYear + yr}`,
          axisLabel: p === 0 ? axisLabel(currentYear + yr, p, isQuarterly) : "",
          fullLabel: isQuarterly ? `Q${p+1} ${currentYear + yr} (projected)` : `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][p]} ${currentYear + yr} (projected)`,
          total: interpDrip,
          noDrip: interpNoDrip,
          dripBonus: Math.max(0, interpDrip - interpNoDrip),
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

  // Dividend income bars
  const divBars = useMemo(() => {
    if (!monthlyData?.length) return [];
    const growthRate = (growth || 5) / 100;
    const isQuarterly = granularity === "quarterly";
    return barData.map(bar => {
      const growthFactor = Math.pow(1 + growthRate, bar.yearsFromNow || 0);
      let divIncome;
      if (isQuarterly) {
        const qStart = (bar.periodIndex || 0) * 3;
        divIncome = 0;
        for (let m = qStart; m < qStart + 3 && m < 12; m++) divIncome += (monthlyData[m] || 0);
      } else {
        divIncome = monthlyData[bar.periodIndex || 0] || 0;
      }
      return { ...bar, value: Math.max(0, Math.round(divIncome * growthFactor)) };
    });
  }, [barData, monthlyData, growth, granularity]);

  // Chart layout
  const padL = 55;
  const padR = 10;
  const svgW = Math.max(100, width - 48);
  const chartW = svgW - padL - padR;
  const barCount = barData.length || 1;
  const stepW = chartW / barCount;
  const barW = Math.max(2, Math.min(stepW * 0.65, 18));
  const maxVal = Math.max(...barData.map(b => b.total), 1);

  const mainH = 300;
  const mainPadTop = 40;
  const mainPadBot = 4;
  const mainChartH = mainH - mainPadTop - mainPadBot;

  const divH = 120;
  const divPadTop = 4;
  const divPadBot = 24;
  const divChartH = divH - divPadTop - divPadBot;
  const maxDiv = divBars.length > 0 ? Math.max(...divBars.map(b => b.value), 1) : 1;

  const nowX = padL + nowBarIndex * stepW + stepW / 2;

  // Tooltip for portfolio chart
  const hovBar = hovered != null ? barData[hovered] : null;
  const divHovBar = divHovered != null ? divBars[divHovered] : null;

  return (
    <div ref={containerRef} style={{ background: "#0a1628", border: "1px solid #1a3a5c" }}>
      {/* ==================== HEADER ==================== */}
      <div style={{ padding: "1.5rem 1.5rem 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.3rem" }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#c8dff0", fontFamily: "'Playfair Display', Georgia, serif" }}>
              Historical & Projected Income
            </div>
            <div style={{ fontSize: "0.72rem", color: "#2a4a6a", marginTop: 2, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
              {horizon}-yr · {growth.toFixed(1)}% avg div growth · 7% base return
              {realHistData && " · real data"}{histLoading && " · loading..."}
            </div>
          </div>
          <div style={{ padding: "6px 16px", border: "1px solid #1a3a5c", fontWeight: 700, fontSize: "1rem", color: "#5aaff8", fontFamily: "'Playfair Display', Georgia, serif" }}>
            {shortMoney(totalIncome)}/yr
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "0.8rem 0 0.6rem" }}>
          <LegendItem color="#2a8a4a" label="Hist DRIP" />
          <LegendItem color="#6aaa4a" label="Hist" />
          <LegendItem color="#005EB8" label="Proj DRIP" />
          <LegendItem color="#1a3a5c" label="Proj" />
        </div>

        {/* Stat cards: STARTING, CURRENT (DRIP), DRIP ADVANTAGE */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, marginBottom: "1rem" }}>
          <StatCard label={`STARTING (${startingYear})`} value={formatCurrency(startingValue)} color="#1a7a3a" />
          <StatCard label="CURRENT (DRIP)" value={formatCurrency(portfolioValue)} sub={`+${growthPct}%`} color="#005EB8" />
          <StatCard label="DRIP ADVANTAGE" value={`+${shortMoney(dripAdvantage)}`} sub={`at ${horizon}Y`} color="#5aaff8" last />
        </div>

        {/* Horizon + controls */}
        <div style={{ display: "flex", gap: 0, marginBottom: "0.5rem", flexWrap: "wrap" }}>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} style={{
              padding: "5px 12px", border: "1px solid #1a3a5c", cursor: "pointer",
              fontSize: "0.78rem", fontWeight: horizon === h ? 700 : 400,
              fontFamily: "'EB Garamond', Georgia, serif",
              background: horizon === h ? "#005EB8" : "transparent",
              color: horizon === h ? "#ffffff" : "#2a4a6a",
              marginRight: -1, transition: "all 0.15s",
            }}>
              {h}Y
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 0, border: "1px solid #1a3a5c" }}>
            {["quarterly", "monthly"].map(m => (
              <button key={m} onClick={() => setGranularity(m)} style={{
                padding: "5px 12px", border: "none", fontSize: "0.72rem", fontWeight: 600,
                cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
                fontFamily: "'EB Garamond', Georgia, serif",
                background: granularity === m ? "#005EB8" : "transparent",
                color: granularity === m ? "#ffffff" : "#2a4a6a",
                transition: "all 0.15s",
              }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Contribution + volatility */}
        <div style={{ display: "flex", gap: 0, alignItems: "center", marginBottom: "0.8rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", color: "#2a4a6a", marginRight: 8, fontFamily: "Georgia, serif" }}>
            + Invest yearly:
          </span>
          {[{ l: "None", v: 0 }, { l: "$1k", v: 1000 }, { l: "$5k", v: 5000 }, { l: "$10k", v: 10000 },
            { l: "$20k", v: 20000 }, { l: "$25k", v: 25000 }, { l: "$50k", v: 50000 }].map(c => (
            <button key={c.v} onClick={() => { setExtraContrib(c.v); setCustomContrib(""); }} style={{
              padding: "4px 10px", border: "1px solid #1a3a5c", cursor: "pointer",
              fontSize: "0.75rem", fontWeight: 600, fontFamily: "'EB Garamond', Georgia, serif",
              background: extraContrib === c.v && !customContrib ? "#005EB8" : "transparent",
              color: extraContrib === c.v && !customContrib ? "#ffffff" : "#2a4a6a",
              marginRight: -1, transition: "all 0.15s",
            }}>
              {c.l}
            </button>
          ))}
          <input placeholder="Custom" value={customContrib}
            onChange={e => setCustomContrib(e.target.value.replace(/[^0-9]/g, ""))}
            style={{ width: 60, padding: "4px 8px", fontSize: "0.75rem", background: "transparent",
              border: "1px solid #1a3a5c", color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif",
              outline: "none", marginLeft: -1 }}
          />
          <div style={{ flex: 1 }} />
          <button onClick={() => setUseVolatility(v => !v)} style={{
            padding: "4px 12px", border: "1px solid #1a3a5c", cursor: "pointer",
            fontSize: "0.72rem", fontWeight: 600, fontFamily: "Georgia, serif",
            background: useVolatility ? "rgba(0,94,184,0.15)" : "transparent",
            color: useVolatility ? "#5aaff8" : "#2a4a6a", transition: "all 0.15s",
          }}>
            ~ Real World Returns
          </button>
        </div>
      </div>

      {/* ==================== PORTFOLIO VALUE CHART ==================== */}
      <div style={{ background: "#071020", borderTop: "1px solid #0a1e30" }}>
        {/* Fixed-height tooltip area — prevents jitter */}
        <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 1rem" }}>
          {hovBar ? (
            <div style={{
              background: "#0a1628", border: "1px solid #1a3a5c", padding: "6px 18px",
              display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}>
              <span style={{ fontSize: "0.75rem", color: "#5a8ab8", fontFamily: "system-ui", fontWeight: 600 }}>
                {hovBar.fullLabel}
              </span>
              <span style={{ fontSize: "1rem", color: "#5aaff8", fontWeight: 800, fontFamily: "system-ui" }}>
                {formatCurrency(hovBar.total)}
              </span>
              <span style={{ fontSize: "0.68rem", color: "#2a4a6a", fontFamily: "system-ui" }}>
                No DRIP: {formatCurrency(hovBar.noDrip)} | DRIP +{formatCurrency(hovBar.dripBonus)}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: "0.5rem", color: "#1a4060", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "system-ui" }}>
              Portfolio Value
            </span>
          )}
        </div>

        <svg width={svgW} height={mainH} style={{ display: "block" }}>
          <defs>
            <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
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
            const totalH = maxVal > 0 ? (bar.total / maxVal) * mainChartH : 0;
            const noDripH = maxVal > 0 ? (bar.noDrip / maxVal) * mainChartH : 0;
            const bonusH = Math.max(0, totalH - noDripH);
            const showStack = bar.isHistorical ? (showDivReturn && bar.dripBonus > 0) : true;

            // Colors: historical = green, projected = blue
            let bottomFill, topFill;
            if (bar.isHistorical) {
              if (isHov) { bottomFill = "#c8f0d0"; topFill = "#ffffff"; }
              else if (hovered != null && i > hovered) { bottomFill = "#0f2018"; topFill = "#0a1810"; }
              else if (hovered != null) { bottomFill = "#6aaa4a"; topFill = "#3aaa5a"; }
              else { bottomFill = "#6aaa4a"; topFill = "#2a8a4a"; }
            } else {
              if (isHov) { bottomFill = "#c8dff0"; topFill = "#ffffff"; }
              else if (hovered != null && i > hovered) { bottomFill = "#0f1e30"; topFill = "#0a1520"; }
              else if (hovered != null) { bottomFill = "#3a6a9a"; topFill = "#5a9ad0"; }
              else { bottomFill = "#1a3a5c"; topFill = "#005EB8"; }
            }

            const bottomBarH = showStack ? noDripH : totalH;
            const topBarH = showStack ? bonusH : 0;

            return (
              <g key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Bottom (noDrip / price) */}
                <rect x={x} y={mainPadTop + mainChartH - bottomBarH} width={barW} height={bottomBarH}
                  fill={bottomFill}
                  opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.4 : 0.85}
                />
                {/* Top (DRIP bonus / div return) */}
                {topBarH > 0 && (
                  <rect x={x} y={mainPadTop + mainChartH - bottomBarH - topBarH} width={barW} height={topBarH}
                    fill={topFill}
                    filter={isHov ? "url(#neonGlow)" : undefined}
                    opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.4 : 0.9}
                  />
                )}
              </g>
            );
          })}

          {/* NOW divider */}
          <line x1={nowX} y1={mainPadTop - 8} x2={nowX} y2={mainPadTop + mainChartH + 4}
            stroke="#5aaff8" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
          <text x={nowX} y={mainPadTop - 12} textAnchor="middle" fontSize="8" fontWeight="700"
            fill="#5aaff8" fontFamily="system-ui">NOW</text>

          {/* Hovered bar line */}
          {hovBar && (() => {
            const totalH = maxVal > 0 ? (hovBar.total / maxVal) * mainChartH : 0;
            const barY = mainPadTop + mainChartH - totalH;
            const barX = padL + hovered * stepW + stepW / 2;
            return (
              <line x1={barX} y1={mainPadTop} x2={barX} y2={barY}
                stroke="#5aaff8" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
            );
          })()}
        </svg>

        {/* X-axis labels */}
        <svg width={svgW} height={18} style={{ display: "block" }}>
          {barData.map((bar, i) => {
            if (!bar.axisLabel) return null;
            const x = padL + i * stepW + stepW / 2;
            return (
              <text key={i} x={x} y={13}
                textAnchor="middle" fontSize={barCount > 60 ? 6 : 7.5}
                fill={hovered === i ? "#5aaff8" : bar.isCurrent ? "#5aaff8" : "#1a4060"}
                fontWeight={hovered === i || bar.isCurrent ? 700 : 400}
                fontFamily="system-ui">
                {bar.axisLabel}
              </text>
            );
          })}
        </svg>
      </div>

      {/* ==================== DIVIDEND INCOME (INDEPENDENT) ==================== */}
      <div style={{ background: "#071020", borderTop: "1px solid #1a3a5c", marginTop: 8 }}>
        {/* Fixed-height tooltip area */}
        <div style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 1rem" }}>
          {divHovBar ? (
            <span style={{ fontSize: "0.72rem", fontFamily: "system-ui" }}>
              <span style={{ color: "#1a7a3a" }}>{divHovBar.label}</span>
              {" "}<span style={{ color: "#2a9a5a", fontWeight: 700 }}>${divHovBar.value.toLocaleString()}</span>
            </span>
          ) : (
            <span style={{ fontSize: "0.5rem", color: "#1a4060", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "system-ui" }}>
              Dividend Income
            </span>
          )}
        </div>

        <svg width={svgW} height={divH} style={{ display: "block" }}>
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

          {divBars.map((bar, i) => {
            const x = padL + i * stepW + (stepW - barW) / 2;
            const barH = maxDiv > 0 ? (bar.value / maxDiv) * divChartH : 0;
            const y = divPadTop + divChartH - barH;
            const isHov = divHovered === i;

            let fill;
            if (isHov) fill = "#ffffff";
            else if (divHovered != null && i > divHovered) fill = "#0f3020";
            else if (divHovered != null) fill = "#2a9a5a";
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
                  opacity={isHov ? 1 : (divHovered != null && i > divHovered) ? 0.4 : 0.85}
                />
              </g>
            );
          })}

          <line x1={nowX} y1={0} x2={nowX} y2={divPadTop + divChartH + 4}
            stroke="#5aaff8" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />

          {barData.map((bar, i) => {
            if (!bar.axisLabel) return null;
            const x = padL + i * stepW + stepW / 2;
            return (
              <text key={i} x={x} y={divH - 4}
                textAnchor="middle" fontSize={barCount > 60 ? 5 : 7}
                fill={divHovered === i ? "#2a9a5a" : bar.isCurrent ? "#5aaff8" : "#1a4060"}
                fontWeight={divHovered === i || bar.isCurrent ? 700 : 400}
                fontFamily="system-ui">
                {bar.axisLabel}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Footer */}
      <div style={{
        padding: "0.5rem 1.5rem", display: "flex", justifyContent: "flex-end",
        borderTop: "1px solid #0a1e30",
      }}>
        <span style={{ fontSize: "0.63rem", color: "#1a3a58", fontStyle: "italic", fontFamily: "Georgia, serif" }}>
          7% avg return · divs reinvested quarterly
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, last }) {
  return (
    <div style={{
      padding: "1rem 1.2rem", border: "1px solid #1a3a5c",
      marginRight: last ? 0 : -1, marginBottom: -1,
    }}>
      <div style={{ fontSize: "0.55rem", color: "#2a4a6a", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.4rem", fontFamily: "system-ui" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.45rem", fontWeight: 700, color: color || "#c8dff0", lineHeight: 1, fontFamily: "'Playfair Display', Georgia, serif" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "0.7rem", color: "#2a4a6a", marginTop: "0.3rem", fontFamily: "Georgia, serif" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 12, height: 8, background: color }} />
      <span style={{ fontSize: "0.68rem", color: "#5a8ab8", fontFamily: "Georgia, serif" }}>{label}</span>
    </div>
  );
}
