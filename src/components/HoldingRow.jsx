import React, { useState, useRef, useEffect } from 'react';
import MiniProgressBar from './MiniProgressBar';
import NaValue from './NaValue';
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
      <td style={{ fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.06em" }}>{stock.ticker}</td>
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
            width: 90, background: "var(--bg-input-fill)", border: "1px solid var(--bg-input-border)",
            color: "var(--text-primary)", padding: "4px 8px", fontFamily: "'EB Garamond', Georgia, serif",
          }}
          autoFocus
        />
      </td>
      <td colSpan={8} style={{ color: "var(--text-dim)", fontSize: "0.82rem" }}>
        Press Enter to save · {weightPct != null ? `${weightPct.toFixed(1)}% of portfolio` : ""}
      </td>
      <td>
        <button
          onClick={() => onRemove(stock.ticker)}
          style={{
            background: "none", border: "none", color: "#3a7abd",
            cursor: "pointer", fontSize: "0.82rem",
          }}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

/**
 * Display row — matches old monolith exactly.
 */
export default function HoldingRow({
  stock, live, loading, onClick, onRemove, weightPct, onEdit,
}) {
  const [editing, setEditing] = useState(false);
  const [rowHover, setRowHover] = useState(false);
  const data = live || {};
  // Use live price if available and > 0, otherwise fall back to holding's stored price
  const price = (live?.price > 0 ? live.price : null) || stock.price || 0;
  const value = price * (stock.shares || 0);
  const yld = (data.divYield > 0 ? data.divYield : null) ?? stock.yld ?? 0;
  const annualDiv = (data.annualDiv > 0 ? data.annualDiv : null) ?? stock.div ?? 0;
  const payout = data.payout ?? stock.payout ?? null;
  const change = data.change ?? 0;
  const g5 = data.g5 ?? stock.g5 ?? 0;
  // Use the higher of API streak (max 11yr window) and static streak (curated)
  const streak = Math.max(data.streak ?? 0, stock.streak ?? 0);

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
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => setRowHover(false)}
      style={{
        cursor: onClick ? "pointer" : "default",
        borderBottom: "1px solid var(--border-row)",
        background: rowHover ? "var(--bg-hover)" : "transparent",
        transition: "background 0.12s",
      }}
    >
      {/* Ticker + LIVE badge + Company name */}
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontWeight: 700, color: "var(--text-primary)", fontSize: "0.88rem",
            letterSpacing: "0.06em", fontFamily: "'EB Garamond', Georgia, serif",
          }}>
            {stock.ticker}
          </span>
        </div>
        <div style={{
          fontSize: "0.67rem", color: "var(--text-dim)", marginTop: 2,
          maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {stock.name || stock.ticker}
        </div>
      </td>

      {/* Shares */}
      <td
        style={{ color: "var(--text-primary)", cursor: "pointer" }}
        onClick={e => { e.stopPropagation(); setEditing(true); }}
        title="Click to edit"
      >
        {stock.shares?.toFixed(3)}
      </td>

      {/* Price + Change % */}
      <td>
        {loading ? (
          <span style={{ color: "var(--primary)", fontSize: "0.7rem" }}>···</span>
        ) : (
          <div>
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              ${price.toFixed(2)}
            </div>
            {change !== 0 && (
              <div style={{
                fontSize: "0.68rem",
                color: change > 0 ? "var(--primary)" : "#3a7abd",
              }}>
                {change > 0 ? "▲" : "▼"}{Math.abs(change).toFixed(2)}%
              </div>
            )}
          </div>
        )}
      </td>

      {/* Yield + mini bar */}
      <td>
        {yld > 0 ? (
          <div>
            <span style={{ fontWeight: 700, color: "var(--primary)" }}>
              {yld.toFixed(2)}%
            </span>
            <MiniProgressBar value={yld} max={10} color="var(--primary)" />
          </div>
        ) : (
          <NaValue reason="No dividend yield data" />
        )}
      </td>

      {/* Annual Div per share */}
      <td>
        {annualDiv > 0 ? (
          <div>
            <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
              ${annualDiv.toFixed(2)}
            </span>
            <div style={{ fontSize: "0.68rem", color: "var(--text-dim)" }}>per share</div>
          </div>
        ) : (
          <NaValue reason="No annual dividend data" />
        )}
      </td>

      {/* Payout + mini bar */}
      <td>
        {payout != null && payout !== 0 ? (
          <div>
            <span style={{ fontWeight: 700, color: payout > 80 ? "#3a7abd" : "var(--primary)" }}>
              {payout.toFixed ? payout.toFixed(0) : payout}%
            </span>
            <MiniProgressBar
              value={payout}
              max={100}
              color={payout > 80 ? "#3a7abd" : "var(--primary)"}
            />
          </div>
        ) : payout === 0 ? (
          <span style={{ fontWeight: 700, color: "var(--primary)" }}>0%</span>
        ) : (
          <NaValue reason="No payout ratio data" />
        )}
      </td>

      {/* 5Y Growth */}
      <td>
        {g5 > 0 ? (
          <span style={{ fontWeight: 700, color: "var(--primary)" }}>
            +{g5.toFixed(1)}%
          </span>
        ) : g5 < 0 ? (
          <span style={{ fontWeight: 700, color: "#3a7abd" }}>
            {g5.toFixed(1)}%
          </span>
        ) : (
          <NaValue reason="No growth data" />
        )}
      </td>

      {/* Streak */}
      <td>
        {streak > 0 ? (
          <span style={{ fontFamily: "'EB Garamond', Georgia, serif", color: "var(--text-link)" }}>
            {streak}y
          </span>
        ) : (
          <NaValue reason="No dividend streak data" />
        )}
      </td>

      {/* Weight */}
      <td style={{ color: "var(--text-link)", fontSize: "0.85rem" }}>
        {weightPct?.toFixed(1)}%
      </td>

      {/* Edit + Remove icons */}
      <td>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={e => { e.stopPropagation(); setEditing(true); }}
            title="Edit shares"
            aria-label={`Edit shares for ${stock.ticker}`}
            style={{
              background: "none", border: "none", color: "var(--text-dim)",
              cursor: "pointer", fontSize: "0.82rem", padding: 2,
            }}
          >
            ✎
          </button>
          <button
            onClick={e => { e.stopPropagation(); onRemove?.(stock.ticker); }}
            title="Remove"
            aria-label={`Remove ${stock.ticker}`}
            style={{
              background: "none", border: "none", color: "var(--text-dim)",
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
