import React, { useState, useRef, useEffect } from 'react';
import MiniProgressBar from './MiniProgressBar';
import { formatCurrency } from '../utils/format';

/**
 * Editable row — inline share count editor.
 */
export function EditRow({ stock, weightPct, onRemove, onEdit }) {
  const [shares, setShares] = useState(String(stock.shares?.toFixed(3) || ""));
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        const val = parseFloat(shares);
        if (!isNaN(val) && val > 0) onEdit(stock.ticker, val);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [shares, stock.ticker, onEdit]);

  return (
    <tr ref={ref} style={{ background: "rgba(0,94,184,0.06)" }}>
      <td style={{ fontWeight: 600, color: "#5aaff8" }}>{stock.ticker}</td>
      <td>
        <input
          type="number"
          value={shares}
          onChange={e => setShares(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              const val = parseFloat(shares);
              if (!isNaN(val) && val > 0) onEdit(stock.ticker, val);
            }
          }}
          style={{
            width: 90, background: "#071020", border: "1px solid #1e293b",
            color: "#c8dff0", padding: "4px 8px", fontFamily: "'EB Garamond', Georgia, serif",
          }}
          autoFocus
        />
      </td>
      <td colSpan={8} style={{ color: "#7a9ab8", fontSize: "0.85rem" }}>
        Press Enter to save · {weightPct != null ? `${weightPct.toFixed(1)}% of portfolio` : ""}
      </td>
      <td>
        <button
          onClick={() => onRemove(stock.ticker)}
          style={{
            background: "none", border: "none", color: "#ff4466",
            cursor: "pointer", fontSize: "0.85rem",
          }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

/**
 * Display row — rich design matching old monolith.
 * Shows: ticker+LIVE+name, shares, price+change%, value, yield+bar, annual div "per share",
 * payout+bar, 5Y Growth, Streak, Weight%, edit/remove icons.
 */
export default function HoldingRow({
  stock, live, loading, onClick, onRemove, weightPct, onEdit,
}) {
  const [editing, setEditing] = useState(false);
  const data = live || stock;
  const price = data.price || 0;
  const value = price * (stock.shares || 0);
  const yld = data.divYield ?? stock.yld ?? 0;
  const annualDiv = data.annualDiv ?? stock.div ?? 0;
  const payout = data.payout ?? stock.payout ?? null;
  const change = data.change ?? 0;
  const income = annualDiv * (stock.shares || 0);
  const g5 = stock.g5 ?? 0;
  const streak = stock.streak ?? 0;

  if (editing) {
    return (
      <EditRow
        stock={stock}
        weightPct={weightPct}
        onRemove={onRemove}
        onEdit={(ticker, shares) => {
          setEditing(false);
          onEdit(ticker, shares);
        }}
      />
    );
  }

  return (
    <tr
      onClick={() => onClick?.(stock)}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {/* Ticker + LIVE badge + Company name */}
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, color: "#5aaff8", fontSize: "0.95rem" }}>
            {stock.ticker}
          </span>
          {live && (
            <span style={{
              fontSize: "0.45rem", color: "#00cc66", letterSpacing: "0.15em",
              padding: "1px 5px", border: "1px solid rgba(0,204,102,0.3)",
              fontWeight: 600, lineHeight: 1.4,
            }}>
              LIVE
            </span>
          )}
        </div>
        <div style={{ fontSize: "0.72rem", color: "#3a5a78", marginTop: 1 }}>
          {stock.name || stock.ticker}
        </div>
      </td>

      {/* Shares */}
      <td
        style={{ color: "#7a9ab8", cursor: "pointer", fontSize: "0.9rem" }}
        onClick={e => { e.stopPropagation(); setEditing(true); }}
        title="Click to edit"
      >
        {stock.shares?.toFixed(3)}
      </td>

      {/* Price + Change % */}
      <td>
        {loading ? (
          <span style={{ color: "#2a4a6a" }}>...</span>
        ) : (
          <div>
            <div style={{ color: "#c8dff0", fontSize: "0.9rem" }}>
              ${price.toFixed(2)}
            </div>
            {change !== 0 && (
              <div style={{
                fontSize: "0.68rem", marginTop: 1,
                color: change > 0 ? "#00cc66" : "#ff4466",
              }}>
                {change > 0 ? "+" : ""}{change.toFixed(2)}%
              </div>
            )}
          </div>
        )}
      </td>

      {/* Value */}
      <td style={{ color: "#c8dff0", fontWeight: 600, fontSize: "0.9rem" }}>
        {formatCurrency(value)}
      </td>

      {/* Yield + mini bar */}
      <td>
        <div style={{ fontSize: "0.9rem", color: "#c8dff0" }}>
          {yld > 0 ? `${yld.toFixed(2)}%` : "—"}
        </div>
        {yld > 0 && <MiniProgressBar value={yld} max={10} />}
      </td>

      {/* Annual Div per share */}
      <td>
        <div style={{ color: "#c8dff0", fontSize: "0.9rem" }}>
          {annualDiv > 0 ? `$${annualDiv.toFixed(2)}` : "—"}
        </div>
        {annualDiv > 0 && (
          <div style={{ fontSize: "0.6rem", color: "#2a4a6a", marginTop: 1 }}>per share</div>
        )}
      </td>

      {/* Payout + mini bar */}
      <td>
        <div style={{ fontSize: "0.9rem", color: "#c8dff0" }}>
          {payout != null ? `${payout}%` : "—"}
        </div>
        {payout != null && (
          <MiniProgressBar
            value={payout}
            max={100}
            color={payout > 80 ? "#ff4466" : payout > 60 ? "#ffaa33" : "#005EB8"}
          />
        )}
      </td>

      {/* 5Y Growth */}
      <td>
        {g5 > 0 ? (
          <span style={{ color: "#00cc66", fontSize: "0.85rem" }}>
            +{g5.toFixed(1)}%
          </span>
        ) : (
          <span style={{ color: "#2a4a6a" }}>—</span>
        )}
      </td>

      {/* Streak */}
      <td>
        {streak > 0 ? (
          <span style={{ color: "#7a9ab8", fontSize: "0.85rem" }}>
            {streak}y
          </span>
        ) : (
          <span style={{ color: "#2a4a6a" }}>—</span>
        )}
      </td>

      {/* Weight */}
      <td style={{ color: "#5a8ab0", fontSize: "0.85rem" }}>
        {weightPct?.toFixed(1)}%
      </td>

      {/* Edit + Remove icons */}
      <td>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={e => { e.stopPropagation(); setEditing(true); }}
            title="Edit shares"
            style={{
              background: "none", border: "none", color: "#2a4a6a",
              cursor: "pointer", fontSize: "0.85rem", padding: 2,
            }}
          >
            ✎
          </button>
          <button
            onClick={e => { e.stopPropagation(); onRemove?.(stock.ticker); }}
            title="Remove"
            style={{
              background: "none", border: "none", color: "#2a4a6a",
              cursor: "pointer", fontSize: "0.95rem", padding: 2,
            }}
          >
            ×
          </button>
        </div>
      </td>
    </tr>
  );
}
