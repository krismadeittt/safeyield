import React, { useState, useRef, useEffect } from 'react';
import MiniProgressBar from './MiniProgressBar';
import { getTaxClass } from '../data/taxData';
import { formatCurrency } from '../utils/format';

const taxBadgeColors = {
  qualified: { bg: "rgba(0,204,102,0.12)", color: "#00cc66" },
  partial: { bg: "rgba(90,175,248,0.12)", color: "#5aaff8" },
  unqualified: { bg: "rgba(255,68,102,0.12)", color: "#ff4466" },
};

/**
 * Editable row — inline share count editor.
 */
export function EditRow({ stock, weightPct, onRemove, onEdit }) {
  const [shares, setShares] = useState(String(stock.shares?.toFixed(2) || ""));
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
            width: 70, background: "#071020", border: "1px solid #1e293b",
            color: "#c8dff0", padding: "4px 8px", fontFamily: "'EB Garamond', Georgia, serif",
          }}
          autoFocus
        />
      </td>
      <td colSpan={6} style={{ color: "#7a9ab8", fontSize: "0.85rem" }}>
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
 * Display row — shows stock data in the holdings table.
 */
export default function HoldingRow({
  stock, live, loading, onClick, showIncome, onRemove, showWeight, weightPct, onEdit,
}) {
  const [editing, setEditing] = useState(false);
  const data = live || stock;
  const price = data.price || 0;
  const value = price * (stock.shares || 0);
  const yld = data.divYield ?? stock.yld ?? 0;
  const annualDiv = data.annualDiv ?? stock.div ?? 0;
  const payout = data.payout ?? stock.payout ?? null;
  const taxClass = getTaxClass(stock.ticker);
  const badge = taxBadgeColors[taxClass];
  const income = annualDiv * (stock.shares || 0);

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
      <td style={{ fontWeight: 600, color: "#5aaff8" }}>{stock.ticker}</td>
      <td
        style={{ color: "#7a9ab8", cursor: "pointer" }}
        onClick={e => { e.stopPropagation(); setEditing(true); }}
      >
        {stock.shares?.toFixed(2)}
      </td>
      <td>
        {loading ? (
          <span style={{ color: "#2a4a6a" }}>...</span>
        ) : (
          <span>${price.toFixed(2)}</span>
        )}
      </td>
      <td>{formatCurrency(value)}</td>
      <td>
        {yld > 0 ? `${yld.toFixed(2)}%` : "—"}
        {yld > 0 && <MiniProgressBar value={yld} max={10} />}
      </td>
      <td>{annualDiv > 0 ? `$${annualDiv.toFixed(2)}` : "—"}</td>
      <td>{payout != null ? `${payout}%` : "—"}</td>
      <td>
        <span style={{
          padding: "2px 8px", fontSize: "0.7rem", fontWeight: 600,
          background: badge.bg, color: badge.color,
        }}>
          {taxClass}
        </span>
      </td>
      {showIncome && <td>{formatCurrency(income)}</td>}
      {showWeight && <td>{weightPct?.toFixed(1)}%</td>}
      <td>
        <button
          onClick={e => { e.stopPropagation(); onRemove?.(stock.ticker); }}
          style={{
            background: "none", border: "none", color: "#2a4a6a",
            cursor: "pointer", fontSize: "0.75rem",
          }}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
