import React, { useState, useMemo } from 'react';
import HoldingRow from './HoldingRow';
import { formatCurrency } from '../utils/format';

const SORT_FIELDS = [
  { key: "ticker", label: "Symbol" },
  { key: "shares", label: "Shares" },
  { key: "price", label: "Price" },
  { key: "yld", label: "Yield" },
  { key: "div", label: "Annual Div." },
  { key: "payout", label: "Payout Ratio" },
  { key: "g5", label: "5Y Growth" },
  { key: "streak", label: "Streak" },
  { key: "weight", label: "Weight" },
];

export default function HoldingsTable({
  holdings, search, setSearch, onAdd, onSelect, liveData, loading,
  onRemove, onEdit, title,
}) {
  const [sortKey, setSortKey] = useState("value");
  const [sortDir, setSortDir] = useState("desc");
  const [searchFocus, setSearchFocus] = useState(false);

  const totalValue = useMemo(() =>
    holdings.reduce((sum, h) => {
      const price = liveData?.[h.ticker]?.price || h.price || 0;
      return sum + price * (h.shares || 0);
    }, 0),
  [holdings, liveData]);

  const filtered = useMemo(() => {
    let list = [...holdings];
    if (search) {
      const q = search.toUpperCase();
      list = list.filter(h => h.ticker.includes(q) || (h.name || "").toUpperCase().includes(q));
    }
    list.sort((a, b) => {
      const av = getSortVal(a, sortKey, liveData, totalValue);
      const bv = getSortVal(b, sortKey, liveData, totalValue);
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [holdings, search, sortKey, sortDir, liveData, totalValue]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <div style={{
      background: "#0a1628", border: "1px solid #1a3a5c", overflow: "hidden",
    }}>
      {/* Header bar */}
      <div style={{
        padding: "0.9rem 1.5rem", borderBottom: "1px solid #1a3a5c",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: "#071020",
      }}>
        <span style={{
          fontWeight: 600, letterSpacing: "0.12em", fontSize: "0.72rem",
          textTransform: "uppercase", color: "#7a9ab8",
          fontFamily: "'EB Garamond', Georgia, serif",
        }}>
          {title || "My Holdings"} ({holdings.length})
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setSearchFocus(false)}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${searchFocus ? "rgba(0,94,184,0.6)" : "rgba(255,255,255,0.08)"}`,
              color: "#c8dff0", padding: "0.4rem 0.8rem",
              fontSize: "0.82rem", width: 190, outline: "none",
              fontFamily: "'EB Garamond', Georgia, serif",
              transition: "border-color 0.2s",
            }}
          />
          {onAdd && (
            <button onClick={onAdd} style={{
              padding: "0.4rem 1rem", background: "#005EB8", border: "none",
              color: "white", fontWeight: 700, cursor: "pointer",
              fontSize: "0.8rem", letterSpacing: "0.02em",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            }}>
              + Add
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e293b" }}>
              {SORT_FIELDS.map(f => (
                <th key={f.key} onClick={() => handleSort(f.key)} style={{
                  cursor: "pointer", padding: "0.7rem 1rem", textAlign: "left",
                  fontSize: "0.6rem", color: "#1a3a5c", textTransform: "uppercase",
                  letterSpacing: "0.12em", whiteSpace: "nowrap",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}>
                  {f.label} {sortKey === f.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
              <th style={{
                padding: "0.7rem 1rem", fontSize: "0.6rem",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(h => {
              const price = liveData?.[h.ticker]?.price || h.price || 0;
              const value = price * (h.shares || 0);
              const weightPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
              return (
                <HoldingRow
                  key={h.ticker}
                  stock={h}
                  live={liveData?.[h.ticker]}
                  loading={loading?.[h.ticker]}
                  onClick={onSelect}
                  onRemove={onRemove}
                  weightPct={weightPct}
                  onEdit={onEdit}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      {filtered.length > 0 && (
        <div style={{
          padding: "0.5rem 1.5rem", borderTop: "1px solid #1e293b",
          fontSize: "0.7rem", color: "#1e3a58",
          fontFamily: "'EB Garamond', Georgia, serif",
        }}>
          Click any row for charts, live data & 10-year projection
        </div>
      )}
    </div>
  );
}

function getSortVal(stock, key, liveData, totalValue) {
  const live = liveData?.[stock.ticker];
  const price = (live?.price > 0 ? live.price : null) || stock.price || 0;
  const value = price * (stock.shares || 0);
  switch (key) {
    case "ticker": return stock.ticker;
    case "shares": return stock.shares || 0;
    case "price": return price;
    case "value": return value;
    case "yld": return live?.divYield ?? stock.yld ?? 0;
    case "div": return live?.annualDiv ?? stock.div ?? 0;
    case "payout": return live?.payout ?? stock.payout ?? 0;
    case "g5": return stock.g5 ?? 0;
    case "streak": return stock.streak ?? 0;
    case "weight": return totalValue > 0 ? value / totalValue : 0;
    default: return 0;
  }
}
