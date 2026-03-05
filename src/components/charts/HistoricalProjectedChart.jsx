import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatCurrency, shortMoney } from '../../utils/format';
import { fetchBatchHistory, calcHistoricalPortfolioValues, calcHistoricalDividendsByYear, calcDividendsByPeriod } from '../../api/history';
import useIsMobile from '../../hooks/useIsMobile';

const HORIZONS = [1, 5, 10, 15, 25, 30, 40, 50];
const CONTRIBUTIONS = [0, 1000, 5000, 10000, 20000, 25000, 50000];


export default function HistoricalProjectedChart({
  portfolioValue, avgYield, growth, horizon, setHorizon,
  useVolatility, setUseVolatility,
  extraContrib, setExtraContrib, customContrib, setCustomContrib,
  noDripVals, dripVals, contribVals,
  divIncomePerYear, simPeriodsPerYear,
  totalIncome,
  monthlyData, holdings,
  expanded, setExpanded,
  granularity, setGranularity,
}) {
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const [width, setWidth] = useState(isMobile ? 340 : 800);
  const [hovered, setHovered] = useState(null);
  const [divHovered, setDivHovered] = useState(null);
  const [historyMap, setHistoryMap] = useState({});
  const [histLoading, setHistLoading] = useState(false);
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

  // Step 11: Stabilize anchor value — only update when holdings change, not on every price tick
  const anchorValueRef = useRef(null);
  const prevHoldingsRef = useRef(null);
  const holdingsKey = holdings?.map(h => `${h.ticker}:${h.shares}`).join(',') || '';
  if (holdingsKey !== prevHoldingsRef.current) {
    anchorValueRef.current = portfolioValue;
    prevHoldingsRef.current = holdingsKey;
  }
  const stableAnchor = anchorValueRef.current || portfolioValue;

  const realHistData = useMemo(() => {
    if (Object.keys(historyMap).length === 0 || histRange === 0) return null;
    return calcHistoricalPortfolioValues(historyMap, holdings, stableAnchor, histRange, granularity);
  }, [historyMap, holdings, stableAnchor, histRange, granularity]);

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

  // Derive per-month payment pattern from SAME historyMap used for historical bars.
  // This ensures projected bars mirror the exact same scattered pattern.
  const projMonthlyPattern = useMemo(() => {
    const pattern = new Array(12).fill(0);
    if (!holdings?.length || Object.keys(historyMap).length === 0) return pattern;

    holdings.forEach(h => {
      const hist = historyMap[h.ticker];
      if (!hist?.d?.length || !h.shares) return;

      // Use last 8 dividend payments to determine payment months and typical amounts
      const recent = hist.d.slice(-8);
      const monthAmounts = new Map();
      recent.forEach(div => {
        const month = parseInt(div.d.substring(5, 7)) - 1;
        if (!monthAmounts.has(month)) monthAmounts.set(month, []);
        monthAmounts.get(month).push(div.v * h.shares);
      });

      // Average per-month income for this stock
      monthAmounts.forEach((amounts, month) => {
        const avg = amounts.reduce((s, v) => s + v, 0) / amounts.length;
        pattern[month] += avg;
      });
    });

    // Log payment schedules for verification
    if (holdings?.length && Object.keys(historyMap).length > 0) {
      const logTickers = holdings.slice(0, 3);
      logTickers.forEach(h => {
        const hist = historyMap[h.ticker];
        if (!hist?.d?.length) return;
        const recent = hist.d.slice(-8);
        const months = [...new Set(recent.map(d => parseInt(d.d.substring(5, 7))))].sort((a, b) => a - b);
        const monthNames = months.map(m => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1]);
        console.log(`[DivProjection] ${h.ticker}: pays in ${monthNames.join(', ')} (from last ${recent.length} payments)`);
      });
    }

    return pattern;
  }, [holdings, historyMap]);

  // Stat card values — always use last element (arrays may be sub-annual length in Real World)
  const finalNoDrip = noDripVals?.[noDripVals.length - 1] || 0;
  const finalDrip = contribVals ? (contribVals[contribVals.length - 1] || 0)
    : (dripVals?.[dripVals.length - 1] || 0);
  const dripAdvantage = finalDrip - finalNoDrip;
  // Income at horizon: use MC simulation's actual dividend income (reflects DRIP share growth + dividend growth)
  // Falls back to yield-on-cost compound growth if simulation data unavailable
  const incomeAtHorizon = divIncomePerYear?.length > 0
    ? Math.round(divIncomePerYear[divIncomePerYear.length - 1])
    : Math.round(totalIncome * Math.pow(1 + (growth || 0) / 100, horizon));

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

    // --- PROJECTED --- (simulation arrays are at simPPY resolution; interpolate to display)
    const simPPY = simPeriodsPerYear || 1;
    const displayPPY = periodsPerYear;
    for (let yr = 1; yr <= projYears; yr++) {
      for (let p = 0; p < displayPPY; p++) {
        let interpNoDrip, interpDrip;

        // Simulation arrays are at simPPY resolution (12/yr for both modes).
        // Interpolate to display resolution.
        {
          const fractionalSimIdx = (yr - 1) * simPPY + ((p + 1) / displayPPY) * simPPY;
          const lo = Math.floor(fractionalSimIdx);
          const hi = Math.min(lo + 1, (noDripVals?.length || 1) - 1);
          const frac = fractionalSimIdx - lo;
          interpNoDrip = Math.round((noDripVals?.[lo] || portfolioValue) + ((noDripVals?.[hi] || portfolioValue) - (noDripVals?.[lo] || portfolioValue)) * frac);
          const dripArr = contribVals || dripVals;
          interpDrip = Math.round((dripArr?.[lo] || portfolioValue) + ((dripArr?.[hi] || portfolioValue) - (dripArr?.[lo] || portfolioValue)) * frac);
        }

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
  }, [portfolioValue, projYears, currentYear, realHistData, granularity, noDripVals, dripVals, contribVals, effectiveHistYears, useVolatility, simPeriodsPerYear]);

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

    // Proper weeks-per-month counts so weekly bars sum to the annual total
    const weeklyMonthCounts = granularity === 'weekly'
      ? Array.from({ length: 52 }, (_, w) => Math.min(11, Math.floor((w * 12) / 52)))
          .reduce((acc, m) => { acc[m] += 1; return acc; }, Array(12).fill(0))
      : null;

    return barData.map(bar => {
      let divIncome;

      // Historical: use actual dividend payment data grouped by period
      if (bar.isHistorical && !bar.isCurrent && bar.date && realDivByPeriod) {
        const key = getPeriodKey(bar.date);
        divIncome = (realDivByPeriod[key] || 0) * divScale;
      } else {
        // Projected / current: distribute by actual payment months from historyMap
        // so projected bars mirror the exact same scattered pattern as historical bars.
        const displayPeriodsPerYear = granularity === 'weekly' ? 52 : granularity === 'monthly' ? 12 : 1;
        const yearIdx = (bar.yearsFromNow || 1) - 1;
        const patternTotal = projMonthlyPattern.reduce((s, v) => s + v, 0);

        // Helper: distribute an annual total by the history-derived monthly pattern
        const distributeByMonth = (annual) => {
          if (patternTotal > 0 && granularity === 'monthly') {
            return annual * (projMonthlyPattern[bar.periodIndex] / patternTotal);
          } else if (patternTotal > 0 && granularity === 'weekly') {
            const monthForWeek = Math.min(11, Math.floor(bar.periodIndex * 12 / 52));
            const monthWeight = (projMonthlyPattern[monthForWeek] || 0) / patternTotal;
            const weekSlots = weeklyMonthCounts?.[monthForWeek] || 1;
            return annual * monthWeight / weekSlots;
          }
          return annual / displayPeriodsPerYear;
        };

        if (bar.isCurrent || bar.yearsFromNow === 0) {
          // "Now" bar: show average income level (no month-specific weighting)
          // to avoid a gap between historical and projected
          divIncome = expectedAnnual / displayPeriodsPerYear;
        } else if (divIncomePerYear && yearIdx >= 0 && yearIdx < divIncomePerYear.length) {
          // Use simulation dividends (reflects MC volatility + dividend stress)
          divIncome = distributeByMonth(divIncomePerYear[yearIdx]);
        } else {
          // Fallback: static growth estimate
          const growthFactor = Math.pow(1 + growthRate, bar.yearsFromNow || 0);
          divIncome = distributeByMonth(expectedAnnual * growthFactor);
        }
      }

      return { ...bar, value: Math.max(0, Math.round(divIncome)) };
    });
  }, [barData, monthlyData, growth, granularity, realDivByPeriod, realDivByYear, currentYear, divIncomePerYear, projMonthlyPattern]);

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
    <div ref={containerRef} style={{ background: "var(--bg-card)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
      {/* ==================== HEADER ==================== */}
      <div style={{ padding: isMobile ? "0.8rem 0.8rem 0" : "1.2rem 1.5rem 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.3rem" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              Historical & Projected Income
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-sub)", marginTop: 2, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              {horizon}-yr · {growth.toFixed(1)}% avg div growth · Gordon model (yield + growth)
              {realHistData && " · backtest: if you'd held this portfolio"}{histLoading && " · loading..."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {setExpanded && (
              <button onClick={() => setExpanded(e => !e)} style={{
                background: "var(--bg-pill)", border: "none", cursor: "pointer",
                color: "var(--text-muted)", fontSize: "0.65rem", padding: "4px 10px",
                borderRadius: 6, fontFamily: "'DM Sans', system-ui, sans-serif",
              }}>
                {expanded ? "Collapse" : "Expand"}
              </button>
            )}
            <div style={{
              padding: "6px 14px", background: "var(--accent-bg)", borderRadius: 8,
              fontWeight: 700, fontSize: "0.95rem", color: "var(--primary)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {shortMoney(totalIncome)}/yr
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: isMobile ? 10 : 16, alignItems: "center", margin: "0.8rem 0 0.6rem", flexWrap: "wrap" }}>
          <LegendItem color="var(--chart-hist-bright)" label="Div Return" />
          <LegendItem color="var(--chart-hist)" label="Price" />
          <LegendItem color="var(--chart-proj-bright)" label="Proj DRIP" />
          <LegendItem color="var(--chart-proj)" label="Proj Base" />
        </div>

        {/* Stat cards: STARTING, CURRENT (DRIP), DRIP ADVANTAGE */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 8, marginBottom: isMobile ? "0.5rem" : "1rem" }}>
          <StatCard label={`BACKTEST START (${startingYear})`} value={formatCurrency(startingValue)} color="var(--text-sub)" compact={isMobile} borderColor="var(--text-sub)" />
          <StatCard label="CURRENT (DRIP)" value={formatCurrency(portfolioValue)} sub={`+${growthPct}%`} color="var(--primary)" compact={isMobile} borderColor="var(--primary)" />
          <StatCard label="DRIP ADVANTAGE" value={`+${shortMoney(dripAdvantage)}`} sub={`at ${horizon}Y`} color="var(--green)" compact={isMobile} borderColor="var(--green)" />
          <StatCard label={`INCOME AT ${horizon}Y`} value={`${shortMoney(incomeAtHorizon)}/yr`} sub={`from ${shortMoney(totalIncome)} today`} color="var(--warning)" compact={isMobile} borderColor="var(--warning)" />
        </div>

        {/* Row 1: Horizon + Real World Returns + Granularity */}
        <div style={{ display: "flex", gap: 0, marginBottom: "0.5rem", flexWrap: "wrap", rowGap: 6, alignItems: "center" }}>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)} style={{
              padding: isMobile ? "4px 8px" : "5px 12px", border: "none", cursor: "pointer",
              fontSize: isMobile ? "0.7rem" : "0.78rem", fontWeight: horizon === h ? 600 : 400,
              fontFamily: "'DM Sans', system-ui, sans-serif",
              background: horizon === h ? "var(--primary)" : "var(--bg-pill)",
              color: horizon === h ? "#ffffff" : "var(--text-muted)",
              borderRadius: 8, marginRight: 4, transition: "all 0.15s",
            }}>
              {h}Y
            </button>
          ))}
          <button onClick={() => setUseVolatility(v => !v)} style={{
            padding: isMobile ? "4px 8px" : "5px 12px", border: "none", cursor: "pointer",
            fontSize: isMobile ? "0.7rem" : "0.72rem", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif",
            marginLeft: isMobile ? 6 : 12, borderRadius: 8,
            background: useVolatility ? "var(--accent-bg)" : "var(--bg-pill)",
            color: useVolatility ? "var(--primary)" : "var(--text-muted)", transition: "all 0.15s",
          }}>
            ~ Real World
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ display: "inline-flex", background: "var(--bg-pill)", borderRadius: 8, padding: 2 }}>
            {["weekly", "monthly", "yearly"].map(m => (
              <button key={m} onClick={() => setGranularity(m)} style={{
                padding: "5px 12px", border: "none", fontSize: "0.72rem", fontWeight: 600,
                cursor: "pointer", textTransform: "uppercase",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                background: granularity === m ? "var(--bg-card)" : "transparent",
                color: granularity === m ? "var(--text-primary)" : "var(--text-muted)",
                borderRadius: 6, transition: "all 0.15s",
                boxShadow: granularity === m ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Row 2: Historical + Invest/yr */}
        <div style={{ display: "flex", gap: 0, alignItems: "center", marginBottom: isMobile ? "0.4rem" : "0.8rem", flexWrap: "wrap", rowGap: 6 }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginRight: 8, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            Historical:
          </span>
          {[{ l: "Off", v: 0 }, { l: "5Y", v: 5 }, { l: "10Y", v: 10 }, { l: "15Y", v: 15 }, { l: "20Y", v: 20 }].map(opt => (
            <button key={opt.v} onClick={() => setHistRange(opt.v)} style={{
              padding: "4px 10px", border: "none", cursor: "pointer",
              fontSize: "0.75rem", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif",
              background: histRange === opt.v ? "var(--green)" : "var(--bg-pill)",
              color: histRange === opt.v ? "#ffffff" : "var(--text-muted)",
              borderRadius: 8, marginRight: 4, transition: "all 0.15s",
            }}>
              {opt.l}
            </button>
          ))}
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "0 8px 0 16px", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            Invest/yr:
          </span>
          {[{ l: "None", v: 0 }, { l: "$5k", v: 5000 }, { l: "$10k", v: 10000 }, { l: "$25k", v: 25000 }].map(c => (
            <button key={c.v} onClick={() => { setExtraContrib(c.v); setCustomContrib(""); }} style={{
              padding: "4px 10px", border: "none", cursor: "pointer",
              fontSize: "0.75rem", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif",
              background: extraContrib === c.v && !customContrib ? "var(--primary)" : "var(--bg-pill)",
              color: extraContrib === c.v && !customContrib ? "#ffffff" : "var(--text-muted)",
              borderRadius: 8, marginRight: 4, transition: "all 0.15s",
            }}>
              {c.l}
            </button>
          ))}
          <input placeholder="Custom" value={customContrib}
            onChange={e => setCustomContrib(e.target.value.replace(/[^0-9]/g, ""))}
            style={{ width: 60, padding: "4px 8px", fontSize: "0.75rem", background: "var(--bg-pill)",
              border: "none", color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace",
              borderRadius: 8 }}
          />
        </div>
      </div>

      {/* ==================== PORTFOLIO VALUE CHART ==================== */}
      <div style={{ background: "var(--bg-dark)", borderTop: "1px solid var(--border)" }}>
        {/* Fixed-height tooltip area — prevents jitter */}
        <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 1rem" }}>
          {hovBar ? (
            <div style={{
              background: "var(--bg-card)", border: "1px solid var(--border)", padding: "6px 18px",
              display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2,
              borderRadius: 8,
            }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 600 }}>
                {hovBar.fullLabel}
              </span>
              <span style={{ fontSize: "1rem", color: "var(--primary)", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                {formatCurrency(hovBar.total)}
              </span>
              <span style={{ fontSize: "0.68rem", color: "var(--text-sub)", fontFamily: "'JetBrains Mono', monospace" }}>
                No DRIP: {formatCurrency(hovBar.noDrip)} | DRIP +{formatCurrency(hovBar.dripBonus)}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: "0.5rem", color: "var(--text-sub)", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
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
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="var(--border)" strokeWidth={0.5} />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="var(--text-sub)" fontFamily="'JetBrains Mono', monospace">
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

            // Colors: historical = green, projected = blue (using CSS vars)
            let bottomFill, topFill;
            if (bar.isHistorical) {
              if (isHov) { bottomFill = "var(--chart-hist-bright)"; topFill = "var(--text-primary)"; }
              else if (hovered != null && i > hovered) { bottomFill = "var(--border)"; topFill = "var(--border-dim)"; }
              else { bottomFill = "var(--chart-hist)"; topFill = "var(--chart-hist-bright)"; }
            } else {
              if (isHov) { bottomFill = "var(--chart-proj-bright)"; topFill = "var(--text-primary)"; }
              else if (hovered != null && i > hovered) { bottomFill = "var(--border)"; topFill = "var(--border-dim)"; }
              else { bottomFill = "var(--chart-proj)"; topFill = "var(--chart-proj-bright)"; }
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
                  rx={1}
                />
                {/* Top (DRIP bonus / div return) */}
                {topBarH > 0 && (
                  <rect x={x} y={mainPadTop + mainChartH - bottomBarH - topBarH} width={barW} height={topBarH}
                    fill={topFill}
                    filter={isHov ? "url(#neonGlow)" : undefined}
                    opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.4 : 0.9}
                    rx={1}
                  />
                )}
              </g>
            );
          })}

          {/* NOW divider */}
          <line x1={nowX} y1={mainPadTop - 8} x2={nowX} y2={mainPadTop + mainChartH + 4}
            stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
          <rect x={nowX - 16} y={mainPadTop - 22} width={32} height={16} rx={4} fill="var(--primary)" />
          <text x={nowX} y={mainPadTop - 11} textAnchor="middle" fontSize="8" fontWeight="700"
            fill="#ffffff" fontFamily="'DM Sans', system-ui, sans-serif">NOW</text>

          {/* Hovered bar line */}
          {hovBar && (() => {
            const totalH = maxVal > 0 ? (hovBar.total / maxVal) * mainChartH : 0;
            const barY = mainPadTop + mainChartH - totalH;
            const barX = padL + hovered * stepW + stepW / 2;
            return (
              <line x1={barX} y1={mainPadTop} x2={barX} y2={barY}
                stroke="var(--primary)" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
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
                fill={hovered === i ? "var(--primary)" : bar.isCurrent ? "var(--primary)" : "var(--text-sub)"}
                fontWeight={hovered === i || bar.isCurrent ? 700 : 400}
                fontFamily="'JetBrains Mono', monospace">
                {bar.axisLabel}
              </text>
            );
          })}
        </svg>
      </div>

      {/* ==================== DIVIDEND INCOME (INDEPENDENT) ==================== */}
      <div style={{ background: "var(--bg-dark)", borderTop: "1px solid var(--border)", marginTop: 8 }}>
        {/* Fixed-height tooltip area */}
        <div style={{ height: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 1rem" }}>
          {divHovBar ? (
            <span style={{ fontSize: "0.72rem", fontFamily: "'JetBrains Mono', monospace" }}>
              <span style={{ color: "var(--chart-hist)" }}>{divHovBar.label}</span>
              {" "}<span style={{ color: "var(--green)", fontWeight: 700 }}>${divHovBar.value.toLocaleString()}</span>
            </span>
          ) : (
            <span style={{ fontSize: "0.5rem", color: "var(--text-sub)", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              Dividend Income
            </span>
          )}
        </div>

        <svg width={svgW} height={divH} style={{ display: "block" }}>
          {[0, 0.5, 1].map(pct => {
            const y = divPadTop + divChartH * (1 - pct);
            return (
              <g key={pct}>
                <line x1={padL} y1={y} x2={svgW - padR} y2={y} stroke="var(--border)" strokeWidth={0.5} />
                <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="8" fill="var(--text-sub)" fontFamily="'JetBrains Mono', monospace">
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
            if (isHov) fill = "var(--green)";
            else if (divHovered != null && i > divHovered) fill = "var(--border)";
            else if (divHovered != null) fill = "var(--chart-hist-bright)";
            else fill = bar.isHistorical ? "var(--chart-hist)" : "var(--chart-hist)";

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
                  rx={1}
                />
              </g>
            );
          })}

          <line x1={nowX} y1={0} x2={nowX} y2={divPadTop + divChartH + 4}
            stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />

          {barData.map((bar, i) => {
            if (!bar.axisLabel) return null;
            const x = padL + i * stepW + stepW / 2;
            return (
              <text key={i} x={x} y={divH - 4}
                textAnchor="middle" fontSize={barCount > 60 ? 5 : 7}
                fill={divHovered === i ? "var(--green)" : bar.isCurrent ? "var(--primary)" : "var(--text-sub)"}
                fontWeight={divHovered === i || bar.isCurrent ? 700 : 400}
                fontFamily="'JetBrains Mono', monospace">
                {bar.axisLabel}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Footer */}
      <div style={{
        padding: "0.5rem 1.5rem", display: "flex", justifyContent: "flex-end",
        borderTop: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: "0.63rem", color: "var(--text-sub)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Backtest assumes current holdings held for entire period · Gordon model (yield + growth) · divs reinvested quarterly
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, last, compact, borderColor }) {
  return (
    <div style={{
      padding: compact ? "0.5rem 0.5rem" : "0.8rem 1rem",
      background: "var(--bg-pill)", borderRadius: 8,
      borderLeft: `3px solid ${borderColor || "var(--text-sub)"}`,
    }}>
      <div style={{ fontSize: compact ? "0.45rem" : "0.55rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: compact ? "0.2rem" : "0.35rem", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {label}
      </div>
      <div style={{ fontSize: compact ? "0.95rem" : "1.3rem", fontWeight: 700, color: color || "var(--text-primary)", lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: compact ? "0.6rem" : "0.7rem", color: "var(--text-sub)", marginTop: "0.25rem", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 12, height: 8, background: color, borderRadius: 2 }} />
      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{label}</span>
    </div>
  );
}
