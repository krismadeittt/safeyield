import React, { useState, useEffect, useMemo } from 'react';
import { fetchSingleFundamentals } from '../api/fundamentals';
import { fetchHistory } from '../api/history';
import { getTaxClass } from '../data/taxData';
import { projectGrowth, projectSteady, projectLinearTrend } from '../utils/projections';
import FinancialMetricChart from '../components/charts/FinancialMetricChart';
import { MONTHLY_PAYERS, QUARTERLY_ETFS } from '../data/dividendCalendar';
import Fundamentals from './Fundamentals';
import useIsMobile from '../hooks/useIsMobile';

const PROJ_YEARS = 10;

function fmtB(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

function fmtPct(v) {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

function fmtDollar(v) {
  if (v == null) return '—';
  return `$${v.toFixed(2)}`;
}

function fmtShares(v) {
  if (v == null) return '—';
  if (v >= 1000) return `${(v / 1000).toFixed(2)}B`;
  return `${v.toFixed(0)}M`;
}

/**
 * Aggregate per-payment dividend data into annual DPS.
 * Input: [{ d: "2024-01-15", v: 0.95 }, ...]
 * Output: [{ date: "2024-01-01", value: 3.80 }, ...] (summed per year)
 */
function aggregateAnnualDividends(divHistory) {
  if (!divHistory?.length) return [];
  const byYear = {};
  divHistory.forEach(div => {
    const year = div.d.substring(0, 4);
    byYear[year] = (byYear[year] || 0) + div.v;
  });
  return Object.entries(byYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, total]) => ({
      date: `${year}-01-01`,
      value: parseFloat(total.toFixed(4)),
    }));
}

/**
 * Compute historical yield per year from dividend + price data.
 * Uses year-end closing price and annual dividend total.
 */
function computeAnnualYield(divHistory, priceHistory) {
  if (!divHistory?.length || !priceHistory?.length) return [];
  // Annual dividends
  const divByYear = {};
  divHistory.forEach(div => {
    const year = div.d.substring(0, 4);
    divByYear[year] = (divByYear[year] || 0) + div.v;
  });
  // Year-end prices (last price entry per year)
  const priceByYear = {};
  priceHistory.forEach(p => {
    const year = p.d.substring(0, 4);
    priceByYear[year] = p.c || p.ac || 0;
  });
  return Object.entries(divByYear)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, divTotal]) => {
      const yearPrice = priceByYear[year];
      if (!yearPrice || yearPrice <= 0) return null;
      return {
        date: `${year}-01-01`,
        value: parseFloat(((divTotal / yearPrice) * 100).toFixed(2)),
      };
    })
    .filter(Boolean);
}

export default function StockDetail({ stock, live, loading, onBack }) {
  const isMobile = useIsMobile();
  const [fd, setFd] = useState(null);
  const [fdLoading, setFdLoading] = useState(true);
  const [histData, setHistData] = useState(null);

  const data = live || stock;
  const price = data.price || 0;
  const yld = data.divYield ?? stock.yld ?? 0;
  const annualDiv = data.annualDiv ?? stock.div ?? 0;
  const rawPayout = data.payout ?? fd?.payout ?? stock.payout ?? null;
  const fcfPayout = fd?.fcfPayout ?? null;
  const payout = (rawPayout != null && rawPayout <= 100) ? rawPayout
    : (fcfPayout != null) ? fcfPayout : rawPayout;
  const g5 = live?.g5 ?? fd?.g5 ?? stock.g5 ?? 0;
  const taxClass = getTaxClass(stock.ticker);

  // Fetch fundamentals + real history in parallel
  useEffect(() => {
    setFdLoading(true);
    setHistData(null);

    Promise.all([
      fetchSingleFundamentals(stock.ticker).catch(() => null),
      fetchHistory(stock.ticker).catch(() => null),
    ]).then(([fdData, hist]) => {
      setFd(fdData);
      setHistData(hist);
      setFdLoading(false);
    });
  }, [stock.ticker]);

  const isETF = fd?.isETF;
  const ah = fd?.annualHistory;
  const hasFinancials = ah && !isETF;
  // --- Per-share returns projection (quarterly or monthly bars) ---
  const returnsProjection = useMemo(() => {
    if (annualDiv <= 0 || price <= 0) return null;
    const isMonthly = MONTHLY_PAYERS.has(stock.ticker) && !QUARTERLY_ETFS.has(stock.ticker);
    const periodsPerYear = isMonthly ? 12 : 4;
    const periodDiv = annualDiv / periodsPerYear;
    const currentYear = new Date().getFullYear();
    const divGrowth = g5 / 100;

    // Current period as historical reference (green bar)
    const hist = [{ date: `${currentYear}-01-01`, value: parseFloat(periodDiv.toFixed(4)) }];

    // Project 10 years of per-period dividends growing at g5
    const proj = [];
    const totalPeriods = periodsPerYear * PROJ_YEARS;
    for (let i = 1; i <= totalPeriods; i++) {
      const yearsAhead = i / periodsPerYear;
      const growthFactor = Math.pow(1 + divGrowth, yearsAhead);
      const futureDiv = periodDiv * growthFactor;
      const year = currentYear + Math.ceil(i / periodsPerYear);
      const periodInYear = ((i - 1) % periodsPerYear) + 1;
      const month = isMonthly ? periodInYear : (periodInYear - 1) * 3 + 1;
      proj.push({
        date: `${year}-${String(month).padStart(2, '0')}-01`,
        value: parseFloat(futureDiv.toFixed(4)),
      });
    }

    // Summary stats
    const yr1Income = annualDiv;
    const yr10Income = annualDiv * Math.pow(1 + divGrowth, 10);
    let totalIncome = 0;
    for (let yr = 0; yr < PROJ_YEARS; yr++) {
      totalIncome += annualDiv * Math.pow(1 + divGrowth, yr);
    }
    // Price projection: share price grows ~g5 long-term (Gordon Growth Model)
    const yr10Price = price * Math.pow(1 + divGrowth, 10);

    return { hist, proj, yr1Income, yr10Income, totalIncome, yr10Price, isMonthly };
  }, [annualDiv, price, g5, stock.ticker]);

  // --- DPS chart from REAL dividend history ---
  const dpsSeries = useMemo(() => {
    if (annualDiv <= 0) return null;
    const realDivs = aggregateAnnualDividends(histData?.d);
    const currentYear = new Date().getFullYear();

    // Filter out current partial year if it looks incomplete
    const hist = realDivs.filter(d => {
      const yr = parseInt(d.date.substring(0, 4));
      return yr < currentYear;
    });

    // Add current year with known annual div
    hist.push({ date: `${currentYear}-01-01`, value: annualDiv });

    // Project forward with g5 growth
    const proj = [];
    for (let i = 1; i <= PROJ_YEARS; i++) {
      proj.push({
        date: `${currentYear + i}-01-01`,
        value: parseFloat((annualDiv * Math.pow(1 + g5 / 100, i)).toFixed(4)),
      });
    }

    return { hist, proj };
  }, [annualDiv, g5, histData]);

  // --- Yield chart from REAL data ---
  const yieldSeries = useMemo(() => {
    if (yld <= 0) return null;
    const realYields = computeAnnualYield(histData?.d, histData?.p);
    const currentYear = new Date().getFullYear();

    const hist = realYields.filter(d => {
      const yr = parseInt(d.date.substring(0, 4));
      return yr < currentYear;
    });
    // Add current yield
    hist.push({ date: `${currentYear}-01-01`, value: yld });

    // Project steady (yield tends to stay in a range for dividend growers)
    const proj = projectSteady(yld, PROJ_YEARS);

    return { hist, proj };
  }, [yld, histData]);

  // --- Annual financial charts ---
  const revenueChart = useMemo(() => {
    if (!hasFinancials || !ah.revenue?.length) return null;
    const last = ah.revenue[ah.revenue.length - 1].value;
    const rate = fd.salesGrowth || 5;
    return { hist: ah.revenue, proj: projectGrowth(last, rate, PROJ_YEARS) };
  }, [hasFinancials, ah, fd]);

  const epsChart = useMemo(() => {
    if (!hasFinancials || !ah.eps?.length) return null;
    const last = ah.eps[ah.eps.length - 1].value;
    const rate = fd.epsGrowth || 5;
    return { hist: ah.eps, proj: projectGrowth(last, rate, PROJ_YEARS) };
  }, [hasFinancials, ah, fd]);

  const fcfChart = useMemo(() => {
    if (!hasFinancials || !ah.fcf?.length) return null;
    const last = ah.fcf[ah.fcf.length - 1].value;
    const rate = fd.salesGrowth || 5;
    return { hist: ah.fcf, proj: projectGrowth(last, rate, PROJ_YEARS) };
  }, [hasFinancials, ah, fd]);

  const debtChart = useMemo(() => {
    if (!hasFinancials || !ah.netDebt?.length) return null;
    const last = ah.netDebt[ah.netDebt.length - 1].value;
    return { hist: ah.netDebt, proj: projectSteady(last, PROJ_YEARS) };
  }, [hasFinancials, ah]);

  const sharesChart = useMemo(() => {
    if (!hasFinancials || !ah.shares?.length) return null;
    return { hist: ah.shares, proj: projectLinearTrend(ah.shares, PROJ_YEARS) };
  }, [hasFinancials, ah]);

  const opMarginChart = useMemo(() => {
    if (!hasFinancials || !ah.margins?.length) return null;
    const hist = ah.margins.filter(m => m.opMargin != null).map(m => ({
      date: m.date, value: m.opMargin,
    }));
    if (!hist.length) return null;
    const last = hist[hist.length - 1].value;
    return { hist, proj: projectSteady(last, PROJ_YEARS) };
  }, [hasFinancials, ah]);

  const netMarginChart = useMemo(() => {
    if (!hasFinancials || !ah.margins?.length) return null;
    const hist = ah.margins.filter(m => m.netMargin != null).map(m => ({
      date: m.date, value: m.netMargin,
    }));
    if (!hist.length) return null;
    const last = hist[hist.length - 1].value;
    return { hist, proj: projectSteady(last, PROJ_YEARS) };
  }, [hasFinancials, ah]);

  const roeChart = useMemo(() => {
    if (!hasFinancials || !ah.roe?.length) return null;
    const last = ah.roe[ah.roe.length - 1].value;
    return { hist: ah.roe, proj: projectSteady(last, PROJ_YEARS) };
  }, [hasFinancials, ah]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "0.5rem" : "1rem" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: isMobile ? 10 : 16, marginBottom: "1.5rem",
        flexDirection: isMobile ? "column" : "row",
      }}>
        <button onClick={onBack} style={{
          background: "none", border: "1px solid #0a1e30", color: "#5aaff8",
          padding: "6px 16px", cursor: "pointer", fontSize: "0.85rem",
        }}>
          ← Back
        </button>
        <div>
          <span style={{
            fontSize: "1.5rem", fontWeight: 700, color: "#c8dff0",
            fontFamily: "'Playfair Display', Georgia, serif",
          }}>
            {stock.ticker}
          </span>
          <span style={{ color: "#7a9ab8", marginLeft: 12 }}>
            {data.name || stock.name}
          </span>
        </div>
      </div>

      {/* Key metrics */}
      <div style={{
        display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(auto-fit, minmax(120px, 1fr))",
        gap: isMobile ? 4 : 8, marginBottom: "1.5rem",
      }}>
        {[
          { label: "Price", value: `$${price.toFixed(2)}` },
          { label: "Yield", value: yld > 0 ? `${yld.toFixed(2)}%` : "—" },
          { label: "Annual Div/Share", value: annualDiv > 0 ? `$${annualDiv.toFixed(2)}` : "—" },
          { label: "Payout Ratio", value: payout != null ? `${payout}%` : "—" },
          { label: "5Y Growth", value: `${g5}%` },
          { label: "Streak", value: stock.streak != null ? `${stock.streak}yr` : "—" },
          { label: "Tax Class", value: taxClass },
        ].map(m => (
          <div key={m.label} style={{
            background: "#0a1628", border: "1px solid #0a1e30", padding: "0.8rem",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: "0.5rem", color: "#1a4060", letterSpacing: "0.15em",
              textTransform: "uppercase", marginBottom: 2,
            }}>
              {m.label}
            </div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "#c8dff0" }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {fdLoading && (
        <div style={{ textAlign: "center", padding: "2rem", color: "#2a4a6a" }}>
          Loading financial data...
        </div>
      )}

      {/* ===== PER-SHARE INCOME PROJECTION ===== */}
      {returnsProjection && (
        <FinancialMetricChart
          title={`${stock.ticker} — Per-Share Income Projection`}
          subtitle={`${returnsProjection.isMonthly ? 'Monthly' : 'Quarterly'} dividends · ${g5}% annual growth · 10-year forecast`}
          statCards={[
            { label: "Current Div/Share", value: `$${annualDiv.toFixed(2)}/yr`, color: "#2a8a3a" },
            { label: "Yr 10 Div/Share", value: `$${returnsProjection.yr10Income.toFixed(2)}/yr`, color: "#3a9aff" },
            { label: "10yr Total Income", value: `$${returnsProjection.totalIncome.toFixed(2)}`, color: "#5aaff8" },
            { label: "Yr 10 Price Est.", value: `$${returnsProjection.yr10Price.toFixed(2)}`, color: "#c8dff0" },
          ]}
          historicalData={returnsProjection.hist}
          projectedData={returnsProjection.proj}
          formatValue={v => `$${Number(v).toFixed(3)}`}
          height={260}
        />
      )}

      {/* ===== DIVIDEND CHARTS (real data) ===== */}
      {dpsSeries && (
        <FinancialMetricChart
          title="Dividend Per Share"
          subtitle={`Real dividend history · ${g5}% projected growth`}
          statCards={[
            { label: "Current DPS", value: `$${annualDiv.toFixed(2)}`, color: "#2a8a3a" },
            { label: "Yield", value: yld > 0 ? `${yld.toFixed(2)}%` : "—", color: "#5aaff8" },
            { label: "5Y Growth", value: `${g5}%`, color: "#c8dff0" },
          ]}
          historicalData={dpsSeries.hist}
          projectedData={dpsSeries.proj}
          formatValue={v => `$${Number(v).toFixed(2)}`}
          height={220}
        />
      )}

      {yieldSeries && (
        <FinancialMetricChart
          title="Dividend Yield"
          subtitle="Real historical yield · projected steady"
          statCards={[
            { label: "Current Yield", value: `${yld.toFixed(2)}%`, color: "#2a8a3a" },
            { label: "Payout", value: payout != null ? `${payout}%` : "—", color: "#c8dff0" },
          ]}
          historicalData={yieldSeries.hist}
          projectedData={yieldSeries.proj}
          formatValue={v => `${Number(v).toFixed(2)}%`}
          height={200}
        />
      )}

      {/* ===== FINANCIAL CHARTS (stocks only) ===== */}
      {revenueChart && (
        <FinancialMetricChart
          title="Revenue"
          subtitle={`Annual · ${fd.salesGrowth != null ? fd.salesGrowth + '% YoY growth' : 'projected'}`}
          statCards={[
            { label: "Revenue (TTM)", value: fmtB(fd.revenue), color: "#2a8a3a" },
            { label: "Sales Growth", value: fmtPct(fd.salesGrowth), color: "#5aaff8" },
            { label: "Market Cap", value: fd.marketCap ? `$${fd.marketCap}B` : "—", color: "#c8dff0" },
          ]}
          historicalData={revenueChart.hist}
          projectedData={revenueChart.proj}
          formatValue={fmtB}
          height={240}
        />
      )}

      {epsChart && (
        <FinancialMetricChart
          title="Earnings Per Share"
          subtitle={`Annual · ${fd.epsGrowth != null ? fd.epsGrowth + '% YoY growth' : 'projected'}`}
          statCards={[
            { label: "EPS (Diluted)", value: fmtDollar(fd.eps), color: "#2a8a3a" },
            { label: "EPS Growth", value: fmtPct(fd.epsGrowth), color: "#5aaff8" },
            { label: "Payout", value: payout != null ? `${payout}%` : "—", color: "#c8dff0" },
          ]}
          historicalData={epsChart.hist}
          projectedData={epsChart.proj}
          formatValue={fmtDollar}
          height={220}
        />
      )}

      {fcfChart && (
        <FinancialMetricChart
          title="Free Cash Flow"
          subtitle="Annual · Operating cash flow minus capital expenditures"
          statCards={[
            { label: "FCF (TTM)", value: fmtB(fd.fcfTTM), color: "#2a8a3a" },
            { label: "FCF/Share", value: fd.fcfPerShare != null ? fmtDollar(fd.fcfPerShare) : "—", color: "#5aaff8" },
            { label: "FCF Margin", value: fmtPct(fd.fcfMargin), color: "#c8dff0" },
            { label: "FCF Payout", value: fmtPct(fd.fcfPayout), color: "#c8dff0" },
          ]}
          historicalData={fcfChart.hist}
          projectedData={fcfChart.proj}
          formatValue={fmtB}
          height={240}
        />
      )}

      {/* Margins & Returns — 3 mini charts in a grid */}
      {(opMarginChart || netMarginChart || roeChart) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(300px, 1fr))",
          gap: isMobile ? 0 : "0 1rem",
        }}>
          {opMarginChart && (
            <FinancialMetricChart
              title="Operating Margin"
              statCards={[
                { label: "Current", value: fmtPct(fd.opMargin), color: "#2a8a3a" },
              ]}
              historicalData={opMarginChart.hist}
              projectedData={opMarginChart.proj}
              formatValue={v => `${Number(v).toFixed(1)}%`}
              height={180}
            />
          )}
          {netMarginChart && (
            <FinancialMetricChart
              title="Net Margin"
              statCards={[
                { label: "Current", value: fmtPct(fd.profitMargin), color: "#2a8a3a" },
              ]}
              historicalData={netMarginChart.hist}
              projectedData={netMarginChart.proj}
              formatValue={v => `${Number(v).toFixed(1)}%`}
              height={180}
            />
          )}
          {roeChart && (
            <FinancialMetricChart
              title="Return on Equity"
              statCards={[
                { label: "Current ROE", value: fmtPct(fd.roe), color: "#2a8a3a" },
                { label: "ROA", value: fmtPct(fd.roa), color: "#c8dff0" },
              ]}
              historicalData={roeChart.hist}
              projectedData={roeChart.proj}
              formatValue={v => `${Number(v).toFixed(1)}%`}
              height={180}
            />
          )}
        </div>
      )}

      {debtChart && (
        <FinancialMetricChart
          title="Net Debt"
          subtitle="Annual · Total debt minus cash"
          statCards={[
            { label: "Net Debt", value: fmtB(fd.netDebt), color: fd.netDebt > 0 ? "#c85a5a" : "#2a8a3a" },
            { label: "Debt/EBITDA", value: fd.netDebtToEbitda != null ? `${fd.netDebtToEbitda.toFixed(1)}x` : "—", color: "#c8dff0" },
            { label: "Int. Coverage", value: fd.interestCoverage != null ? `${fd.interestCoverage.toFixed(1)}x` : "—", color: "#c8dff0" },
          ]}
          historicalData={debtChart.hist}
          projectedData={debtChart.proj}
          formatValue={fmtB}
          height={220}
        />
      )}

      {sharesChart && (
        <FinancialMetricChart
          title="Shares Outstanding"
          subtitle="Annual · Linear trend projection"
          statCards={[
            { label: "Current", value: fd.sharesOut ? fmtShares(fd.sharesOut) : "—", color: "#5aaff8" },
          ]}
          historicalData={sharesChart.hist}
          projectedData={sharesChart.proj}
          formatValue={v => fmtShares(v)}
          height={200}
        />
      )}

      {/* Fundamentals table (at bottom) */}
      <div style={{ marginTop: "1rem" }}>
        <Fundamentals fd={fd} loading={fdLoading} />
      </div>
    </div>
  );
}
