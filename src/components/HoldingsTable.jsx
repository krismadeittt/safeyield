import React, { useState, useMemo } from 'react';
import HoldingRow from './HoldingRow';
import { formatCurrency } from '../utils/format';

const SORT_FIELDS = [
  { key: "ticker", label: "Ticker" },
  { key: "shares", label: "Shares" },
  { key: "price", label: "Price" },
  { key: "value", label: "Value" },
  { key: "yld", label: "Yield" },
  { key: "div", label: "Annual Div" },
  { key: "payout", label: "Payout" },
  { key: "tax", label: "Tax Class" },
];

export default function HoldingsTable({
  holdings, search, setSearch, onAdd, onSelect, liveData, loading,
  showIncome, onRemove, showWeight, onEdit, title,
}) {
  const [sortKey, setSortKey] = useState("value");
  const [sortDir, setSortDir] = useState("desc");

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
      const av = getSortVal(a, sortKey, liveData);
      const bv = getSortVal(b, sortKey, liveData);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [holdings, search, sortKey, sortDir, liveData]);

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  return (
    <div style={{ background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "1rem",
      }}>
        <div style={{
          fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em", textTransform: "uppercase",
        }}>
          {title || "Portfolio Holdings"} ({holdings.length})
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: "#071020", border: "1px solid #0a1e30", color: "#c8dff0",
              padding: "6px 12px", fontSize: "0.8rem", width: 160,
              fontFamily: "'EB Garamond', Georgia, serif",
            }}
          />
          {onAdd && (
            <button onClick={onAdd} style={{
              background: "#005EB8", color: "#c8dff0", border: "none",
              padding: "6px 16px", cursor: "pointer", fontSize: "0.8rem",
            }}>
              + Add
            </button>
          )}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {SORT_FIELDS.map(f => (
                <th key={f.key} onClick={() => handleSort(f.key)} style={{ cursor: "pointer" }}>
                  {f.label} {sortKey === f.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
              {showIncome && <th>Income</th>}
              {showWeight && <th>Weight</th>}
              <th></th>
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
                  showIncome={showIncome}
                  onRemove={onRemove}
                  showWeight={showWeight}
                  weightPct={weightPct}
                  onEdit={onEdit}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 && (
        <div style={{
          textAlign: "center", padding: "0.8rem", color: "#1a4060", fontSize: "0.7rem",
        }}>
          Click any row for charts, live data & 10-year projection
        </div>
      )}
    </div>
  );
}

function getSortVal(stock, key, liveData) {
  const data = liveData?.[stock.ticker] || stock;
  switch (key) {
    case "ticker": return stock.ticker;
    case "shares": return stock.shares || 0;
    case "price": return data.price || 0;
    case "value": return (data.price || 0) * (stock.shares || 0);
    case "yld": return data.divYield ?? stock.yld ?? 0;
    case "div": return data.annualDiv ?? stock.div ?? 0;
    case "payout": return data.payout ?? stock.payout ?? 0;
    case "tax": return 0;
    default: return 0;
  }
}
