import React, { useState, useRef, useEffect } from 'react';
import MiniProgressBar from './MiniProgressBar';
import NaValue from './NaValue';
import { formatCurrency } from '../utils/format';
import { extractTickerMetrics } from '../utils/tickerData';

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
    <tr ref={ref} style={{ background: "var(--accent-bg)" }}>
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
            width: 90, background: "var(--bg-pill)", border: "1px solid var(--primary)",
            color: "var(--text-primary)", padding: "4px 8px", fontFamily: "'JetBrains Mono', monospace",
            borderRadius: 6,
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
            background: "none", border: "none", color: "var(--red)",
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
 * Display row — redesigned for light theme.
 */
export default function HoldingRow({
  stock, live, loading, onClick, onRemove, weightPct, onEdit, index = 0,
}) {
  const [editing, setEditing] = useState(false);
  const [rowHover, setRowHover] = useState(false);
  const m = extractTickerMetrics(live, stock);
  const price = m.price;
  const value = price * (stock.shares || 0);
  const yld = m.divYield;
  const annualDiv = m.annualDiv;
  const payout = m.payout;
  const change = m.change;
  const g5 = m.g5;
  const streak = m.streak;

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

  // Yield color coding
  const yieldColor = yld >= 3 ? "var(--warning)" : yld >= 2 ? "var(--primary)" : "var(--text-secondary)";
  const yieldWeight = yld >= 3 ? 700 : 600;

  // Payout bar: 48px x 4px
  const payoutBarColor = payout >= 80 ? "var(--red)" : payout >= 60 ? "var(--warning)" : "var(--green)";

  return (
    <tr
      onClick={() => onClick?.(stock)}
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => setRowHover(false)}
      style={{
        cursor: onClick ? "pointer" : "default",
        borderBottom: "1px solid var(--border-row)",
        background: rowHover ? "var(--bg-pill)" : (index % 2 ? "var(--row-alt)" : "var(--bg-card)"),
        transition: "background 0.12s",
      }}
    >
      {/* Ticker + Company name */}
      <td>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{
            fontWeight: 700, color: "var(--text-primary)", fontSize: "13px",
            letterSpacing: "0.04em", fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            {stock.ticker}
          </span>
          <span style={{
            fontSize: "10.5px", color: "var(--text-sub)", marginTop: 2,
            maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {stock.name || stock.ticker}
          </span>
        </div>
      </td>

      {/* Shares */}
      <td
        style={{ color: "var(--text-primary)", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
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
            <div style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
              ${price.toFixed(2)}
            </div>
            {change !== 0 && (
              <div style={{
                fontSize: "9.5px",
                color: change > 0 ? "var(--green)" : "var(--red)",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {change > 0 ? "▲" : "▼"}{Math.abs(change).toFixed(2)}%
              </div>
            )}
          </div>
        )}
      </td>

      {/* Yield */}
      <td>
        {yld > 0 ? (
          <span style={{ fontWeight: yieldWeight, color: yieldColor, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
            {yld.toFixed(2)}%
          </span>
        ) : (
          <NaValue reason="No dividend yield data" />
        )}
      </td>

      {/* Annual Div per share */}
      <td>
        {annualDiv > 0 ? (
          <div>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
              ${annualDiv.toFixed(2)}
            </span>
            <div style={{ fontSize: "9.5px", color: "var(--text-sub)" }}>per share</div>
          </div>
        ) : (
          <NaValue reason="No annual dividend data" />
        )}
      </td>

      {/* Payout + bar */}
      <td>
        {payout != null && payout !== 0 ? (
          <div>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
              {payout.toFixed ? payout.toFixed(0) : payout}%
            </span>
            <div style={{
              width: 48, height: 4, background: "var(--border-dim)", borderRadius: 2, marginTop: 4,
            }}>
              <div style={{
                width: `${Math.min(payout, 100)}%`, height: "100%",
                background: payoutBarColor, borderRadius: 2,
              }} />
            </div>
          </div>
        ) : payout === 0 ? (
          <span style={{ fontWeight: 600, color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>0%</span>
        ) : (
          <NaValue reason="No payout ratio data" />
        )}
      </td>

      {/* 5Y Growth */}
      <td>
        {g5 > 0 ? (
          <span style={{ fontWeight: 600, color: "var(--green)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
            +{g5.toFixed(1)}%
          </span>
        ) : g5 < 0 ? (
          <span style={{ fontWeight: 600, color: "var(--red)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
            {g5.toFixed(1)}%
          </span>
        ) : (
          <NaValue reason="No growth data" />
        )}
      </td>

      {/* Streak */}
      <td>
        {streak > 0 ? (
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
            background: "var(--bg-pill)", padding: "2px 8px", borderRadius: 8,
            color: "var(--text-secondary)",
          }}>
            {streak}y
          </span>
        ) : (
          <NaValue reason="No dividend streak data" />
        )}
      </td>

      {/* Weight */}
      <td style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
        {weightPct?.toFixed(1)}%
      </td>

      {/* Edit + Remove icons */}
      <td>
        <div style={{ display: "flex", gap: 8, alignItems: "center", opacity: rowHover ? 1 : 0, transition: "opacity 0.15s" }}>
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
