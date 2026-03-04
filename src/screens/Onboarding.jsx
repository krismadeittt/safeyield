import React, { useState, useEffect, useRef } from 'react';
import { STRATEGIES } from '../data/strategies';
import { BALANCE_OPTIONS } from '../data/portfolioTemplates';
import { REIT_TEMPLATE, VIG_TEMPLATE, HIGH_YIELD_TEMPLATE } from '../data/portfolioTemplates';
import { buildPortfolioFromWeights, buildNoblPortfolio } from '../utils/portfolio';
import { formatCurrency } from '../utils/format';
import { searchTickers } from '../api/search';
import { fetchEnrichedQuote } from '../api/quotes';
import useIsMobile from '../hooks/useIsMobile';

const CUSTOM_ROWS = 10;

// Reorder: custom first
const ORDERED_STRATEGIES = [
  STRATEGIES.find(s => s.id === "custom"),
  ...STRATEGIES.filter(s => s.id !== "custom"),
];

export default function Onboarding({ onLoad, prePrices, preLoading, preloadPrices }) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState("pick"); // "pick", "balance", or "custom"
  const [strategy, setStrategy] = useState(null);
  const [balance, setBalance] = useState("");
  const [error, setError] = useState("");

  // Custom picks state
  const [rows, setRows] = useState(() =>
    Array.from({ length: CUSTOM_ROWS }, () => ({ ticker: '', name: '', shares: '', search: '', results: [] }))
  );
  const [loading, setLoading] = useState(false);

  function handlePick(strat) {
    setStrategy(strat);
    if (strat.id === "custom") {
      setMode("custom");
      return;
    }
    preloadPrices(strat.id);
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

    onLoad(holdings, strategy.id, val);
  }

  async function handleCustomStart() {
    const filled = rows.filter(r => r.ticker && parseFloat(r.shares) > 0);
    if (!filled.length) { setError("Add at least one stock with shares"); return; }
    setLoading(true);
    setError("");

    try {
      const holdings = [];
      for (const row of filled) {
        const data = await fetchEnrichedQuote(row.ticker).catch(() => null);
        holdings.push({
          ticker: row.ticker,
          name: data?.name || row.name || row.ticker,
          sector: data?.sector || null,
          price: data?.price || 0,
          shares: parseFloat(row.shares) || 1,
          yld: data?.divYield || 0,
          div: data?.annualDiv || 0,
          payout: data?.payout || null,
          g5: data?.g5 ?? 5,
          streak: data?.streak ?? 0,
          score: 50,
        });
      }
      onLoad(holdings, "custom");
    } catch (e) {
      setError("Failed to load some stocks. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // Strategy picker
  if (mode === "pick") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", padding: isMobile ? "1rem" : "2rem",
      }}>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: isMobile ? "1.6rem" : "2.5rem",
          color: "#c8dff0", fontWeight: 700, marginBottom: "0.5rem",
        }}>
          SafeYield
        </h1>
        <p style={{ color: "#7a9ab8", marginBottom: "2.5rem", fontStyle: "italic" }}>
          Dividend Intelligence — Portfolio Analysis & DRIP Simulation
        </p>
        <div style={{ maxWidth: 740, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
          {/* Custom Picks — solo top row */}
          {(() => {
            const strat = ORDERED_STRATEGIES[0];
            return (
              <StrategyCard strat={strat} onClick={() => handlePick(strat)} isMobile={isMobile} fullWidth />
            );
          })()}
          {/* Remaining strategies — 2x2 grid */}
          <div style={{
            display: "flex", flexWrap: "wrap", justifyContent: "center",
            gap: "1rem", width: "100%",
          }}>
            {ORDERED_STRATEGIES.slice(1).map(strat => (
              <StrategyCard key={strat.id} strat={strat} onClick={() => handlePick(strat)} isMobile={isMobile} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Custom picks screen
  if (mode === "custom") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", padding: isMobile ? "1.5rem 1rem" : "3rem 2rem",
      }}>
        <button onClick={() => setMode("pick")} style={{
          background: "none", border: "1px solid #1a3a5c", color: "#5a8ab0",
          padding: "4px 12px", cursor: "pointer", fontSize: "0.75rem",
          fontFamily: "'EB Garamond', Georgia, serif", alignSelf: "flex-start",
          marginBottom: "1.5rem",
        }}>
          ← Back
        </button>

        <h2 style={{
          fontFamily: "'Playfair Display', Georgia, serif", fontSize: isMobile ? "1.2rem" : "1.5rem",
          color: "#c8dff0", marginBottom: "0.5rem",
        }}>
          Build Your Portfolio
        </h2>
        <p style={{ color: "#7a9ab8", marginBottom: "1.5rem", fontSize: "0.85rem", fontStyle: "italic" }}>
          Search for stocks or ETFs and enter share quantities
        </p>

        <div style={{ width: "100%", maxWidth: 560 }}>
          {/* Header */}
          {!isMobile && (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 2fr 100px",
              gap: 8, padding: "0 0 8px", marginBottom: 4,
            }}>
              <span style={{ fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.15em", textTransform: "uppercase" }}>Ticker</span>
              <span style={{ fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.15em", textTransform: "uppercase" }}>Name</span>
              <span style={{ fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.15em", textTransform: "uppercase" }}>Shares</span>
            </div>
          )}

          {rows.map((row, i) => (
            <CustomRow
              key={i}
              row={row}
              index={i}
              isMobile={isMobile}
              onChange={(field, value) => {
                setRows(prev => prev.map((r, j) => j === i ? { ...r, [field]: value } : r));
              }}
              onPick={(ticker, name) => {
                setRows(prev => prev.map((r, j) => j === i ? { ...r, ticker, name, search: ticker, results: [] } : r));
              }}
              onResults={(results) => {
                setRows(prev => prev.map((r, j) => j === i ? { ...r, results } : r));
              }}
            />
          ))}

          {error && <div style={{ color: "#ff4466", fontSize: "0.8rem", marginTop: 12 }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: "1.5rem", justifyContent: "center" }}>
            <button onClick={handleCustomStart} disabled={loading} style={{
              padding: "12px 40px", fontSize: "1rem", cursor: "pointer",
              background: loading ? "#1a3a5c" : "#005EB8", color: "#c8dff0",
              border: "none", fontWeight: 700,
            }}>
              {loading ? "Loading..." : "Start Analysis"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Balance input screen
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: isMobile ? "1rem" : "2rem",
    }}>
      <div style={{
        fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
        textTransform: "uppercase", marginBottom: 8,
      }}>
        {strategy.name}
      </div>
      <h2 style={{
        fontFamily: "'Playfair Display', Georgia, serif", fontSize: isMobile ? "1.2rem" : "1.5rem",
        color: "#c8dff0", marginBottom: "1.5rem",
      }}>
        Starting Balance
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1rem", justifyContent: "center" }}>
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
          width: isMobile ? "100%" : 200, maxWidth: 300, padding: "10px 16px", textAlign: "center", fontSize: "1.2rem",
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

function CustomRow({ row, index, isMobile, onChange, onPick, onResults }) {
  const timerRef = useRef(null);

  function handleSearch(value) {
    onChange('search', value);
    onChange('ticker', value.toUpperCase());
    onChange('name', '');
    if (timerRef.current) clearTimeout(timerRef.current);
    if (value.length < 1) { onResults([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const results = await searchTickers(value);
        onResults(results);
      } catch {}
    }, 250);
  }

  const inputStyle = {
    width: "100%", padding: "8px 10px",
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif",
    outline: "none", fontSize: "0.85rem",
  };

  if (isMobile) {
    return (
      <div style={{ marginBottom: 8, padding: "8px 0", borderBottom: "1px solid #0f2540" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              placeholder={`Stock ${index + 1}...`}
              value={row.search}
              onChange={e => handleSearch(e.target.value)}
              style={inputStyle}
            />
            {row.results.length > 0 && (
              <Dropdown results={row.results} onPick={onPick} />
            )}
          </div>
          <input
            placeholder="Shares"
            value={row.shares}
            onChange={e => onChange('shares', e.target.value)}
            type="number"
            style={{ ...inputStyle, width: 80, flex: "none" }}
          />
        </div>
        {row.name && (
          <div style={{ fontSize: "0.7rem", color: "#7a9ab8", paddingLeft: 2 }}>{row.name}</div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 2fr 100px",
      gap: 8, marginBottom: 6, alignItems: "start",
    }}>
      <div style={{ position: "relative" }}>
        <input
          placeholder={`Ticker ${index + 1}`}
          value={row.search}
          onChange={e => handleSearch(e.target.value)}
          style={inputStyle}
        />
        {row.results.length > 0 && (
          <Dropdown results={row.results} onPick={onPick} />
        )}
      </div>
      <div style={{
        padding: "8px 10px", fontSize: "0.8rem", color: row.name ? "#7a9ab8" : "#2a4a6a",
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
        minHeight: 36, display: "flex", alignItems: "center",
      }}>
        {row.name || "—"}
      </div>
      <input
        placeholder="Shares"
        value={row.shares}
        onChange={e => onChange('shares', e.target.value)}
        type="number"
        style={inputStyle}
      />
    </div>
  );
}

function StrategyCard({ strat, onClick, isMobile, fullWidth }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#0a1628", border: "1px solid #0a1e30",
        padding: "1.5rem", cursor: "pointer",
        borderTop: `3px solid ${strat.color}`,
        transition: "border-color 0.2s, box-shadow 0.2s",
        width: isMobile || fullWidth ? "100%" : "calc(50% - 0.5rem)",
        minWidth: isMobile ? "auto" : 280,
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
  );
}

function Dropdown({ results, onPick }) {
  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
      background: "#071020", border: "1px solid #1a3a5c",
      maxHeight: 150, overflowY: "auto",
    }}>
      {results.map(r => (
        <div key={r.ticker} onClick={() => onPick(r.ticker, r.name)} style={{
          padding: "6px 10px", cursor: "pointer",
          borderBottom: "1px solid #0f2540",
          display: "flex", justifyContent: "space-between",
        }}>
          <span style={{ color: "#ffffff", fontWeight: 700, fontSize: "0.85rem" }}>{r.ticker}</span>
          <span style={{ color: "#2a4a6a", fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{r.name}</span>
        </div>
      ))}
    </div>
  );
}
