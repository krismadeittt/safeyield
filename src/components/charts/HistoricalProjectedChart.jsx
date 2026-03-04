import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatCurrency } from '../../utils/format';
import { fetchBatchHistory, calcHistoricalPortfolioValues, calcHistoricalDividendsByYear, calcDividendsByPeriod } from '../../api/history';
import useIsMobile from '../../hooks/useIsMobile';

const FALLBACK_HIST = 10; // synthetic fallback when no KV data
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
  noDripVals, dripVals, contribVals,
  totalIncome,
  monthlyData, holdings,
}) {
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const [width, setWidth] = useState(isMobile ? 340 : 800);
  const [hovered, setHovered] = useState(null);
  const [divHovered, setDivHovered] = useState(null);
  const [historyMap, setHistoryMap] = useState({});
  const [histLoading, setHistLoading] = useState(false);
  const [granularity, setGranularity] = useState("monthly");
  const [showDivReturn, setShowDivReturn] = useState(true);
  const [histRange, setHistRange] = useState(10); // 0=Off, 5, 10, 15, 20

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
  const projYears = horizon;

  const realHistData = useMemo(() => {
    if (Object.keys(historyMap).length === 0 || histRange === 0) return null;
    return calcHistoricalPortfolioValues(historyMap, holdings, portfolioValue, histRange, granularity);
  }, [historyMap, holdings, portfolioValue, histRange, granularity]);

  // Real dividend income from KV history data (actual payments, not estimates)
  const realDivByYear = useMemo(() => {
    if (Object.keys(historyMap).length === 0) return null;
    return calcHistoricalDividendsByYear(historyMap, holdings);
  }, [historyMap, holdings]);

  // Period-keyed dividend data (matches price history granularity)
  const realDivByPeriod = useMemo(() => {
    if (Object.keys(historyMap).length === 0) return null;
    return calcDividendsByPeriod(historyMap, holdings, granularity);
  }, [historyMap, holdings, granularity]);

  // Stat card values
  const finalNoDrip = noDripVals?.[horizon] || noDripVals?.[noDripVals.length - 1] || 0;
  const finalDrip = contribVals ? (contribVals[horizon] || contribVals[contribVals.length - 1] || 0)
    : (dripVals?.[horizon] || dripVals?.[dripVals.length - 1] || 0);
  const dripAdvantage = finalDrip - finalNoDrip;
  const incomeAtHorizon = Math.round(totalIncome * Math.pow(1 + (growth || 5) / 100, horizon));

  // Only show historical bars when real data is loaded (no synthetic fallback)
  const effectiveHistYears = (histRange > 0 && realHistData && realHistData.length > 1) ? histRange : 0;
  const startingValue = useMemo(() => {
    if (realHistData && realHistData.length > 1) return realHistData[0].value;
    return portfolioValue;
  }, [realHistData, portfolioValue]);
  const startingYear = useMemo(() => {
    if (realHistData && realHistData.length > 1) return realHistData[0].year;
    return currentYear;
  }, [realHistData, currentYear]);

  // Growth percentage from starting to current
  const growthPct = startingValue > 0 ? ((portfolioValue / startingValue - 1) * 100).toFixed(1) : "0";

  // Build bar data: historical (actual data points) + projected (interpolated)
  const bars = useMemo(() => {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const periodsPerYear = granularity === 'weekly' ? 52 : granularity === 'monthly' ? 12 : 1;
    const result = [];

    // --- HISTORICAL --- (actual data points, no interpolation)
    let nowNoDrip = portfolioValue;

    if (effectiveHistYears > 0 && realHistData) {
      for (let i = 0; i < realHistData.length; i++) {
        const pt = realHistData[i];
        const date = pt.date;
        const year = pt.year;
        const month = parseInt(date.substring(5, 7)) - 1;
        const day = parseInt(date.substring(8, 10));
        const shortYr = "'" + String(year).slice(2);

        let label, fullLabel, axLabel;
        if (granularity === 'yearly') {
          label = String(year);
          fullLabel = `${year} (actual)`;
          axLabel = shortYr;
        } else if (granularity === 'monthly') {
          label = `${months[month]} ${year}`;
          fullLabel = `${months[month]} ${year} (actual)`;
          axLabel = month === 0 ? `J${shortYr}` : "";
        } else {
          label = `${months[month]} ${day}, ${year}`;
          fullLabel = `${date} (actual)`;
          axLabel = (i === 0 || realHistData[i - 1]?.year !== year) ? shortYr : "";
        }

        result.push({
          label, axisLabel: axLabel, fullLabel,
          total: pt.value,
          noDrip: pt.noDripValue,
          dripBonus: Math.max(0, pt.value - pt.noDripValue),
          isHistorical: true, isCurrent: false,
          date, year, periodIndex: granularity === 'monthly' ? month : 0,
          yearsFromNow: year - currentYear,
        });
      }
      const lastHist = realHistData[realHistData.length - 1];
      nowNoDrip = lastHist?.noDripValue || portfolioValue;
    }

    result.push({
      label: "Now", axisLabel: "Now",
      fullLabel: `${currentYear} (current)`,
      total: portfolioValue, noDrip: nowNoDrip,
      dripBonus: Math.max(0, portfolioValue - nowNoDrip),
      isHistorical: true, isCurrent: true,
      year: currentYear, periodIndex: 0, yearsFromNow: 0,
    });

    const nowBarIndex = result.length - 1;

    // --- PROJECTED --- (interpolate yearly projections at chosen granularity)
    for (let yr = 1; yr <= projYears; yr++) {
      for (let p = 0; p < periodsPerYear; p++) {
        const noDripVal = noDripVals?.[yr] || portfolioValue;
        const dripVal = contribVals ? (contribVals[yr] || portfolioValue) : (dripVals?.[yr] || portfolioValue);
        const prevNoDrip = noDripVals?.[yr - 1] || portfolioValue;
        const prevDrip = contribVals ? (contribVals[yr - 1] || portfolioValue) : (dripVals?.[yr - 1] || portfolioValue);
        const t = (p + 1) / periodsPerYear;
        const interpNoDrip = Math.round(prevNoDrip + (noDripVal - prevNoDrip) * t);
        const interpDrip = Math.round(prevDrip + (dripVal - prevDrip) * t);

        const projYear = currentYear + yr;
        const shortYr = "'" + String(projYear).slice(2);
        let label, fullLabel, axLabel;
        if (granularity === 'yearly') {
          label = String(projYear); fullLabel = `${projYear} (projected)`; axLabel = shortYr;
        } else if (granularity === 'monthly') {
          label = `${months[p]} ${projYear}`; fullLabel = `${months[p]} ${projYear} (projected)`;
          axLabel = p === 0 ? `J${shortYr}` : "";
        } else {
          label = `W${p + 1} ${projYear}`; fullLabel = `Week ${p + 1}, ${projYear} (projected)`;
          axLabel = p === 0 ? shortYr : "";
        }

        result.push({
          label, axisLabel: axLabel, fullLabel,
          total: interpDrip, noDrip: interpNoDrip,
          dripBonus: Math.max(0, interpDrip - interpNoDrip),
          isHistorical: false, isCurrent: false,
          year: projYear, periodIndex: p, yearsFromNow: yr,
        });
      }
    }

    return { bars: result, nowBarIndex };
  }, [portfolioValue, projYears, currentYear, realHistData, granularity, noDripVals, dripVals, contribVals, effectiveHistYears]);

  const { bars: barData, nowBarIndex } = bars;

  // Dividend income bars — use REAL dividend data from KV for historical, growth estimate for projected.
  // KV data may be incomplete (not all tickers have dividend history), so we compute a
  // scaling factor from the most recent full year to normalize historical bars.
  const divBars = useMemo(() => {
    if (!monthlyData?.length) return [];
    const growthRate = (growth || 5) / 100;
    const expectedAnnual = monthlyData.reduce((s, v) => s + v, 0);

    // Scaling factor: normalize historical KV dividends to match fundamentals estimate
    let divScale = 1;
    if (realDivByYear && expectedAnnual > 0) {
      for (const checkYear of [currentYear - 1, currentYear - 2]) {
        const yd = realDivByYear[checkYear];
        if (yd && yd.annual > 0) {
          const yearsBack = currentYear - checkYear;
          const expectedForYear = expectedAnnual / Math.pow(1 + growthRate, yearsBack);
          divScale = expectedForYear / yd.annual;
          break;
        }
      }
    }

    // Helper: compute period key from a date string (matches history.js periodKey)
    function getPeriodKey(dateStr) {
      if (granularity === 'yearly') return dateStr.substring(0, 4);
      if (granularity === 'monthly') return dateStr.substring(0, 7);
      const parts = dateStr.split('-').map(Number);
      const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      const day = d.getUTCDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      d.setUTCDate(d.getUTCDate() + mondayOffset);
      return d.toISOString().substring(0, 10);
    }

    return barData.map(bar => {
      let divIncome;

      // Historical: use actual dividend payment data grouped by period
      if (bar.isHistorical && !bar.isCurrent && bar.date && realDivByPeriod) {
        const key = getPeriodKey(bar.date);
        divIncome = (realDivByPeriod[key] || 0) * divScale;
      } else {
        // Projected / current: estimate from fundamentals with growth
        const growthFactor = Math.pow(1 + growthRate, bar.yearsFromNow || 0);
        if (granularity === 'yearly') {
          divIncome = expectedAnnual;
        } else if (granularity === 'monthly') {
          divIncome = monthlyData[bar.periodIndex || 0] || 0;
        } else {
          divIncome = expectedAnnual / 52;
        }
        divIncome = divIncome * growthFactor;
      }

      return { ...bar, value: Math.max(0, Math.round(divIncome)) };
    });
  }, [barData, monthlyData, growth, granularity, realDivByPeriod, realDivByYear, currentYear]);

  // Chart layout
  const padL = isMobile ? 35 : 55;
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
      <div style={{ padding: isMobile ? "0.8rem 0.8rem 0" : "1.5rem 1.5rem 0" }}>
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
        <div style={{ display: "flex", gap: isMobile ? 10 : 16, alignItems: "center", margin: "0.8rem 0 0.6rem", flexWrap: "wrap" }}>
          <LegendItem color="#60e850" label="Div Return" />
          <LegendItem color="#1e5a28" label="Price" />
          <LegendItem color="#3a9aff" label="Proj DRIP" />
          <LegendItem color="#1a3a5c" label="Proj Base" />
        </div>

        {/* Stat cards: STARTING, CURRENT (DRIP), DRIP ADVANTAGE */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, marginBottom: isMobile ? "0.5rem" : "1rem" }}>
          <StatCard label={`STARTING (${startingYear})`} value={formatCurrency(startingValue)} color="#1a7a3a" compact={isMobile} />
          <StatCard label="CURRENT (DRIP)" value={formatCurrency(portfolioValue)} sub={`+${growthPct}%`} color="#005EB8" compact={isMobile} />
          <StatCard label="DRIP ADVANTAGE" value={`+${shortMoney(dripAdvantage)}`} sub={`at ${horizon}Y`} color="#5aaff8" last compact={isMobile} />
        </div>

        {/* Row 1: Horizon + Real World Returns + Granularity */}
        <div style={{ display: "flex", gap: 0, marginBottom: "0.5rem", flexWrap: "wrap", rowGap: 6, alignItems: "center" }}>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} style={{
              padding: isMobile ? "4px 8px" : "5px 12px", border: "1px solid #1a3a5c", cursor: "pointer",
              fontSize: isMobile ? "0.7rem" : "0.78rem", fontWeight: horizon === h ? 700 : 400,
              fontFamily: "'EB Garamond', Georgia, serif",
              background: horizon === h ? "#005EB8" : "transparent",
              color: horizon === h ? "#ffffff" : "#2a4a6a",
              marginRight: -1, transition: "all 0.15s",
            }}>
              {h}Y
            </button>
          ))}
          <button onClick={() => setUseVolatility(v => !v)} style={{
            padding: isMobile ? "4px 8px" : "5px 12px", border: "1px solid #1a3a5c", cursor: "pointer",
            fontSize: isMobile ? "0.7rem" : "0.72rem", fontWeight: 600, fontFamily: "Georgia, serif",
            marginLeft: isMobile ? 6 : 12,
            background: useVolatility ? "rgba(0,94,184,0.15)" : "transparent",
            color: useVolatility ? "#5aaff8" : "#2a4a6a", transition: "all 0.15s",
          }}>
            ~ Real World
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 0, border: "1px solid #1a3a5c" }}>
            {["weekly", "monthly", "yearly"].map(m => (
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

        {/* Row 2: Historical + Invest/yr */}
        <div style={{ display: "flex", gap: 0, alignItems: "center", marginBottom: isMobile ? "0.4rem" : "0.8rem", flexWrap: "wrap", rowGap: 6 }}>
          <span style={{ fontSize: "0.72rem", color: "#2a4a6a", marginRight: 8, fontFamily: "Georgia, serif" }}>
            Historical:
          </span>
          {[{ l: "Off", v: 0 }, { l: "5Y", v: 5 }, { l: "10Y", v: 10 }, { l: "15Y", v: 15 }, { l: "20Y", v: 20 }].map(opt => (
            <button key={opt.v} onClick={() => setHistRange(opt.v)} style={{
              padding: "4px 10px", border: "1px solid #1a3a5c", cursor: "pointer",
              fontSize: "0.75rem", fontWeight: 600, fontFamily: "'EB Garamond', Georgia, serif",
              background: histRange === opt.v ? "#1a7a3a" : "transparent",
              color: histRange === opt.v ? "#ffffff" : "#2a4a6a",
              marginRight: -1, transition: "all 0.15s",
            }}>
              {opt.l}
            </button>
          ))}
          <span style={{ fontSize: "0.72rem", color: "#2a4a6a", margin: "0 8px 0 16px", fontFamily: "Georgia, serif" }}>
            Invest/yr:
          </span>
          {[{ l: "None", v: 0 }, { l: "$5k", v: 5000 }, { l: "$10k", v: 10000 }, { l: "$25k", v: 25000 }].map(c => (
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
              marginLeft: -1 }}
          />
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

            // Colors: historical = green (base dark, DRIP bright), projected = blue
            let bottomFill, topFill;
            if (bar.isHistorical) {
              if (isHov) { bottomFill = "#b0e8b0"; topFill = "#ffffff"; }
              else if (hovered != null && i > hovered) { bottomFill = "#0a1a10"; topFill = "#081208"; }
              else if (hovered != null) { bottomFill = "#1e5a28"; topFill = "#60e850"; }
              else { bottomFill = "#1e5a28"; topFill = "#60e850"; }
            } else {
              if (isHov) { bottomFill = "#c8dff0"; topFill = "#ffffff"; }
              else if (hovered != null && i > hovered) { bottomFill = "#0f1e30"; topFill = "#0a1520"; }
              else if (hovered != null) { bottomFill = "#1a3a5c"; topFill = "#3a9aff"; }
              else { bottomFill = "#1a3a5c"; topFill = "#3a9aff"; }
            }

            const bottomBarH = showStack ? noDripH : totalH;
            const topBarH = showStack ? bonusH : 0;

            return (
              <g key={i}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => setHovered(prev => prev === i ? null : i)}
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
            // Thin labels when too many bars
            if (barCount > 800 && bar.year % 5 !== 0 && !bar.isCurrent) return null;
            if (barCount > 300 && bar.year % 2 !== 0 && !bar.isCurrent) return null;
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
                onClick={() => setDivHovered(prev => prev === i ? null : i)}
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

function StatCard({ label, value, sub, color, last, compact }) {
  return (
    <div style={{
      padding: compact ? "0.5rem 0.5rem" : "1rem 1.2rem", border: "1px solid #1a3a5c",
      marginRight: last ? 0 : -1, marginBottom: -1,
    }}>
      <div style={{ fontSize: compact ? "0.45rem" : "0.55rem", color: "#2a4a6a", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: compact ? "0.2rem" : "0.4rem", fontFamily: "system-ui" }}>
        {label}
      </div>
      <div style={{ fontSize: compact ? "0.95rem" : "1.45rem", fontWeight: 700, color: color || "#c8dff0", lineHeight: 1, fontFamily: "'Playfair Display', Georgia, serif" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: compact ? "0.6rem" : "0.7rem", color: "#2a4a6a", marginTop: "0.3rem", fontFamily: "Georgia, serif" }}>
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
