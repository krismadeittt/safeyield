import React, { useState, useEffect, useMemo } from 'react';
import { fetchSingleFundamentals } from '../api/fundamentals';
import { projectPortfolio, seededPRNG } from '../utils/monteCarlo';
import { getTaxClass } from '../data/taxData';
import { formatCurrency } from '../utils/format';
import DripComparisonBar from '../components/charts/DripComparisonBar';
import MultiLineChart from '../components/charts/MultiLineChart';
import SingleSeriesBar from '../components/charts/SingleSeriesBar';
import DividendHistoryForecast from '../components/charts/DividendHistoryForecast';
import Fundamentals from './Fundamentals';

const YEAR_OPTIONS = [5, 10, 15, 20, 25, 30];

export default function StockDetail({ stock, live, loading, onBack }) {
  const [horizon, setHorizon] = useState(10);
  const [fd, setFd] = useState(null);
  const [fdLoading, setFdLoading] = useState(true);
  const [sharedHov, setSharedHov] = useState(null);

  const data = live || stock;
  const price = data.price || 0;
  const yld = data.divYield ?? stock.yld ?? 0;
  const annualDiv = data.annualDiv ?? stock.div ?? 0;
  const payout = data.payout ?? stock.payout ?? null;
  const g5 = stock.g5 ?? 5;
  const taxClass = getTaxClass(stock.ticker);

  useEffect(() => {
    setFdLoading(true);
    fetchSingleFundamentals(stock.ticker)
      .then(d => { setFd(d); setFdLoading(false); })
      .catch(() => setFdLoading(false));
  }, [stock.ticker]);

  const rng = useMemo(() => seededPRNG(stock.ticker.charCodeAt(0)), [stock.ticker]);
  const invest = 10000;
  const shares = price > 0 ? invest / price : 0;

  const noDrip = useMemo(() =>
    projectPortfolio(horizon, false, 0, invest, yld, 8, false, null, g5),
  [horizon, yld, g5]);

  const drip = useMemo(() =>
    projectPortfolio(horizon, true, 0, invest, yld, 8, false, null, g5),
  [horizon, yld, g5]);

  // Income projection per year
  const incomeData = useMemo(() => {
    const pts = [];
    for (let yr = 0; yr <= horizon; yr++) {
      const divPerShare = annualDiv * Math.pow(1 + g5 / 100, yr);
      const income = divPerShare * shares;
      pts.push({ label: `Y${yr}`, value: Math.round(income), yr });
    }
    return pts;
  }, [horizon, annualDiv, g5, shares]);

  // Line chart data
  const lineData = useMemo(() =>
    noDrip.map((v, i) => ({ label: `Y${i}`, noDrip: v, drip: drip[i] })),
  [noDrip, drip]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1rem" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, marginBottom: "1.5rem",
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

      {/* Year selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: "1.2rem" }}>
        {YEAR_OPTIONS.map(y => (
          <button key={y} onClick={() => setHorizon(y)} style={{
            padding: "4px 12px", fontSize: "0.75rem", cursor: "pointer",
            background: horizon === y ? "#005EB8" : "transparent",
            color: horizon === y ? "#c8dff0" : "#2a4a6a",
            border: `1px solid ${horizon === y ? "#005EB8" : "#0a1e30"}`,
          }}>
            {y}Y
          </button>
        ))}
      </div>

      {/* Key metrics */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 8, marginBottom: "1.2rem",
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

      {/* $10,000 Investment — Portfolio Value */}
      <div style={{
        background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem", marginBottom: "1rem",
      }}>
        <div style={{
          fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
          textTransform: "uppercase", marginBottom: "0.8rem",
        }}>
          $10,000 Investment — Portfolio Value
        </div>
        <MultiLineChart
          pts={lineData}
          keys={["noDrip", "drip"]}
          colors={["#1a3a5c", "#005EB8"]}
          dashes={["4,4"]}
          fmt={formatCurrency}
          H={180}
        />
      </div>

      <DripComparisonBar
        projData={{ noDrip, drip }}
        contribVals={null}
        horizon={horizon}
        extraContrib={0}
        fmtY={formatCurrency}
      />

      {/* Income projection */}
      <div style={{
        background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem",
        marginTop: "1rem", marginBottom: "1rem",
      }}>
        <div style={{
          fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
          textTransform: "uppercase", marginBottom: "0.8rem",
        }}>
          Dividend Income — $10,000 Investment
        </div>
        <SingleSeriesBar
          pts={incomeData}
          valKey="value"
          color="#005EB8"
          fmt={formatCurrency}
          H={160}
        />
      </div>

      {/* Dividend history & forecast */}
      {annualDiv > 0 && (
        <>
          <DividendHistoryForecast
            currentDiv={annualDiv}
            g5rate={g5}
            label="Dividend Per Share"
            color="#005EB8"
            sharedHov={sharedHov}
            onHov={setSharedHov}
          />
          <div style={{ marginTop: "1rem" }}>
            <DividendHistoryForecast
              currentDiv={yld}
              g5rate={g5}
              label="Dividend Yield"
              color="#1a5a9e"
              sharedHov={sharedHov}
              onHov={setSharedHov}
              isYield
            />
          </div>
        </>
      )}

      {/* Fundamentals */}
      <div style={{ marginTop: "1rem" }}>
        <Fundamentals fd={fd} loading={fdLoading} />
      </div>
    </div>
  );
}
