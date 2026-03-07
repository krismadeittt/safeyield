import React, { useState, useRef, useEffect, useMemo } from 'react';
import { formatCurrency, shortMoney } from '../../utils/format';
import { fetchBatchHistory, calcHistoricalPortfolioValues, calcHistoricalDividendsByYear, calcDividendsByPeriod } from '../../api/history';
import useIsMobile from '../../hooks/useIsMobile';
import ChartBars from './chart/ChartBars';
import ChartScrubber from './chart/ChartScrubber';
import useChartZoom from './chart/useChartZoom';

const HORIZONS = [1, 5, 10, 15, 25, 30, 40, 50];


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
  snapshots, inceptionDate,
}) {
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const [width, setWidth] = useState(isMobile ? 340 : 800);
  const [hovered, setHovered] = useState(null);
  const [divHovered, setDivHovered] = useState(null);
  const [historyMap, setHistoryMap] = useState({});
  const [histLoading, setHistLoading] = useState(false);
  const [showDivReturn, setShowDivReturn] = useState(true);
  const [histRange, setHistRange] = useState(10);
  const [dataSource, setDataSource] = useState('backtest'); // 'tracked' | 'backtest'

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
  const currentMonth = new Date().getMonth(); // 0=Jan, 11=Dec
  const projYears = horizon;

  // Stabilize anchor value — only update when holdings change, not on every price tick
  const anchorValueRef = useRef(null);
  const prevHoldingsRef = useRef(null);
  const holdingsKey = holdings?.map(h => `${h.ticker}:${h.shares}`).join(',') || '';
  if (holdingsKey !== prevHoldingsRef.current) {
    anchorValueRef.current = portfolioValue;
    prevHoldingsRef.current = holdingsKey;
  }
  const stableAnchor = anchorValueRef.current || portfolioValue;

  const realHistData = useMemo(() => {
    if (dataSource === 'tracked') return null; // Don't compute backtest when in tracked mode
    if (Object.keys(historyMap).length === 0 || histRange === 0) return null;
    return calcHistoricalPortfolioValues(historyMap, holdings, stableAnchor, histRange, granularity);
  }, [historyMap, holdings, stableAnchor, histRange, granularity, dataSource]);

  // Convert snapshot data to chart-compatible format
  const snapshotChartData = useMemo(() => {
    if (!snapshots?.length || dataSource !== 'tracked') return null;
    return snapshots.map(s => ({
      date: s.date,
      year: parseInt(s.date.substring(0, 4)),
      value: s.total_value,
      noDripValue: s.holdings_value, // price-only approximation
      divIncome: s.total_div_income || 0,
    }));
  }, [snapshots, dataSource]);

  // Effective historical data based on data source
  const effectiveHistData = dataSource === 'tracked' ? snapshotChartData : realHistData;

  // Real dividend income from KV history data
  const realDivByYear = useMemo(() => {
    if (Object.keys(historyMap).length === 0) return null;
    return calcHistoricalDividendsByYear(historyMap, holdings);
  }, [historyMap, holdings]);

  // Period-keyed dividend data
  const realDivByPeriod = useMemo(() => {
    if (Object.keys(historyMap).length === 0) return null;
    return calcDividendsByPeriod(historyMap, holdings, granularity);
  }, [historyMap, holdings, granularity]);

  // Derive payment patterns for projections
  const { projMonthlyPattern, projWeeklyPattern, projDailySchedule, projDailyTotal, projDailyDetail } = useMemo(() => {
    const monthly = new Array(12).fill(0);
    const weekly = new Array(52).fill(0);
    const dailySchedule = new Map(); // tradingDayIndex -> aggregate income
    let dailyTotal = 0;
    const dailyDetail = []; // for logging: [{tradingDay, month, dayOfMonth, ticker, income}]
    const daysInMonthArr = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    if (!holdings?.length || Object.keys(historyMap).length === 0) {
      return { projMonthlyPattern: monthly, projWeeklyPattern: weekly, projDailySchedule: dailySchedule, projDailyTotal: 0, projDailyDetail: [] };
    }

    holdings.forEach(h => {
      const hist = historyMap[h.ticker];
      if (!hist?.d?.length || !h.shares) return;

      const recent = [...hist.d].sort((a, b) => a.d.localeCompare(b.d)).slice(-24);

      const monthAmounts = new Map();
      recent.forEach(div => {
        const month = parseInt(div.d.substring(5, 7)) - 1;
        if (!monthAmounts.has(month)) monthAmounts.set(month, []);
        monthAmounts.get(month).push(div.v * h.shares);
      });
      monthAmounts.forEach((amounts, month) => {
        monthly[month] += amounts.reduce((s, v) => s + v, 0) / amounts.length;
      });

      const monthToWeekEntry = new Map();
      recent.forEach(div => {
        const parts = div.d.split('-').map(Number);
        const month = parts[1] - 1;
        const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        const jan1 = new Date(Date.UTC(parts[0], 0, 1));
        const dayOfYear = Math.floor((date - jan1) / 86400000);
        const weekIdx = Math.min(51, Math.floor(dayOfYear / 7));
        monthToWeekEntry.set(month, { week: weekIdx, amount: div.v * h.shares });
      });
      monthToWeekEntry.forEach(({ week, amount }) => {
        weekly[week] += amount;
      });

      // Daily payment schedule: exact day-of-month from last 8 dividends per ticker
      const recentForDaily = recent.slice(-8);
      const monthDays = new Map(); // month -> { days: [], amounts: [] }
      recentForDaily.forEach(div => {
        const m = parseInt(div.d.substring(5, 7)) - 1;
        const d = parseInt(div.d.substring(8, 10));
        if (!monthDays.has(m)) monthDays.set(m, { days: [], amounts: [] });
        monthDays.get(m).days.push(d);
        monthDays.get(m).amounts.push(div.v * h.shares);
      });
      monthDays.forEach(({ days, amounts }, month) => {
        const typicalDay = Math.round(days.reduce((s, d) => s + d, 0) / days.length);
        const avgIncome = amounts.reduce((s, a) => s + a, 0) / amounts.length;
        // Convert (month, typicalDay) to trading day index using same formula as bar generation
        let calDayOfYear = typicalDay - 1; // 0-indexed (Jan 1 = 0)
        for (let m = 0; m < month; m++) calDayOfYear += daysInMonthArr[m];
        const tradingDay = Math.min(251, Math.max(0, Math.floor(calDayOfYear * 252 / 365)));
        const existing = dailySchedule.get(tradingDay) || 0;
        dailySchedule.set(tradingDay, existing + avgIncome);
        dailyTotal += avgIncome;
        dailyDetail.push({ tradingDay, month, dayOfMonth: typicalDay, ticker: h.ticker, income: Math.round(avgIncome) });
      });
    });

    dailyDetail.sort((a, b) => a.tradingDay - b.tradingDay);

    return { projMonthlyPattern: monthly, projWeeklyPattern: weekly, projDailySchedule: dailySchedule, projDailyTotal: dailyTotal, projDailyDetail: dailyDetail };
  }, [holdings, historyMap]);

  // Stat card values
  const finalNoDrip = noDripVals?.[noDripVals.length - 1] || 0;
  const finalDrip = contribVals ? (contribVals[contribVals.length - 1] || 0)
    : (dripVals?.[dripVals.length - 1] || 0);
  const dripAdvantage = finalDrip - finalNoDrip;
  const incomeAtHorizon = divIncomePerYear?.length > 0
    ? Math.round(divIncomePerYear[divIncomePerYear.length - 1])
    : Math.round(totalIncome * Math.pow(1 + (growth || 0) / 100, horizon));

  const effectiveHistYears = (dataSource === 'tracked')
    ? (snapshotChartData && snapshotChartData.length > 1 ? 1 : 0) // Use 1 as truthy marker
    : (histRange > 0 && realHistData && realHistData.length > 1) ? histRange : 0;

  const startingValue = useMemo(() => {
    if (effectiveHistData && effectiveHistData.length > 1) return effectiveHistData[0].value;
    return portfolioValue;
  }, [effectiveHistData, portfolioValue]);
  const startingYear = useMemo(() => {
    if (effectiveHistData && effectiveHistData.length > 1) return effectiveHistData[0].year;
    return currentYear;
  }, [effectiveHistData, currentYear]);

  const growthPct = startingValue > 0 ? ((portfolioValue / startingValue - 1) * 100).toFixed(1) : "0";

  // Build bar data: historical + projected
  const bars = useMemo(() => {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const periodsPerYear = granularity === 'daily' ? 252 : granularity === 'weekly' ? 52 : granularity === 'monthly' ? 12 : 1;
    const result = [];

    if (effectiveHistYears > 0 && effectiveHistData) {
      for (let i = 0; i < effectiveHistData.length; i++) {
        const pt = effectiveHistData[i];
        const date = pt.date;
        const year = pt.year;
        const month = parseInt(date.substring(5, 7)) - 1;
        const day = parseInt(date.substring(8, 10));
        const shortYr = "'" + String(year).slice(2);

        let label, fullLabel, axLabel;
        if (granularity === 'yearly') {
          label = String(year);
          fullLabel = `${year} (${dataSource === 'tracked' ? 'tracked' : 'actual'})`;
          axLabel = shortYr;
        } else if (granularity === 'monthly') {
          label = `${months[month]} ${year}`;
          fullLabel = `${months[month]} ${year} (${dataSource === 'tracked' ? 'tracked' : 'actual'})`;
          axLabel = month === 0 ? `J${shortYr}` : "";
        } else if (granularity === 'daily') {
          label = `${months[month]} ${day}, ${year}`;
          fullLabel = `${date} (${dataSource === 'tracked' ? 'tracked' : 'actual'})`;
          axLabel = (i === 0 || effectiveHistData[i - 1]?.year !== year) ? shortYr : "";
        } else {
          // weekly
          label = `${months[month]} ${day}, ${year}`;
          fullLabel = `${date} (${dataSource === 'tracked' ? 'tracked' : 'actual'})`;
          axLabel = (i === 0 || effectiveHistData[i - 1]?.year !== year) ? shortYr : "";
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
    }

    result.push({
      label: "Now", axisLabel: "Now",
      fullLabel: `${currentYear} (current)`,
      total: portfolioValue, noDrip: portfolioValue,
      dripBonus: 0,
      isHistorical: true, isCurrent: true,
      year: currentYear, periodIndex: 0, yearsFromNow: 0,
    });

    const nowBarIndex = result.length - 1;

    // --- PROJECTED ---
    const simPPY = simPeriodsPerYear || 1;
    const displayPPY = periodsPerYear;
    const dripArr = contribVals || dripVals;
    const maxSimIdx = (noDripVals?.length || 1) - 1;

    function interpSim(arr, simIdx) {
      const lo = Math.floor(simIdx);
      const hi = Math.min(lo + 1, maxSimIdx);
      const frac = simIdx - lo;
      return Math.round((arr?.[lo] || portfolioValue) + ((arr?.[hi] || portfolioValue) - (arr?.[lo] || portfolioValue)) * frac);
    }

    if (granularity === 'yearly') {
      // Yearly: "Now" bar is the current year. Projections start at currentYear+1.
      for (let yr = 1; yr <= projYears; yr++) {
        const simIdx = yr * simPPY;
        const projYear = currentYear + yr;
        const shortYr = "'" + String(projYear).slice(2);
        result.push({
          label: String(projYear), axisLabel: shortYr,
          fullLabel: `${projYear} (projected)`,
          total: interpSim(dripArr, simIdx), noDrip: interpSim(noDripVals, simIdx),
          dripBonus: Math.max(0, interpSim(dripArr, simIdx) - interpSim(noDripVals, simIdx)),
          isHistorical: false, isCurrent: false,
          year: projYear, periodIndex: 0, yearsFromNow: yr,
          fractionalYearsFromNow: yr,
        });
      }
    } else {
      // Monthly/weekly/daily: start from current period within the current year
      let startPeriod, ppy;
      if (granularity === 'monthly') {
        startPeriod = currentMonth; // 0=Jan
        ppy = 12;
      } else if (granularity === 'weekly') {
        const now = new Date();
        const jan1 = new Date(now.getFullYear(), 0, 1);
        startPeriod = Math.floor((now - jan1) / (7 * 86400000));
        ppy = 52;
      } else { // daily
        const now = new Date();
        const jan1 = new Date(now.getFullYear(), 0, 1);
        const dayOfYear = Math.floor((now - jan1) / 86400000);
        startPeriod = Math.floor(dayOfYear * 252 / 365);
        ppy = 252;
      }

      const remainingInYear = ppy - startPeriod;
      const totalPeriods = remainingInYear + (projYears - 1) * ppy;
      // Cap at what simulation data can support
      const maxPeriods = Math.min(totalPeriods, Math.ceil(maxSimIdx * ppy / simPPY));

      for (let i = 0; i < maxPeriods; i++) {
        const absolutePeriod = startPeriod + i;
        const calendarYear = currentYear + Math.floor(absolutePeriod / ppy);
        const periodInYear = absolutePeriod % ppy;
        const fractionalYears = (i + 1) / ppy;
        const simIdx = fractionalYears * simPPY;

        const interpNoDrip = interpSim(noDripVals, simIdx);
        const interpDripVal = interpSim(dripArr, simIdx);
        const shortYr = "'" + String(calendarYear).slice(2);

        let label, fullLabel, axLabel;
        if (granularity === 'monthly') {
          label = `${months[periodInYear]} ${calendarYear}`;
          fullLabel = `${months[periodInYear]} ${calendarYear} (projected)`;
          axLabel = periodInYear === 0 ? `J${shortYr}` : "";
        } else if (granularity === 'daily') {
          const dayLabel = Math.round((periodInYear / 252) * 365);
          const approxMonth = Math.floor(dayLabel / 30.5);
          label = `Day ${periodInYear + 1}, ${calendarYear}`;
          fullLabel = `~${months[Math.min(11, approxMonth)]} ${calendarYear} (projected)`;
          axLabel = periodInYear === 0 ? shortYr : "";
        } else { // weekly
          label = `W${periodInYear + 1} ${calendarYear}`;
          fullLabel = `Week ${periodInYear + 1}, ${calendarYear} (projected)`;
          axLabel = periodInYear === 0 ? shortYr : "";
        }

        result.push({
          label, axisLabel: axLabel, fullLabel,
          total: interpDripVal, noDrip: interpNoDrip,
          dripBonus: Math.max(0, interpDripVal - interpNoDrip),
          isHistorical: false, isCurrent: false,
          year: calendarYear, periodIndex: periodInYear,
          yearsFromNow: Math.max(1, Math.ceil(fractionalYears)),
          fractionalYearsFromNow: fractionalYears,
        });
      }
    }

    return { bars: result, nowBarIndex };
  }, [portfolioValue, projYears, currentYear, currentMonth, effectiveHistData, granularity, noDripVals, dripVals, contribVals, effectiveHistYears, simPeriodsPerYear, dataSource]);

  const { bars: barData, nowBarIndex } = bars;

  // Zoom hook — shared between portfolio value and dividend income charts
  const zoom = useChartZoom(barData.length, granularity, nowBarIndex);

  // Dividend income data
  const divBars = useMemo(() => {
    if (!monthlyData?.length) return [];
    const growthRate = (growth || 5) / 100;
    const expectedAnnual = monthlyData.reduce((s, v) => s + v, 0);

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

    function getPeriodKey(dateStr) {
      if (granularity === 'yearly') return dateStr.substring(0, 4);
      if (granularity === 'monthly') return dateStr.substring(0, 7);
      if (granularity === 'daily') return dateStr; // exact date for daily
      const parts = dateStr.split('-').map(Number);
      const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      const day = d.getUTCDay();
      const mondayOffset = day === 0 ? -6 : 1 - day;
      d.setUTCDate(d.getUTCDate() + mondayOffset);
      return d.toISOString().substring(0, 10);
    }

    const monthlyTotal = projMonthlyPattern.reduce((s, v) => s + v, 0);
    const weeklyTotal = projWeeklyPattern.reduce((s, v) => s + v, 0);
    const displayPeriodsPerYear = granularity === 'daily' ? 252 : granularity === 'weekly' ? 52 : granularity === 'monthly' ? 12 : 1;

    const distributeByPeriod = (annual, periodIndex) => {
      if (granularity === 'monthly' && monthlyTotal > 0) {
        return annual * (projMonthlyPattern[periodIndex] / monthlyTotal);
      } else if (granularity === 'daily' && projDailyTotal > 0) {
        // Place dividend on exact historical payment days per ticker
        const schedIncome = projDailySchedule.get(periodIndex);
        if (!schedIncome) return 0;
        return annual * (schedIncome / projDailyTotal);
      } else if (granularity === 'weekly' && weeklyTotal > 0) {
        return annual * (projWeeklyPattern[periodIndex] / weeklyTotal);
      }
      return annual / displayPeriodsPerYear;
    };

    const result = barData.map(bar => {
      let divIncome;

      // For tracked mode, use snapshot dividend data
      if (dataSource === 'tracked' && bar.isHistorical && !bar.isCurrent && bar.date) {
        // Find matching snapshot
        const snap = snapshots?.find(s => s.date === bar.date);
        divIncome = snap?.total_div_income || 0;
      }
      // Historical from backtest: use actual dividend payment data
      else if (bar.isHistorical && !bar.isCurrent && bar.date && realDivByPeriod && dataSource === 'backtest') {
        const key = getPeriodKey(bar.date);
        divIncome = (realDivByPeriod[key] || 0) * divScale;
      } else {
        if (bar.isCurrent || bar.yearsFromNow === 0) {
          divIncome = expectedAnnual / displayPeriodsPerYear;
        } else if (divIncomePerYear && bar.fractionalYearsFromNow != null) {
          const simYearIdx = Math.min(Math.floor(bar.fractionalYearsFromNow), divIncomePerYear.length - 1);
          if (simYearIdx >= 0) {
            divIncome = distributeByPeriod(divIncomePerYear[simYearIdx], bar.periodIndex);
          } else {
            divIncome = distributeByPeriod(expectedAnnual, bar.periodIndex);
          }
        } else {
          // Fallback for bars without fractionalYearsFromNow (legacy)
          const yearIdx = (bar.yearsFromNow || 1) - 1;
          if (divIncomePerYear && yearIdx >= 0 && yearIdx < divIncomePerYear.length) {
            divIncome = distributeByPeriod(divIncomePerYear[yearIdx], bar.periodIndex);
          } else {
            const growthFactor = Math.pow(1 + growthRate, bar.yearsFromNow || 0);
            divIncome = distributeByPeriod(expectedAnnual * growthFactor, bar.periodIndex);
          }
        }
      }

      return { ...bar, value: Math.max(0, Math.round(divIncome)) };
    });

    // Log first 10 projected daily dividend entries for verification
    if (granularity === 'daily' && projDailyDetail.length > 0) {
      const projected = result.filter(b => !b.isHistorical && !b.isCurrent && b.value > 0).slice(0, 10);
      if (projected.length > 0) {
        console.log('[SafeYield] First 10 projected daily dividends:');
        projected.forEach(b => {
          const approxDate = new Date(Date.UTC(b.year, 0, 1 + Math.round(b.periodIndex * 365 / 252)));
          const dateStr = approxDate.toISOString().substring(0, 10);
          const tickers = projDailyDetail
            .filter(d => d.tradingDay === b.periodIndex)
            .map(d => `${d.ticker}($${d.income})`)
            .join(', ');
          console.log(`  ${dateStr} | periodIdx=${b.periodIndex} | $${b.value} | ${tickers}`);
        });
      }
    }

    return result;
  }, [barData, monthlyData, growth, granularity, realDivByPeriod, realDivByYear, currentYear, divIncomePerYear, projMonthlyPattern, projWeeklyPattern, projDailySchedule, projDailyTotal, projDailyDetail, dataSource, snapshots]);

  // Chart layout
  const padL = isMobile ? 35 : 55;
  const padR = 10;
  const svgW = Math.max(100, width - 48);
  const chartW = svgW - padL - padR;

  // Store chart dimensions for accurate drag/pan calculations
  useEffect(() => {
    zoom.setChartWidth(chartW);
    zoom.setPadL(padL);
  }, [chartW, padL, zoom.setChartWidth, zoom.setPadL]);

  // Visible data range (respecting zoom)
  const visibleBars = zoom.isZoomed
    ? barData.slice(zoom.viewRange[0], zoom.viewRange[1] + 1)
    : barData;
  const visibleDivBars = zoom.isZoomed
    ? divBars.slice(zoom.viewRange[0], zoom.viewRange[1] + 1)
    : divBars;

  const barCount = visibleBars.length || 1;
  const stepW = chartW / barCount;
  const barW = Math.max(2, Math.min(stepW * 0.65, 18));
  const maxVal = Math.max(...visibleBars.map(b => b.total), 1);

  const mainH = 300;
  const mainPadTop = 40;
  const mainPadBot = 4;
  const mainChartH = mainH - mainPadTop - mainPadBot;

  const divH = 120;
  const divPadTop = 4;
  const divPadBot = 24;
  const divChartH = divH - divPadTop - divPadBot;
  const maxDiv = visibleDivBars.length > 0 ? Math.max(...visibleDivBars.map(b => b.value), 1) : 1;

  // NOW divider position within visible range
  const visibleNowIndex = zoom.isZoomed
    ? nowBarIndex - zoom.viewRange[0]
    : nowBarIndex;
  const nowVisible = visibleNowIndex >= 0 && visibleNowIndex < barCount;
  const nowX = nowVisible ? padL + visibleNowIndex * stepW + stepW / 2 : -100;

  // Tooltip data
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
              {dataSource === 'tracked' && inceptionDate && ` · tracking since ${inceptionDate}`}
              {dataSource === 'backtest' && realHistData && " · backtest: if you'd held this portfolio"}
              {histLoading && " · loading..."}
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
          <LegendItem color="var(--chart-hist)" label="Historical" />
          <LegendItem color="var(--chart-proj-bright)" label="Proj DRIP" />
          <LegendItem color="var(--chart-proj)" label="Proj Base" />
        </div>

        {/* Stat cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 8, marginBottom: isMobile ? "0.5rem" : "1rem" }}>
          <StatCard
            label={dataSource === 'tracked' && inceptionDate ? `TRACKING START (${inceptionDate.substring(0, 4)})` : `BACKTEST START (${startingYear})`}
            value={formatCurrency(startingValue)} color="var(--text-sub)" compact={isMobile} borderColor="var(--text-sub)"
          />
          <StatCard label="CURRENT" value={formatCurrency(portfolioValue)} sub={`+${growthPct}%`} color="var(--primary)" compact={isMobile} borderColor="var(--primary)" />
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
            {["daily", "weekly", "monthly", "yearly"].map(m => (
              <button key={m} onClick={() => setGranularity(m)} style={{
                padding: isMobile ? "4px 8px" : "5px 12px", border: "none", fontSize: "0.72rem", fontWeight: 600,
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

        {/* Row 2: Data source + Historical range + Invest/yr */}
        <div style={{ display: "flex", gap: 0, alignItems: "center", marginBottom: isMobile ? "0.4rem" : "0.8rem", flexWrap: "wrap", rowGap: 6 }}>
          {/* Data source toggle: Tracked vs Backtest */}
          <div style={{ display: "inline-flex", background: "var(--bg-pill)", borderRadius: 8, padding: 2, marginRight: 12 }}>
            {[{ l: "Tracked", v: "tracked" }, { l: "Backtest", v: "backtest" }].map(opt => (
              <button key={opt.v} onClick={() => setDataSource(opt.v)} style={{
                padding: "4px 10px", border: "none", fontSize: "0.72rem", fontWeight: 600,
                cursor: "pointer", fontFamily: "'DM Sans', system-ui, sans-serif",
                background: dataSource === opt.v ? "var(--bg-card)" : "transparent",
                color: dataSource === opt.v ? "var(--text-primary)" : "var(--text-muted)",
                borderRadius: 6, transition: "all 0.15s",
                boxShadow: dataSource === opt.v ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}>
                {opt.l}
              </button>
            ))}
          </div>

          {/* Historical range (only for backtest mode) */}
          {dataSource === 'backtest' && (
            <>
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
            </>
          )}

          {/* Zoom reset button */}
          {zoom.isZoomed && (
            <button onClick={zoom.resetZoom} style={{
              padding: "4px 10px", border: "none", cursor: "pointer",
              fontSize: "0.72rem", fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif",
              background: "var(--accent-bg)", color: "var(--primary)",
              borderRadius: 8, marginLeft: 8, transition: "all 0.15s",
            }}>
              Reset Zoom
            </button>
          )}

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
      <div style={{ background: "var(--bg-dark)", borderTop: "1px solid var(--border)", userSelect: 'none' }}
        onMouseDown={zoom.handleMouseDown}
        onMouseMove={zoom.handleMouseMove}
        onMouseUp={zoom.handleMouseUp}
        onMouseLeave={zoom.handleMouseUp}
        onDoubleClick={zoom.handleDoubleClick}
        onTouchStart={zoom.handleTouchStart}
        onTouchMove={zoom.handleTouchMove}
        onTouchEnd={zoom.handleTouchEnd}
      >
        {/* Tooltip area */}
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
              {!hovBar.isHistorical && (
                <span style={{ fontSize: "0.68rem", color: "var(--text-sub)", fontFamily: "'JetBrains Mono', monospace" }}>
                  No DRIP: {formatCurrency(hovBar.noDrip)} | DRIP +{formatCurrency(hovBar.dripBonus)}
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: "0.5rem", color: "var(--text-sub)", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              Portfolio Value {zoom.isZoomed && `(${zoom.visibleCount} of ${barData.length} points)`}
            </span>
          )}
        </div>

        <svg width={svgW} height={mainH} style={{ display: "block", overflow: "hidden" }}>
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

          {/* Chart content — bars */}
          <ChartBars
            data={barData}
            chartW={chartW} chartH={mainChartH}
            padL={padL} padTop={mainPadTop} maxVal={maxVal}
            hovered={hovered} onHover={setHovered} onLeave={() => setHovered(null)}
            showDivReturn={showDivReturn} mode="portfolio" zoom={zoom}
          />

          {/* NOW divider */}
          {nowVisible && (
            <>
              <line x1={nowX} y1={mainPadTop - 8} x2={nowX} y2={mainPadTop + mainChartH + 4}
                stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
              <rect x={nowX - 16} y={mainPadTop - 22} width={32} height={16} rx={4} fill="var(--primary)" />
              <text x={nowX} y={mainPadTop - 11} textAnchor="middle" fontSize="8" fontWeight="700"
                fill="#ffffff" fontFamily="'DM Sans', system-ui, sans-serif">NOW</text>
            </>
          )}

          {/* Hovered bar line */}
          {hovBar && (() => {
            const hovVi = hovered - (zoom.isZoomed ? zoom.viewRange[0] : 0);
            if (hovVi < 0 || hovVi >= barCount) return null;
            const totalH = maxVal > 0 ? (hovBar.total / maxVal) * mainChartH : 0;
            const barY = mainPadTop + mainChartH - totalH;
            const barX = padL + hovVi * stepW + stepW / 2;
            return (
              <line x1={barX} y1={mainPadTop} x2={barX} y2={barY}
                stroke="var(--primary)" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
            );
          })()}

          {/* Drag-to-select overlay */}
          {zoom.selectionPx && (
            <rect x={padL + zoom.selectionPx.x1} y={mainPadTop}
              width={Math.max(0, zoom.selectionPx.x2 - zoom.selectionPx.x1)} height={mainChartH}
              fill="var(--primary)" opacity={0.15} rx={2} />
          )}
        </svg>

        {/* X-axis labels */}
        <svg width={svgW} height={18} style={{ display: "block" }}>
          {visibleBars.map((bar, vi) => {
            if (!bar.axisLabel) return null;
            if (barCount > 800 && bar.year % 5 !== 0 && !bar.isCurrent) return null;
            if (barCount > 300 && bar.year % 2 !== 0 && !bar.isCurrent) return null;
            const x = padL + vi * stepW + stepW / 2;
            const i = (zoom.isZoomed ? zoom.viewRange[0] : 0) + vi;
            return (
              <text key={vi} x={x} y={13}
                textAnchor="middle" fontSize={barCount > 60 ? 6 : 7.5}
                fill={hovered === i ? "var(--primary)" : bar.isCurrent ? "var(--primary)" : "var(--text-sub)"}
                fontWeight={hovered === i || bar.isCurrent ? 700 : 400}
                fontFamily="'JetBrains Mono', monospace">
                {bar.axisLabel}
              </text>
            );
          })}
        </svg>

        {/* Zoom scrubber */}
        <ChartScrubber
          data={barData} viewRange={zoom.viewRange} totalPoints={barData.length}
          onRangeChange={zoom.setScrubberRange} chartW={chartW} padL={padL}
          mode="portfolio"
        />
      </div>

      {/* ==================== DIVIDEND INCOME ==================== */}
      <div style={{ background: "var(--bg-dark)", borderTop: "1px solid var(--border)", marginTop: 8, userSelect: 'none' }}
        onMouseDown={zoom.handleMouseDown}
        onMouseMove={zoom.handleMouseMove}
        onMouseUp={zoom.handleMouseUp}
        onMouseLeave={zoom.handleMouseUp}
        onDoubleClick={zoom.handleDoubleClick}
        onTouchStart={zoom.handleTouchStart}
        onTouchMove={zoom.handleTouchMove}
        onTouchEnd={zoom.handleTouchEnd}
      >
        {/* Tooltip */}
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

        <svg width={svgW} height={divH} style={{ display: "block", overflow: "hidden" }}>
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

          {/* Dividend chart — bars */}
          <ChartBars
            data={divBars}
            chartW={chartW} chartH={divChartH}
            padL={padL} padTop={divPadTop} maxVal={maxDiv}
            hovered={divHovered} onHover={setDivHovered} onLeave={() => setDivHovered(null)}
            mode="dividend" zoom={zoom}
          />

          {nowVisible && (
            <line x1={nowX} y1={0} x2={nowX} y2={divPadTop + divChartH + 4}
              stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
          )}

          {/* Drag-to-select overlay */}
          {zoom.selectionPx && (
            <rect x={padL + zoom.selectionPx.x1} y={divPadTop}
              width={Math.max(0, zoom.selectionPx.x2 - zoom.selectionPx.x1)} height={divChartH}
              fill="var(--primary)" opacity={0.15} rx={2} />
          )}

          {/* X-axis labels for dividend chart */}
          {visibleBars.map((bar, vi) => {
            if (!bar.axisLabel) return null;
            const x = padL + vi * stepW + stepW / 2;
            const i = (zoom.isZoomed ? zoom.viewRange[0] : 0) + vi;
            return (
              <text key={vi} x={x} y={divH - 4}
                textAnchor="middle" fontSize={barCount > 60 ? 5 : 7}
                fill={divHovered === i ? "var(--green)" : bar.isCurrent ? "var(--primary)" : "var(--text-sub)"}
                fontWeight={divHovered === i || bar.isCurrent ? 700 : 400}
                fontFamily="'JetBrains Mono', monospace">
                {bar.axisLabel}
              </text>
            );
          })}
        </svg>

        {/* Zoom scrubber */}
        <ChartScrubber
          data={divBars} viewRange={zoom.viewRange} totalPoints={barData.length}
          onRangeChange={zoom.setScrubberRange} chartW={chartW} padL={padL}
          mode="dividend"
        />
      </div>

      {/* Footer */}
      <div style={{
        padding: "0.5rem 1.5rem", display: "flex", justifyContent: "flex-end",
        borderTop: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: "0.63rem", color: "var(--text-sub)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          {dataSource === 'tracked'
            ? 'Real portfolio snapshots · Gordon model (yield + growth) · divs reinvested at each payment'
            : 'Backtest assumes current holdings held for entire period · Gordon model (yield + growth) · divs reinvested at each payment'
          }
          {zoom.isZoomed && ' · drag chart to select range, double-click to reset'}
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
