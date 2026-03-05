import React, { useState, useMemo } from 'react';
import HoldingRow from './HoldingRow';
import CashRow, { CashCardMobile } from './CashRow';
import NaValue from './NaValue';
import { formatCurrency } from '../utils/format';
import { exportHoldingsCSV } from '../utils/export';
import useIsMobile from '../hooks/useIsMobile';
import MiniProgressBar from './MiniProgressBar';

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
  onRemove, onEdit, title, dripEnabled, toggleDrip,
  onRefresh, lastUpdatedAt, refreshing, holdingsValue,
  cashBalance = 0, onEditCash,
}) {
  const isMobile = useIsMobile();
  const [sortKey, setSortKey] = useState("value");
  const [sortDir, setSortDir] = useState("desc");
  const [searchFocus, setSearchFocus] = useState(false);
  const [editingTicker, setEditingTicker] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editingCash, setEditingCash] = useState(false);
  const [cashEditValue, setCashEditValue] = useState("");

  const totalValue = holdingsValue ?? 0;
  const portfolioValue = totalValue + cashBalance;

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
      background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden",
    }}>
      {/* Header bar */}
      <div style={{
        padding: isMobile ? "0.7rem 0.8rem" : "0.9rem 1.5rem", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: isMobile ? "wrap" : "nowrap", gap: isMobile ? 8 : 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 10 : 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontWeight: 600, fontSize: "0.9rem",
              color: "var(--text-primary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              {title || "My Holdings"}
            </span>
            <span style={{
              background: "var(--bg-pill)", borderRadius: 10,
              padding: "2px 8px", fontSize: "0.68rem", color: "var(--text-muted)",
              fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
            }}>
              {holdings.length + 1}
            </span>
          </div>
          {toggleDrip && (
            <div
              onClick={toggleDrip}
              role="switch"
              aria-checked={dripEnabled}
              aria-label="Toggle DRIP reinvestment"
              tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDrip(); } }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                cursor: "pointer", userSelect: "none",
              }}
            >
              <div style={{
                width: 28, height: 14, borderRadius: 7,
                background: dripEnabled ? "var(--primary)" : "var(--border-accent)",
                position: "relative", transition: "background 0.2s",
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: 5,
                  background: "#fff",
                  position: "absolute", top: 2,
                  left: dripEnabled ? 16 : 2,
                  transition: "left 0.2s",
                }} />
              </div>
              <span style={{
                fontSize: "0.68rem", color: dripEnabled ? "var(--primary)" : "var(--text-muted)",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontWeight: 500,
              }}>
                DRIP {dripEnabled ? "On" : "Off"}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", width: isMobile ? "100%" : "auto" }}>
          <div style={{ position: "relative", flex: isMobile ? 1 : "none" }}>
            <span style={{
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
              color: "var(--text-dim)", fontSize: "0.75rem", pointerEvents: "none",
            }}>
              &#x1F50D;
            </span>
            <input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              aria-label="Search holdings"
              style={{
                background: "var(--bg-pill)",
                border: searchFocus ? "1px solid var(--primary)" : "1px solid transparent",
                color: "var(--text-primary)", padding: "0.4rem 0.8rem 0.4rem 2rem",
                fontSize: "0.82rem", width: isMobile ? "100%" : 190,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                borderRadius: 8, transition: "border-color 0.2s",
              }}
            />
          </div>
          {holdings.length > 0 && onRefresh && (() => {
            const elapsed = lastUpdatedAt ? Date.now() - lastUpdatedAt.getTime() : Infinity;
            const canRefresh = elapsed >= 15 * 60 * 1000 && !refreshing;
            return (
              <button
                onClick={onRefresh}
                disabled={!canRefresh}
                aria-label="Refresh prices"
                style={{
                  padding: isMobile ? "0.5rem 0.8rem" : "0.4rem 0.8rem",
                  background: "transparent", border: "1px solid var(--border)",
                  color: canRefresh ? "var(--text-muted)" : "var(--text-dim)",
                  cursor: canRefresh ? "pointer" : "not-allowed",
                  fontSize: "0.75rem", whiteSpace: "nowrap",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  opacity: canRefresh ? 1 : 0.5, borderRadius: 8,
                }}
              >
                {refreshing ? "Refreshing..." : "↻ Refresh"}
              </button>
            );
          })()}
          {holdings.length > 0 && (
            <button
              onClick={() => exportHoldingsCSV(holdings, liveData)}
              aria-label="Export holdings as CSV"
              style={{
                padding: isMobile ? "0.5rem 0.8rem" : "0.4rem 0.8rem",
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--text-muted)", cursor: "pointer",
                fontSize: "0.75rem", whiteSpace: "nowrap",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                borderRadius: 8,
              }}
            >
              Export
            </button>
          )}
          {onAdd && (
            <button onClick={onAdd} aria-label="Add stock to portfolio" style={{
              padding: isMobile ? "0.5rem 1rem" : "0.4rem 1rem", background: "var(--primary)", border: "none",
              color: "white", fontWeight: 600, cursor: "pointer",
              fontSize: "0.8rem", borderRadius: 8,
              whiteSpace: "nowrap",
            }}>
              + Add
            </button>
          )}
        </div>
      </div>

      {/* Mobile: sort dropdown + card layout */}
      {isMobile ? (
        <>
          <div style={{ padding: "0.5rem 0.8rem", borderBottom: "1px solid var(--border-row)" }}>
            <select
              value={sortKey}
              onChange={e => handleSort(e.target.value)}
              aria-label="Sort holdings by"
              style={{
                padding: "6px 10px", background: "var(--bg-pill)", border: "1px solid var(--border)",
                color: "var(--text-primary)", fontSize: "0.75rem", fontFamily: "'DM Sans', system-ui, sans-serif",
                width: "100%", borderRadius: 8,
              }}
            >
              {SORT_FIELDS.map(f => (
                <option key={f.key} value={f.key}>
                  Sort: {f.label} {sortKey === f.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {onEditCash && (
              <CashCardMobile
                cashBalance={cashBalance}
                onEditCash={onEditCash}
                portfolioValue={portfolioValue}
                editing={editingCash}
                setEditing={setEditingCash}
                editValue={cashEditValue}
                setEditValue={setCashEditValue}
              />
            )}
            {filtered.map((h, idx) => {
              const live = liveData?.[h.ticker];
              const price = (live?.price > 0 ? live.price : null) || h.price || 0;
              const value = price * (h.shares || 0);
              const weightPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
              const yld = (live?.divYield > 0 ? live.divYield : null) ?? h.yld ?? 0;
              const annualDiv = (live?.annualDiv > 0 ? live.annualDiv : null) ?? h.div ?? 0;
              const g5 = live?.g5 ?? h.g5 ?? 0;
              return (
                <div key={h.ticker}
                  onClick={() => onSelect?.(h)}
                  style={{
                    padding: "0.8rem", borderBottom: "1px solid var(--border-row)",
                    cursor: "pointer",
                    background: idx % 2 ? "var(--row-alt)" : "var(--bg-card)",
                  }}
                >
                  {/* Top row: ticker + price */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem", letterSpacing: "0.06em" }}>
                        {h.ticker}
                      </span>
                    </div>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.9rem", fontFamily: "'JetBrains Mono', monospace" }}>
                      ${price.toFixed(2)}
                    </span>
                  </div>
                  {/* Company name */}
                  <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", marginBottom: 8 }}>
                    {h.name || h.ticker}
                  </div>
                  {/* 4-col metric grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
                    <MobileMetric label="Yield" value={yld > 0 ? `${yld.toFixed(2)}%` : null} color="var(--primary)" />
                    <MobileMetric label="Div" value={annualDiv > 0 ? `$${annualDiv.toFixed(2)}` : null} />
                    <MobileMetric label="Growth" value={g5 > 0 ? `+${g5.toFixed(1)}%` : null} color="var(--green)" />
                    <MobileMetric label="Weight" value={`${weightPct.toFixed(1)}%`} />
                  </div>
                  {/* Bottom: shares + buttons */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    {editingTicker === h.ticker ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }} onClick={e => e.stopPropagation()}>
                        <input
                          type="number"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const val = parseFloat(editValue);
                              if (!isNaN(val) && val > 0) onEdit?.(h.ticker, val);
                              setEditingTicker(null);
                            } else if (e.key === "Escape") {
                              setEditingTicker(null);
                            }
                          }}
                          autoFocus
                          aria-label={`Edit shares for ${h.ticker}`}
                          style={{
                            width: 90, padding: "6px 8px",
                            background: "var(--bg-pill)", border: "1px solid var(--primary)",
                            color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "0.85rem", borderRadius: 8,
                          }}
                        />
                        <button
                          onClick={() => {
                            const val = parseFloat(editValue);
                            if (!isNaN(val) && val > 0) onEdit?.(h.ticker, val);
                            setEditingTicker(null);
                          }}
                          style={{
                            background: "var(--primary)", border: "none", color: "white",
                            padding: "6px 12px", cursor: "pointer", fontSize: "0.75rem",
                            minHeight: 44, fontWeight: 600, borderRadius: 8,
                          }}
                          aria-label="Save shares"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingTicker(null)}
                          style={{
                            background: "var(--bg-pill)", border: "none", color: "var(--text-muted)",
                            padding: "6px 10px", cursor: "pointer", fontSize: "0.75rem",
                            minHeight: 44, borderRadius: 8,
                          }}
                          aria-label="Cancel edit"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                          {h.shares?.toFixed(3)} shares
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setEditingTicker(h.ticker);
                              setEditValue(String(h.shares?.toFixed(3) || ""));
                            }}
                            style={{
                              background: "var(--bg-pill)", border: "none", color: "var(--text-muted)",
                              padding: "6px 14px", cursor: "pointer", fontSize: "0.75rem",
                              minHeight: 44, minWidth: 44, borderRadius: 8,
                            }}
                            aria-label={`Edit shares for ${h.ticker}`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); onRemove?.(h.ticker); }}
                            style={{
                              background: "var(--bg-pill)", border: "none", color: "var(--red)",
                              padding: "6px 14px", cursor: "pointer", fontSize: "0.75rem",
                              minHeight: 44, minWidth: 44, borderRadius: 8,
                            }}
                            aria-label={`Remove ${h.ticker}`}
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Desktop Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {SORT_FIELDS.map(f => (
                    <th key={f.key} onClick={() => handleSort(f.key)} style={{
                      cursor: "pointer", padding: "0.7rem 1rem", textAlign: "left",
                      fontSize: "10px", color: "var(--text-label)", textTransform: "uppercase",
                      letterSpacing: "0.08em", whiteSpace: "nowrap", fontWeight: 600,
                    }}>
                      {f.label} {sortKey === f.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                  ))}
                  <th style={{
                    padding: "0.7rem 1rem", fontSize: "10px",
                  }}></th>
                </tr>
              </thead>
              <tbody>
                {onEditCash && (
                  <CashRow
                    cashBalance={cashBalance}
                    onEditCash={onEditCash}
                    portfolioValue={portfolioValue}
                    index={0}
                  />
                )}
                {filtered.map((h, idx) => {
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
                      index={idx + 1}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {filtered.length > 0 && (
            <div style={{
              padding: "0.5rem 1.5rem", borderTop: "1px solid var(--border)",
              fontSize: "0.7rem", color: "var(--text-sub)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              Click any row for charts, data & 10-year projection
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MobileMetric({ label, value, color }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: color || "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace" }}>
        {value != null ? value : <NaValue reason={`No ${label.toLowerCase()} data`} />}
      </div>
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
    case "yld": return (live?.divYield > 0 ? live.divYield : null) ?? stock.yld ?? 0;
    case "div": return (live?.annualDiv > 0 ? live.annualDiv : null) ?? stock.div ?? 0;
    case "payout": return live?.payout ?? stock.payout ?? 0;
    case "g5": return live?.g5 ?? stock.g5 ?? 0;
    case "streak": return stock.streak ?? 0;
    case "weight": return totalValue > 0 ? value / totalValue : 0;
    default: return 0;
  }
}
