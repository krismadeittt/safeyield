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

function fmtGrowthPct(v) {
  if (v == null) return '—';
  if (Math.abs(v) > 200) return 'N/M';
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

export default function StockDetail({ stock, live, loading, onBack, onMergeLiveData }) {
  const isMobile = useIsMobile();
  const [fd, setFd] = useState(null);
  const [fdLoading, setFdLoading] = useState(true);
  const [histData, setHistData] = useState(null);

  const data = live || stock;
  const price = data.price || 0;
  const yld = (fd?.divYield > 0 ? fd.divYield : null) ?? (data.divYield > 0 ? data.divYield : null) ?? stock.yld ?? 0;
  const annualDiv = (fd?.annualDiv > 0 ? fd.annualDiv : null) ?? (data.annualDiv > 0 ? data.annualDiv : null) ?? stock.div ?? 0;
  const rawPayout = fd?.payout ?? data.payout ?? stock.payout ?? null;
  const fcfPayout = fd?.fcfPayout ?? null;
  const payout = (rawPayout != null && rawPayout <= 100) ? rawPayout
    : (fcfPayout != null) ? fcfPayout : rawPayout;
  const g5 = fd?.g5 ?? live?.g5 ?? stock.g5 ?? 0;
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
      // Write fundamentals back to shared liveData so all views stay in sync
      if (fdData && onMergeLiveData) {
        onMergeLiveData(stock.ticker, {
          divYield: fdData.divYield ?? undefined,
          annualDiv: fdData.annualDiv ?? undefined,
          g5: fdData.g5 ?? undefined,
          streak: fdData.streak ?? undefined,
          payout: fdData.payout ?? undefined,
          fcfPayout: fdData.fcfPayout ?? undefined,
          marketCap: fdData.marketCap ?? undefined,
        });
      }
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
            fontFamily: "'DM Sans', system-ui, sans-serif",
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

      {/* ===== ANALYST CONSENSUS — Score Box (moved to top) ===== */}
      {fd?.analyst && fd.analyst.rating != null && (() => {
        const a = fd.analyst;
        const score = Math.round(((a.rating - 1) / 4) * 100);
        const total = (a.strongBuy || 0) + (a.buy || 0) + (a.hold || 0) + (a.sell || 0) + (a.strongSell || 0);
        const target = a.targetPrice;
        const upside = (data.price && target) ? ((target - data.price) / data.price * 100).toFixed(1) : null;

        const zones = [
          { min: 0, max: 20, label: "Strong Sell", desc: "Analysts strongly advise selling", color: "#cc3333" },
          { min: 21, max: 40, label: "Sell", desc: "Most analysts recommend reducing", color: "#ff6644" },
          { min: 41, max: 60, label: "Hold", desc: "Mixed outlook — hold current position", color: "#ffaa33" },
          { min: 61, max: 80, label: "Buy", desc: "Favorable outlook from analysts", color: "#66dd99" },
          { min: 81, max: 100, label: "Strong Buy", desc: "Analysts strongly recommend buying", color: "#00cc66" },
        ];
        const activeZone = zones.find(z => score >= z.min && score <= z.max) || zones[2];

        return (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", padding: "1.2rem", marginBottom: "1rem" }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif", marginBottom: "1rem" }}>
              Analyst Consensus
            </div>

            {/* Score + zone label */}
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 16 : 24, flexWrap: "wrap", marginBottom: 16 }}>
              <div style={{ textAlign: "center", minWidth: 80 }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%", border: `3px solid ${activeZone.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 4px",
                }}>
                  <span style={{ fontSize: "1.6rem", fontWeight: 800, color: activeZone.color, fontFamily: "'DM Sans', system-ui, sans-serif" }}>{score}</span>
                </div>
                <div style={{ fontSize: "0.75rem", fontWeight: 700, color: activeZone.color, marginTop: 2 }}>
                  {activeZone.label}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 600, marginBottom: 4 }}>
                  {activeZone.desc}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, marginTop: 8 }}>
                  <div style={{ padding: "0.4rem 0" }}>
                    <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "system-ui" }}>Rating</div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--accent)" }}>{a.rating.toFixed(1)}<span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>/5</span></div>
                  </div>
                  <div style={{ padding: "0.4rem 0" }}>
                    <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "system-ui" }}>Target</div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>${target?.toFixed(2) || "—"}</div>
                  </div>
                  <div style={{ padding: "0.4rem 0" }}>
                    <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "system-ui" }}>Upside</div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: upside && parseFloat(upside) > 0 ? "var(--green)" : "var(--red-muted)" }}>
                      {upside ? `${upside > 0 ? "+" : ""}${upside}%` : "—"}
                    </div>
                  </div>
                </div>
                {total > 0 && (
                  <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", marginTop: 6 }}>
                    {a.strongBuy || 0} Strong Buy · {a.buy || 0} Buy · {a.hold || 0} Hold · {a.sell || 0} Sell · {a.strongSell || 0} Strong Sell ({total} analysts)
                  </div>
                )}
              </div>
            </div>

            {/* Zone ranking bar */}
            <div style={{ position: "relative", marginTop: 8 }}>
              <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden" }}>
                {zones.map((z, i) => (
                  <div key={i} style={{
                    flex: 1, background: z.color,
                    opacity: z === activeZone ? 1 : 0.25,
                  }} />
                ))}
              </div>
              {/* Score indicator */}
              <div style={{
                position: "absolute", top: -3, width: 4, height: 16, background: "#fff", borderRadius: 2,
                left: `calc(${Math.min(99, Math.max(1, score))}% - 2px)`,
                boxShadow: "0 0 4px rgba(0,0,0,0.5)",
              }} />
              <div style={{ display: "flex", marginTop: 6 }}>
                {zones.map((z, i) => (
                  <div key={i} style={{
                    flex: 1, textAlign: "center",
                    fontSize: "0.5rem", color: z === activeZone ? z.color : "var(--text-label)",
                    fontWeight: z === activeZone ? 700 : 400,
                    letterSpacing: "0.05em",
                  }}>
                    {z.label}
                    <div style={{ fontSize: "0.4rem", color: "var(--text-label)", fontWeight: 400, marginTop: 1 }}>
                      {z.min}–{z.max}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== DPS + PER-SHARE INCOME PROJECTION — side by side ===== */}
      {(dpsSeries || returnsProjection) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 0 : "0 1rem",
        }}>
          {dpsSeries && (
            <FinancialMetricChart
              title="Dividend Per Share"
              subtitle="Real dividend history"
              statCards={[
                { label: "Current DPS", value: `$${annualDiv.toFixed(2)}`, color: "#2a8a3a" },
                { label: "Yield", value: yld > 0 ? `${yld.toFixed(2)}%` : "—", color: "var(--accent)" },
                { label: "5Y Growth", value: `${g5}%`, color: "var(--text-primary)" },
              ]}
              historicalData={dpsSeries.hist}
              projectedData={[]}
              formatValue={v => `$${Number(v).toFixed(2)}`}
              height={220}
            />
          )}
          {returnsProjection && (
            <FinancialMetricChart
              title={`Per-Share Income Projection`}
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
              height={220}
            />
          )}
        </div>
      )}

      {/* ===== YIELD + REVENUE — side by side ===== */}
      {(yieldSeries || revenueChart) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 0 : "0 1rem",
        }}>
          {yieldSeries && (
            <FinancialMetricChart
              title="Dividend Yield"
              subtitle="Real historical yield"
              statCards={[
                { label: "Current Yield", value: `${yld.toFixed(2)}%`, color: "#2a8a3a" },
                { label: "Payout", value: payout != null ? `${payout}%` : "—", color: "var(--text-primary)" },
              ]}
              historicalData={yieldSeries.hist}
              projectedData={[]}
              formatValue={v => `${Number(v).toFixed(2)}%`}
              height={180}
            />
          )}
          {revenueChart && (
            <FinancialMetricChart
              title="Revenue"
              subtitle={`Annual · ${fd.salesGrowth != null ? fd.salesGrowth + '% YoY growth' : ''}`}
              statCards={[
                { label: "Revenue (TTM)", value: fmtB(fd.revenue), color: "#2a8a3a" },
                { label: "Sales Growth", value: fmtPct(fd.salesGrowth), color: "var(--accent)" },
              ]}
              historicalData={revenueChart.hist}
              projectedData={[]}
              formatValue={fmtB}
              height={180}
            />
          )}
        </div>
      )}

      {/* ===== EPS + FCF — side by side ===== */}
      {(epsChart || fcfChart) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 0 : "0 1rem",
        }}>
          {epsChart && (
            <FinancialMetricChart
              title="Earnings Per Share"
              subtitle={`Annual · ${fd.epsGrowth != null ? fmtGrowthPct(fd.epsGrowth) + ' YoY growth' : ''}`}
              statCards={[
                { label: "EPS (Diluted)", value: fmtDollar(fd.eps), color: "#2a8a3a" },
                { label: "EPS Growth", value: fmtGrowthPct(fd.epsGrowth), color: "var(--accent)" },
              ]}
              historicalData={epsChart.hist}
              projectedData={[]}
              formatValue={fmtDollar}
              height={180}
            />
          )}
          {fcfChart && (
            <FinancialMetricChart
              title="Free Cash Flow"
              subtitle="Annual · OCF minus capex"
              statCards={[
                { label: "FCF (TTM)", value: fmtB(fd.fcfTTM), color: "#2a8a3a" },
                { label: "FCF/Share", value: fd.fcfPerShare != null ? fmtDollar(fd.fcfPerShare) : "—", color: "var(--accent)" },
              ]}
              historicalData={fcfChart.hist}
              projectedData={[]}
              formatValue={fmtB}
              height={180}
            />
          )}
        </div>
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
              projectedData={[]}
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
              projectedData={[]}
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
              projectedData={[]}
              formatValue={v => `${Number(v).toFixed(1)}%`}
              height={180}
            />
          )}
        </div>
      )}

      {/* ===== NET DEBT + SHARES — side by side ===== */}
      {(debtChart || sharesChart) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 0 : "0 1rem",
        }}>
          {debtChart && (
            <FinancialMetricChart
              title="Net Debt"
              subtitle="Annual · Total debt minus cash"
              statCards={[
                { label: "Net Debt", value: fmtB(fd.netDebt), color: fd.netDebt > 0 ? "#c85a5a" : "#2a8a3a" },
                { label: "Debt/EBITDA", value: fd.netDebtToEbitda != null ? `${fd.netDebtToEbitda.toFixed(1)}x` : "—", color: "var(--text-primary)" },
              ]}
              historicalData={debtChart.hist}
              projectedData={[]}
              formatValue={fmtB}
              height={180}
            />
          )}
          {sharesChart && (
            <FinancialMetricChart
              title="Shares Outstanding"
              subtitle="Annual"
              statCards={[
                { label: "Current", value: fd.sharesOut ? fmtShares(fd.sharesOut) : "—", color: "var(--accent)" },
              ]}
              historicalData={sharesChart.hist}
              projectedData={[]}
              formatValue={v => fmtShares(v)}
              height={180}
            />
          )}
        </div>
      )}

      {/* ── NEW SECTIONS: Valuation, Technicals, Analyst, Earnings, Estimates, Insiders, Holders ── */}

      {/* ===== VALUATION + 52-WEEK RANGE + FORWARD ESTIMATES ===== */}
      {(fd?.valuation || (fd?.technicals && fd.technicals.week52High && fd.technicals.week52Low) || (fd?.estimates && (fd.estimates.epsCurrentQ || fd.estimates.epsCurrentY))) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
          gap: isMobile ? 0 : "0 1rem",
          marginBottom: "1rem",
          alignItems: "start",
        }}>
          {fd?.valuation && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)" }}>
              <div style={{ padding: "1.2rem 1.2rem 0" }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                  Valuation
                </div>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
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
                  <div key={i} style={{ padding: "0.5rem 0.4rem", borderRight: i % 2 === 0 ? "1px solid var(--border-accent)" : "none" }}>
                    <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.25rem", fontFamily: "system-ui" }}>{m.label}</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{m.value || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fd?.technicals && fd.technicals.week52High && fd.technicals.week52Low && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", padding: "1.2rem" }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif", marginBottom: "0.8rem" }}>
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
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0 }}>
                {[
                  { label: "50-Day MA", value: fd.technicals.ma50 ? `$${fd.technicals.ma50.toFixed(2)}` : "—" },
                  { label: "200-Day MA", value: fd.technicals.ma200 ? `$${fd.technicals.ma200.toFixed(2)}` : "—" },
                  { label: "Beta", value: fd.technicals.beta?.toFixed(2) || "—" },
                  { label: "Short Ratio", value: fd.technicals.shortRatio ? `${fd.technicals.shortRatio} days` : "—" },
                ].map((m, i) => (
                  <div key={i} style={{ padding: "0.5rem 0.4rem" }}>
                    <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", fontFamily: "system-ui" }}>{m.label}</div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>{m.value}</div>
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

          {fd?.estimates && (fd.estimates.epsCurrentQ || fd.estimates.epsCurrentY) && (
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)" }}>
              <div style={{ padding: "1.2rem 1.2rem 0" }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                  Forward Estimates
                </div>
              </div>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(2, 1fr)",
                gap: 0, padding: "0.8rem 1.2rem 1.2rem",
              }}>
                {[
                  { label: "EPS Est (Current Q)", value: fd.estimates.epsCurrentQ ? `$${fd.estimates.epsCurrentQ.toFixed(2)}` : null },
                  { label: "EPS Est (Next Q)", value: fd.estimates.epsNextQ ? `$${fd.estimates.epsNextQ.toFixed(2)}` : null },
                  { label: "EPS Est (Current Y)", value: fd.estimates.epsCurrentY ? `$${fd.estimates.epsCurrentY.toFixed(2)}` : null, color: "var(--accent)" },
                  { label: "EPS Est (Next Y)", value: fd.estimates.epsNextY ? `$${fd.estimates.epsNextY.toFixed(2)}` : null, color: "var(--accent)" },
                  { label: "Rev Est (Current Y)", value: fd.estimates.revCurrentY ? fmtB(fd.estimates.revCurrentY) : null },
                  { label: "Rev Est (Next Y)", value: fd.estimates.revNextY ? fmtB(fd.estimates.revNextY) : null },
                  { label: "EPS Growth (Curr Y)", value: fd.estimates.epsGrowthCurrentY != null ? fmtGrowthPct(fd.estimates.epsGrowthCurrentY) : null, color: "var(--green)" },
                  { label: "EPS Growth (Next Y)", value: fd.estimates.epsGrowthNextY != null ? fmtGrowthPct(fd.estimates.epsGrowthNextY) : null, color: "var(--green)" },
                ].map((m, i) => (
                  <div key={i} style={{ padding: "0.5rem 0.4rem", borderRight: i % 2 === 0 ? "1px solid var(--border-accent)" : "none" }}>
                    <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "0.25rem", fontFamily: "system-ui" }}>{m.label}</div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: m.color || "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{m.value || "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== EARNINGS SURPRISES + INSIDER TRANSACTIONS ===== */}
      {(fd?.history?.earningsSurprises?.length > 0 || (fd?.insiders && fd.insiders.length > 0)) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? 0 : "0 1rem",
          marginBottom: "1rem",
          alignItems: "start",
        }}>
          {fd?.history?.earningsSurprises?.length > 0 && (
            <EarningsSurprisesChart surprises={fd.history.earningsSurprises} isMobile={isMobile} compact />
          )}
          {fd?.insiders && fd.insiders.length > 0 && (
            <InsiderBarChart insiders={fd.insiders} isMobile={isMobile} />
          )}
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
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif", marginBottom: "0.6rem" }}>
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
              <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif", marginBottom: "0.6rem" }}>
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

      {/* Fundamentals */}
      {!fdLoading && fd && (
        <div style={{ marginTop: "1.5rem" }}>
          <div style={{
            fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)",
            fontFamily: "'DM Sans', system-ui, sans-serif", marginBottom: "0.8rem",
            borderBottom: "1px solid var(--border-accent)", paddingBottom: "0.5rem",
          }}>
            Fundamentals
          </div>
          <Fundamentals fd={fd} loading={fdLoading} />
        </div>
      )}
    </div>
  );
}

/* Earnings Surprises custom chart — green for beats, red for misses */
function EarningsSurprisesChart({ surprises, isMobile, compact }) {
  const data = surprises.filter(s => s.surprise != null);
  if (data.length === 0) return null;

  const beats = data.filter(s => s.surprise > 0).length;
  const beatRate = ((beats / data.length) * 100).toFixed(0);
  const avgSurprise = (data.reduce((a, s) => a + s.surprise, 0) / data.length).toFixed(2);
  const latest = data[data.length - 1];

  const svgW = compact ? (isMobile ? 340 : 420) : (isMobile ? 340 : 600);
  const height = compact ? 180 : 240;
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
        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Earnings Surprises
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: 2, fontFamily: "'DM Sans', system-ui, sans-serif", fontStyle: "italic" }}>
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
              <div style={{ fontSize: "1.15rem", fontWeight: 700, color: card.color, lineHeight: 1, fontFamily: "'DM Sans', system-ui, sans-serif" }}>{card.value}</div>
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

/* Insider Transactions — buy/sell bar chart aggregated by month */
function InsiderBarChart({ insiders, isMobile }) {
  // Aggregate by month: net buys vs sells
  const byMonth = {};
  insiders.forEach(t => {
    if (!t.date) return;
    const month = t.date.substring(0, 7); // "2024-01"
    if (!byMonth[month]) byMonth[month] = { buys: 0, sells: 0 };
    if (t.code === "P") byMonth[month].buys += 1;
    else if (t.code === "S") byMonth[month].sells += 1;
  });

  const months = Object.keys(byMonth).sort();
  if (months.length === 0) return null;

  // Take last 24 months max
  const recent = months.slice(-24);
  const data = recent.map(m => ({
    month: m,
    net: byMonth[m].buys - byMonth[m].sells,
    buys: byMonth[m].buys,
    sells: byMonth[m].sells,
  }));

  const totalBuys = data.reduce((a, d) => a + d.buys, 0);
  const totalSells = data.reduce((a, d) => a + d.sells, 0);

  const svgW = isMobile ? 340 : 500;
  const height = 160;
  const padL = 30;
  const padR = 10;
  const padTop = 8;
  const padBot = 24;
  const chartW = svgW - padL - padR;
  const chartH = height - padTop - padBot;
  const barCount = data.length;
  const stepW = chartW / barCount;
  const barW = Math.max(3, Math.min(stepW * 0.7, 14));

  const values = data.map(d => d.net);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, -1);
  const range = maxVal - minVal || 1;
  const zeroY = padTop + (maxVal / range) * chartH;

  // Year labels
  const axisLabels = [];
  let lastYear = '';
  data.forEach((d, i) => {
    const yr = d.month.slice(0, 4);
    if (yr !== lastYear) { axisLabels.push({ i, label: yr }); lastYear = yr; }
  });

  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-accent)", marginBottom: "1rem" }}>
      <div style={{ padding: "1.2rem 1.2rem 0" }}>
        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
          Insider Transactions
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", marginTop: 2, fontFamily: "'DM Sans', system-ui, sans-serif", fontStyle: "italic" }}>
          Net buys/sells per month · Last {recent.length} months
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8, marginBottom: 4 }}>
          <span style={{ fontSize: "0.7rem", color: "var(--green)", fontWeight: 600 }}>
            {totalBuys} Buys
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--red-muted)", fontWeight: 600 }}>
            {totalSells} Sells
          </span>
        </div>
      </div>
      <svg width={svgW} height={height} style={{ display: "block" }}>
        <line x1={padL} y1={zeroY} x2={svgW - padR} y2={zeroY} stroke="var(--border-accent)" strokeWidth={0.8} strokeDasharray="2,2" />
        {data.map((bar, i) => {
          const x = padL + i * stepW + (stepW - barW) / 2;
          const isPositive = bar.net >= 0;
          const barH = Math.max(1, (Math.abs(bar.net) / range) * chartH);
          const barY = isPositive ? zeroY - barH : zeroY;
          return (
            <rect key={i} x={x} y={barY} width={barW} height={barH}
              fill={isPositive ? "#2a8a3a" : "#c85a5a"} opacity={0.85} />
          );
        })}
        {axisLabels.map(({ i, label }) => (
          <text key={i} x={padL + i * stepW + stepW / 2} y={height - 6}
            textAnchor="middle" fontSize={8} fill="var(--text-label)" fontFamily="system-ui">
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
