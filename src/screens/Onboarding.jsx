import React, { useState } from 'react';
import { STRATEGIES } from '../data/strategies';
import { BALANCE_OPTIONS } from '../data/portfolioTemplates';
import { REIT_TEMPLATE, VIG_TEMPLATE, HIGH_YIELD_TEMPLATE } from '../data/portfolioTemplates';
import { buildPortfolioFromWeights, buildNoblPortfolio } from '../utils/portfolio';
import { formatCurrency } from '../utils/format';

export default function Onboarding({ onLoad, prePrices, preLoading }) {
  const [mode, setMode] = useState("pick"); // "pick" or "balance"
  const [strategy, setStrategy] = useState(null);
  const [balance, setBalance] = useState("");
  const [error, setError] = useState("");

  function handlePick(strat) {
    setStrategy(strat);
    if (strat.id === "custom") {
      onLoad([], "custom");
      return;
    }
    setMode("balance");
  }

  function handleStart() {
    const val = parseFloat(balance.replace(/[,$]/g, ""));
    if (!val || val < 100) { setError("Enter at least $100"); return; }

    let holdings;
    if (strategy.id === "nobl") holdings = buildNoblPortfolio(val, prePrices);
    else if (strategy.id === "vig") holdings = buildPortfolioFromWeights(VIG_TEMPLATE, val, prePrices);
    else if (strategy.id === "reit") holdings = buildPortfolioFromWeights(REIT_TEMPLATE, val, prePrices);
    else if (strategy.id === "voo") holdings = buildPortfolioFromWeights(HIGH_YIELD_TEMPLATE, val, prePrices);
    else holdings = [];

    onLoad(holdings, strategy.id);
  }

  if (mode === "pick") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: "2rem",
      }}>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: "2.5rem",
          color: "#c8dff0", fontWeight: 700, marginBottom: "0.5rem",
        }}>
          SafeYield
        </h1>
        <p style={{ color: "#7a9ab8", marginBottom: "2.5rem", fontStyle: "italic" }}>
          Dividend Intelligence — Portfolio Analysis & DRIP Simulation
        </p>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem", maxWidth: 1100, width: "100%",
        }}>
          {STRATEGIES.map(strat => (
            <div
              key={strat.id}
              onClick={() => handlePick(strat)}
              style={{
                background: "#0a1628", border: "1px solid #0a1e30",
                padding: "1.5rem", cursor: "pointer",
                borderTop: `3px solid ${strat.color}`,
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = strat.color;
                e.currentTarget.style.boxShadow = `0 0 20px ${strat.color}22`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "#0a1e30";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{
                fontSize: "1.1rem", fontWeight: 600, color: "#c8dff0",
                fontFamily: "'Playfair Display', Georgia, serif", marginBottom: 4,
              }}>
                {strat.name}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#5aaff8", marginBottom: 8 }}>
                {strat.subtitle}
              </div>
              <div style={{ fontSize: "0.85rem", color: "#7a9ab8", marginBottom: 12 }}>
                {strat.desc}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {strat.stats.map((s, i) => (
                  <span key={i} style={{
                    padding: "2px 8px", fontSize: "0.65rem",
                    background: `${strat.color}22`, color: strat.color,
                    border: `1px solid ${strat.color}44`,
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Balance input screen
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "2rem",
    }}>
      <div style={{
        fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
        textTransform: "uppercase", marginBottom: 8,
      }}>
        {strategy.name}
      </div>
      <h2 style={{
        fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.5rem",
        color: "#c8dff0", marginBottom: "1.5rem",
      }}>
        Starting Balance
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1rem" }}>
        {BALANCE_OPTIONS.map(opt => (
          <button key={opt.value} onClick={() => setBalance(String(opt.value))} style={{
            padding: "8px 20px", cursor: "pointer", fontSize: "0.9rem",
            background: balance === String(opt.value) ? "#005EB8" : "#0a1628",
            color: balance === String(opt.value) ? "#c8dff0" : "#7a9ab8",
            border: `1px solid ${balance === String(opt.value) ? "#005EB8" : "#0a1e30"}`,
          }}>
            {opt.label}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Custom amount..."
        value={balance ? formatCurrency(parseFloat(balance.replace(/[,$]/g, "")) || 0) : ""}
        onChange={e => setBalance(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{
          width: 200, padding: "10px 16px", textAlign: "center", fontSize: "1.2rem",
          background: "#071020", border: "1px solid #1e293b", color: "#c8dff0",
          fontFamily: "'EB Garamond', Georgia, serif", marginBottom: "1rem",
        }}
      />
      {error && <div style={{ color: "#ff4466", fontSize: "0.8rem", marginBottom: 8 }}>{error}</div>}
      <button onClick={handleStart} disabled={preLoading} style={{
        padding: "12px 40px", fontSize: "1rem", cursor: "pointer",
        background: preLoading ? "#1a3a5c" : "#005EB8", color: "#c8dff0",
        border: "none",
      }}>
        {preLoading ? "Loading prices..." : "Start Analysis"}
      </button>
    </div>
  );
}
