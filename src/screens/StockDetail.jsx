import React, { useState, useEffect, useMemo } from 'react';
import { fetchSingleFundamentals } from '../api/fundamentals';
import { fetchHistory } from '../api/history';
import { getTaxClass } from '../data/taxData';
import { projectGrowth, projectSteady, projectLinearTrend } from '../utils/projections';
import FinancialMetricChart from '../components/charts/FinancialMetricChart';
import { MONTHLY_PAYERS, QUARTERLY_ETFS } from '../data/dividendCalendar';
import Fundamentals from './Fundamentals';
import NaValue from '../components/NaValue';
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
          background: "none", border: "1px solid var(--border-dim)", color: "var(--accent)",
          padding: "6px 16px", cursor: "pointer", fontSize: "0.85rem",
        }}>
          ← Back
        </button>
        <div>
          <span style={{
            fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)",
            fontFamily: "'Playfair Display', Georgia, serif",
          }}>
            {stock.ticker}
          </span>
          <span style={{ color: "var(--text-muted)", marginLeft: 12 }}>
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
          { label: "Yield", value: yld > 0 ? `${yld.toFixed(2)}%` : null, reason: "No yield data" },
          { label: "Annual Div/Share", value: annualDiv > 0 ? `$${annualDiv.toFixed(2)}` : null, reason: "No dividend data" },
          { label: "Payout Ratio", value: payout != null ? `${payout}%` : null, reason: "No payout ratio data" },
          { label: "5Y Growth", value: `${g5}%` },
          { label: "Streak", value: stock.streak != null && stock.streak > 0 ? `${stock.streak}yr` : null, reason: "No streak data" },
          { label: "Tax Class", value: taxClass },
        ].map(m => (
          <div key={m.label} style={{
            background: "var(--bg-card)", border: "1px solid var(--border-dim)", padding: "0.8rem",
            textAlign: "center",
          }}>
            <div style={{
              fontSize: "0.5rem", color: "var(--text-label)", letterSpacing: "0.15em",
              textTransform: "uppercase", marginBottom: 2,
            }}>
              {m.label}
            </div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
              {m.value != null ? m.value : <NaValue reason={m.reason || "Data not available"} />}
            </div>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {fdLoading && (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-dim)" }}>
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
            { label: "10yr Total Income", value: `$${returnsProjection.totalIncome.toFixed(2)}`, color: "var(--accent)" },
            { label: "Yr 10 Price Est.", value: `$${returnsProjection.yr10Price.toFixed(2)}`, color: "var(--text-primary)" },
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
            { label: "Yield", value: yld > 0 ? `${yld.toFixed(2)}%` : "—", color: "var(--accent)" },
            { label: "5Y Growth", value: `${g5}%`, color: "var(--text-primary)" },
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
            { label: "Payout", value: payout != null ? `${payout}%` : "—", color: "var(--text-primary)" },
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
            { label: "Sales Growth", value: fmtPct(fd.salesGrowth), color: "var(--accent)" },
            { label: "Market Cap", value: fd.marketCap ? `$${fd.marketCap}B` : "—", color: "var(--text-primary)" },
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
            { label: "EPS Growth", value: fmtPct(fd.epsGrowth), color: "var(--accent)" },
            { label: "Payout", value: payout != null ? `${payout}%` : "—", color: "var(--text-primary)" },
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
            { label: "FCF/Share", value: fd.fcfPerShare != null ? fmtDollar(fd.fcfPerShare) : "—", color: "var(--accent)" },
            { label: "FCF Margin", value: fmtPct(fd.fcfMargin), color: "var(--text-primary)" },
            { label: "FCF Payout", value: fmtPct(fd.fcfPayout), color: "var(--text-primary)" },
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
                { label: "ROA", value: fmtPct(fd.roa), color: "var(--text-primary)" },
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
            { label: "Debt/EBITDA", value: fd.netDebtToEbitda != null ? `${fd.netDebtToEbitda.toFixed(1)}x` : "—", color: "var(--text-primary)" },
            { label: "Int. Coverage", value: fd.interestCoverage != null ? `${fd.interestCoverage.toFixed(1)}x` : "—", color: "var(--text-primary)" },
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
            { label: "Current", value: fd.sharesOut ? fmtShares(fd.sharesOut) : "—", color: "var(--accent)" },
          ]}
          historicalData={sharesChart.hist}
          projectedData={sharesChart.proj}
          formatValue={v => fmtShares(v)}
          height={200}
        />
      )}

      {/* ── NEW SECTIONS: Valuation, Technicals, Analyst, Earnings, Estimates, Insiders, Holders ── */}

      {/* Valuation Metrics */}
      {fd?.valuation && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", marginBottom: "1rem" }}>
          <div style={{ padding: "1.2rem 1.2rem 0" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif" }}>
              Valuation
            </div>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(4, 1fr)",
            gap: 0, padding: "0.8rem 1.2rem 1.2rem",
          }}>
            {[
              { label: "P/E (TTM)", value: fd.valuation.trailingPE?.toFixed(1) },
              { label: "Forward P/E", value: fd.valuation.forwardPE?.toFixed(1) },
              { label: "PEG Ratio", value: fd.valuation.pegRatio?.toFixed(2) },
              { label: "P/S", value: fd.valuation.priceSales?.toFixed(1) },
              { label: "P/B", value: fd.valuation.priceBook?.toFixed(1) },
              { label: "EV/EBITDA", value: fd.valuation.evToEbitda?.toFixed(1) },
              { label: "EV/Revenue", value: fd.valuation.evToRevenue?.toFixed(1) },
              { label: "Enterprise Value", value: fd.valuation.enterpriseValue ? fmtB(fd.valuation.enterpriseValue) : null },
            ].map((m, i) => (
              <div key={i} style={{ padding: "0.6rem 0.5rem", borderRight: i % (isMobile ? 3 : 4) === (isMobile ? 2 : 3) ? "none" : "1px solid var(--border-accent)" }}>
                <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.25rem", fontFamily: "system-ui" }}>{m.label}</div>
                <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif" }}>{m.value || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 52-Week Range */}
      {fd?.technicals && fd.technicals.week52High && fd.technicals.week52Low && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", padding: "1.2rem", marginBottom: "1rem" }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif", marginBottom: "0.8rem" }}>
            52-Week Range
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.8rem" }}>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", minWidth: 50 }}>${fd.technicals.week52Low.toFixed(2)}</span>
            <div style={{ flex: 1, position: "relative", height: 8, background: "var(--border-accent)", borderRadius: 4 }}>
              {(() => {
                const price = data.price || (fd.technicals.week52High + fd.technicals.week52Low) / 2;
                const pct = ((price - fd.technicals.week52Low) / (fd.technicals.week52High - fd.technicals.week52Low)) * 100;
                return <div style={{
                  position: "absolute", top: -4, width: 16, height: 16, borderRadius: 8,
                  background: "var(--green)", border: "2px solid var(--bg-card)",
                  left: `calc(${Math.min(100, Math.max(0, pct))}% - 8px)`,
                }} />;
              })()}
              <div style={{ position: "absolute", top: 0, left: 0, height: "100%", borderRadius: 4,
                width: `${((data.price || (fd.technicals.week52High + fd.technicals.week52Low) / 2) - fd.technicals.week52Low) / (fd.technicals.week52High - fd.technicals.week52Low) * 100}%`,
                background: "var(--primary)", opacity: 0.4 }} />
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", minWidth: 50, textAlign: "right" }}>${fd.technicals.week52High.toFixed(2)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)", gap: 0 }}>
            {[
              { label: "50-Day MA", value: fd.technicals.ma50 ? `$${fd.technicals.ma50.toFixed(2)}` : "—" },
              { label: "200-Day MA", value: fd.technicals.ma200 ? `$${fd.technicals.ma200.toFixed(2)}` : "—" },
              { label: "Beta", value: fd.technicals.beta?.toFixed(2) || "—" },
              { label: "Short Ratio", value: fd.technicals.shortRatio ? `${fd.technicals.shortRatio} days` : "—" },
            ].map((m, i) => (
              <div key={i} style={{ padding: "0.5rem 0.4rem" }}>
                <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "system-ui" }}>{m.label}</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)" }}>{m.value}</div>
              </div>
            ))}
          </div>
          {fd.technicals.sharesShort != null && (
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 4 }}>
              Short Interest: {(fd.technicals.sharesShort / 1e6).toFixed(1)}M shares ({fd.technicals.shortPercent ? (fd.technicals.shortPercent * 100).toFixed(2) : "—"}% of float)
            </div>
          )}
        </div>
      )}

      {/* Analyst Consensus */}
      {fd?.analyst && fd.analyst.rating != null && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", padding: "1.2rem", marginBottom: "1rem" }}>
          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif", marginBottom: "0.8rem" }}>
            Analyst Consensus
          </div>
          {/* Stacked bar */}
          {(() => {
            const a = fd.analyst;
            const total = (a.strongBuy || 0) + (a.buy || 0) + (a.hold || 0) + (a.sell || 0) + (a.strongSell || 0);
            if (!total) return null;
            const segments = [
              { count: a.strongBuy || 0, color: "#00cc66", label: "Strong Buy" },
              { count: a.buy || 0, color: "#66dd99", label: "Buy" },
              { count: a.hold || 0, color: "#ffaa33", label: "Hold" },
              { count: a.sell || 0, color: "#ff6644", label: "Sell" },
              { count: a.strongSell || 0, color: "#cc3333", label: "Strong Sell" },
            ];
            return (
              <div>
                <div style={{ display: "flex", height: 28, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                  {segments.filter(s => s.count > 0).map((s, i) => (
                    <div key={i} style={{
                      width: `${(s.count / total) * 100}%`, background: s.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.65rem", fontWeight: 700, color: "#000",
                    }}>
                      {s.count}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                  {segments.filter(s => s.count > 0).map((s, i) => (
                    <span key={i} style={{ fontSize: "0.6rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 3 }}>
                      <span style={{ width: 8, height: 8, background: s.color, display: "inline-block" }} />
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
            <div style={{ padding: "0.5rem 0.4rem" }}>
              <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "system-ui" }}>Rating</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)" }}>{fd.analyst.rating.toFixed(1)}<span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>/5</span></div>
            </div>
            <div style={{ padding: "0.5rem 0.4rem" }}>
              <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "system-ui" }}>Target Price</div>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>${fd.analyst.targetPrice?.toFixed(2) || "—"}</div>
            </div>
            <div style={{ padding: "0.5rem 0.4rem" }}>
              <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "system-ui" }}>Upside</div>
              {(() => {
                const price = data.price;
                const target = fd.analyst.targetPrice;
                if (!price || !target) return <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-muted)" }}>—</div>;
                const upside = ((target - price) / price * 100).toFixed(1);
                return <div style={{ fontSize: "1.1rem", fontWeight: 700, color: parseFloat(upside) > 0 ? "var(--green)" : "var(--red-muted)" }}>{upside > 0 ? "+" : ""}{upside}%</div>;
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Earnings Surprises Chart */}
      {fd?.history?.earningsSurprises?.length > 0 && (
        <EarningsSurprisesChart surprises={fd.history.earningsSurprises} isMobile={isMobile} />
      )}

      {/* Forward Estimates */}
      {fd?.estimates && (fd.estimates.epsCurrentQ || fd.estimates.epsCurrentY) && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", marginBottom: "1rem" }}>
          <div style={{ padding: "1.2rem 1.2rem 0" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif" }}>
              Forward Estimates
            </div>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
            gap: 0, padding: "0.8rem 1.2rem 1.2rem",
          }}>
            {[
              { label: "EPS Est (Current Q)", value: fd.estimates.epsCurrentQ ? `$${fd.estimates.epsCurrentQ.toFixed(2)}` : null },
              { label: "EPS Est (Next Q)", value: fd.estimates.epsNextQ ? `$${fd.estimates.epsNextQ.toFixed(2)}` : null },
              { label: "EPS Est (Current Y)", value: fd.estimates.epsCurrentY ? `$${fd.estimates.epsCurrentY.toFixed(2)}` : null, color: "var(--accent)" },
              { label: "EPS Est (Next Y)", value: fd.estimates.epsNextY ? `$${fd.estimates.epsNextY.toFixed(2)}` : null, color: "var(--accent)" },
              { label: "Rev Est (Current Y)", value: fd.estimates.revCurrentY ? fmtB(fd.estimates.revCurrentY) : null },
              { label: "Rev Est (Next Y)", value: fd.estimates.revNextY ? fmtB(fd.estimates.revNextY) : null },
              { label: "EPS Growth (Current Y)", value: fd.estimates.epsGrowthCurrentY ? `${fd.estimates.epsGrowthCurrentY.toFixed(1)}%` : null, color: "var(--green)" },
              { label: "EPS Growth (Next Y)", value: fd.estimates.epsGrowthNextY ? `${fd.estimates.epsGrowthNextY.toFixed(1)}%` : null, color: "var(--green)" },
            ].map((m, i) => (
              <div key={i} style={{ padding: "0.6rem 0.5rem", borderRight: i % (isMobile ? 2 : 4) === (isMobile ? 1 : 3) ? "none" : "1px solid var(--border-accent)" }}>
                <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.25rem", fontFamily: "system-ui" }}>{m.label}</div>
                <div style={{ fontSize: "0.95rem", fontWeight: 700, color: m.color || "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif" }}>{m.value || "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insider Transactions */}
      {fd?.insiders && fd.insiders.length > 0 && (
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", marginBottom: "1rem" }}>
          <div style={{ padding: "1.2rem" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif", marginBottom: "0.8rem" }}>
              Insider Transactions
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr>
                    {["Date", "Name", "Type", "Price"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border-accent)", color: "var(--text-label)", fontSize: "0.55rem", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "system-ui" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fd.insiders.slice(0, 10).map((t, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-row)" }}>
                      <td style={{ padding: "6px 8px", color: "var(--text-muted)", fontSize: "0.75rem" }}>{t.date}</td>
                      <td style={{ padding: "6px 8px", color: "var(--text-primary)", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</td>
                      <td style={{ padding: "6px 8px", color: t.code === "P" ? "var(--green)" : "var(--red-muted)", fontWeight: 700 }}>
                        {t.code === "P" ? "Buy" : t.code === "S" ? "Sell" : t.code || "—"}
                      </td>
                      <td style={{ padding: "6px 8px", color: "var(--text-primary)" }}>{t.price ? `$${t.price.toFixed(2)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Top Holders */}
      {fd?.holders && (fd.holders.institutions?.length > 0 || fd.holders.funds?.length > 0) && (
        <div style={{
          display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: "1rem", marginBottom: "1rem",
        }}>
          {/* Institutional */}
          {fd.holders.institutions?.length > 0 && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", padding: "1.2rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif", marginBottom: "0.6rem" }}>
                Top Institutional Holders
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Name", "% Owned", "Change"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--border-accent)", color: "var(--text-label)", fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "system-ui" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fd.holders.institutions.map((h, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-row)" }}>
                      <td style={{ padding: "4px 6px", color: "var(--text-primary)", fontSize: "0.7rem", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</td>
                      <td style={{ padding: "4px 6px", color: "var(--accent)", fontSize: "0.75rem", fontWeight: 600 }}>{h.pct?.toFixed(2) || "—"}%</td>
                      <td style={{ padding: "4px 6px", fontSize: "0.75rem", fontWeight: 600, color: (h.change || 0) > 0 ? "var(--green)" : (h.change || 0) < 0 ? "var(--red-muted)" : "var(--text-muted)" }}>
                        {h.change != null ? `${h.change > 0 ? "+" : ""}${h.change.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Funds */}
          {fd.holders.funds?.length > 0 && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", padding: "1.2rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif", marginBottom: "0.6rem" }}>
                Top Fund Holders
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Fund Name", "% Owned", "Change"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--border-accent)", color: "var(--text-label)", fontSize: "0.5rem", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "system-ui" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fd.holders.funds.map((h, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border-row)" }}>
                      <td style={{ padding: "4px 6px", color: "var(--text-primary)", fontSize: "0.7rem", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</td>
                      <td style={{ padding: "4px 6px", color: "var(--accent)", fontSize: "0.75rem", fontWeight: 600 }}>{h.pct?.toFixed(2) || "—"}%</td>
                      <td style={{ padding: "4px 6px", fontSize: "0.75rem", fontWeight: 600, color: (h.change || 0) > 0 ? "var(--green)" : (h.change || 0) < 0 ? "var(--red-muted)" : "var(--text-muted)" }}>
                        {h.change != null ? `${h.change > 0 ? "+" : ""}${h.change.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Fundamentals table (at bottom) */}
      <div style={{ marginTop: "1rem" }}>
        <Fundamentals fd={fd} loading={fdLoading} />
      </div>
    </div>
  );
}

/* Earnings Surprises custom chart — green for beats, red for misses */
function EarningsSurprisesChart({ surprises, isMobile }) {
  const data = surprises.filter(s => s.surprise != null);
  if (data.length === 0) return null;

  const beats = data.filter(s => s.surprise > 0).length;
  const beatRate = ((beats / data.length) * 100).toFixed(0);
  const avgSurprise = (data.reduce((a, s) => a + s.surprise, 0) / data.length).toFixed(2);
  const latest = data[data.length - 1];

  const svgW = isMobile ? 340 : 600;
  const height = 240;
  const padL = isMobile ? 35 : 55;
  const padR = 10;
  const padTop = 12;
  const padBot = 28;
  const chartW = svgW - padL - padR;
  const chartH = height - padTop - padBot;
  const barCount = data.length;
  const stepW = chartW / barCount;
  const barW = Math.max(3, Math.min(stepW * 0.65, 16));

  const values = data.map(d => d.surprise);
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const range = rawMax - rawMin || 1;
  const maxVal = rawMax + range * 0.08;
  const minVal = rawMin - range * 0.08;
  const totalRange = maxVal - minVal;
  const zeroY = padTop + ((maxVal - 0) / totalRange) * chartH;

  const [hovered, setHovered] = useState(null);

  // Year labels
  const axisLabels = [];
  let lastYear = '';
  data.forEach((d, i) => {
    const yr = d.date.slice(0, 4);
    if (yr !== lastYear) { axisLabels.push({ i, label: yr }); lastYear = yr; }
  });

  const hovBar = hovered != null ? data[hovered] : null;

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", marginBottom: "1rem" }}>
      <div style={{ padding: "1.2rem 1.2rem 0" }}>
        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'Playfair Display', Georgia, serif" }}>
          Earnings Surprises
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: 2, fontFamily: "Georgia, serif", fontStyle: "italic" }}>
          Quarterly EPS actual vs estimate · {data.length} quarters
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(3, 1fr)`, gap: 0, marginTop: "0.8rem" }}>
          {[
            { label: "Last Surprise", value: `${latest.surprise > 0 ? "+" : ""}${latest.surprise}%`, color: latest.surprise > 0 ? "var(--green)" : "var(--red-muted)" },
            { label: "Beat Rate", value: `${beatRate}%`, color: "var(--accent)" },
            { label: "Avg Surprise", value: `${avgSurprise > 0 ? "+" : ""}${avgSurprise}%`, color: parseFloat(avgSurprise) > 0 ? "var(--green)" : "var(--red-muted)" },
          ].map((card, i) => (
            <div key={i} style={{ padding: "0.7rem 0.8rem", border: "1px solid var(--border-accent)", marginRight: i < 2 ? -1 : 0, marginBottom: -1 }}>
              <div style={{ fontSize: "0.5rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.3rem", fontFamily: "system-ui" }}>{card.label}</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: card.color, lineHeight: 1, fontFamily: "'Playfair Display', Georgia, serif" }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      <div style={{ height: 36, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 1rem" }}>
        {hovBar ? (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", padding: "4px 16px", display: "inline-flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-link)", fontFamily: "system-ui", fontWeight: 600 }}>
              {hovBar.date.slice(0, 7)}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "system-ui" }}>
              Est: ${hovBar.epsEstimate.toFixed(2)} → Act: ${hovBar.epsActual.toFixed(2)}
            </span>
            <span style={{ fontSize: "0.95rem", fontWeight: 800, fontFamily: "system-ui", color: hovBar.surprise > 0 ? "var(--green)" : "var(--red-muted)" }}>
              {hovBar.surprise > 0 ? "+" : ""}{hovBar.surprise}%
            </span>
          </div>
        ) : (
          <span style={{ fontSize: "0.5rem", color: "var(--text-label)", letterSpacing: "0.15em", textTransform: "uppercase", fontFamily: "system-ui" }}>
            {isMobile ? "Tap for details" : "Hover for details"}
          </span>
        )}
      </div>

      <svg width={svgW} height={height} style={{ display: "block" }}>
        {/* Zero line */}
        <line x1={padL} y1={zeroY} x2={svgW - padR} y2={zeroY} stroke="var(--border-accent)" strokeWidth={0.8} strokeDasharray="2,2" />

        {/* Bars */}
        {data.map((bar, i) => {
          const x = padL + i * stepW + (stepW - barW) / 2;
          const isHov = hovered === i;
          const val = bar.surprise;
          const isPositive = val >= 0;
          const barH = Math.max(1, (Math.abs(val) / totalRange) * chartH);
          const barY = isPositive ? zeroY - barH : zeroY;
          const fill = isHov ? "#ffffff" : isPositive ? "#2a8a3a" : "#c85a5a";

          return (
            <g key={i} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
              onClick={() => setHovered(prev => prev === i ? null : i)} style={{ cursor: "pointer" }}>
              <rect x={x} y={barY} width={barW} height={barH} fill={fill}
                opacity={hovered != null && !isHov ? 0.4 : 0.85} />
            </g>
          );
        })}

        {/* X-axis labels */}
        {axisLabels.map(({ i, label }) => (
          <text key={i} x={padL + i * stepW + stepW / 2} y={height - 6}
            textAnchor="middle" fontSize={barCount > 30 ? 7 : 8.5}
            fill="var(--text-label)" fontFamily="system-ui">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
