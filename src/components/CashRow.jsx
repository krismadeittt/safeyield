import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../utils/format';

export default function CashRow({ cashBalance, onEditCash, portfolioValue, index = 0 }) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState("");
  const [rowHover, setRowHover] = useState(false);
  const ref = useRef(null);

  const weightPct = portfolioValue > 0 ? (cashBalance / portfolioValue) * 100 : 0;

  useEffect(() => {
    if (!editing) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        saveCash();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editing, editVal]);

  function saveCash() {
    const val = parseFloat(editVal);
    if (!isNaN(val) && val >= 0) onEditCash(val);
    setEditing(false);
  }

  if (editing) {
    return (
      <tr ref={ref} style={{ background: "var(--accent-bg)" }}>
        <td style={{ padding: "0.55rem 1rem" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: 13, letterSpacing: "0.04em", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
              $CASH
            </span>
            <span style={{ fontSize: "10.5px", color: "var(--text-sub)", marginTop: 2 }}>Cash Position</span>
          </div>
        </td>
        <td colSpan={2} style={{ padding: "0.55rem 1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>$</span>
            <input
              type="number"
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") saveCash();
                if (e.key === "Escape") setEditing(false);
              }}
              min="0"
              step="0.01"
              style={{
                width: 120, background: "var(--bg-pill)", border: "1px solid var(--primary)",
                color: "var(--text-primary)", padding: "4px 8px", fontFamily: "'JetBrains Mono', monospace",
                borderRadius: 6,
              }}
              autoFocus
            />
          </div>
        </td>
        <td colSpan={6} style={{ color: "var(--text-dim)", fontSize: "0.82rem", padding: "0.55rem 1rem" }}>
          Press Enter to save
        </td>
        <td></td>
      </tr>
    );
  }

  return (
    <tr
      onMouseEnter={() => setRowHover(true)}
      onMouseLeave={() => setRowHover(false)}
      style={{
        borderBottom: "1px solid var(--border-row)",
        background: index % 2 ? "var(--row-alt)" : "var(--bg-card)",
        transition: "background 0.12s",
      }}
    >
      <td style={{ padding: "0.55rem 1rem" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: 13, letterSpacing: "0.04em", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
            $CASH
          </span>
          <span style={{ fontSize: "10.5px", color: "var(--text-sub)", marginTop: 2 }}>Cash Position</span>
        </div>
      </td>
      <td style={{ color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, padding: "0.55rem 1rem" }}>
        —
      </td>
      <td style={{ padding: "0.55rem 1rem" }}>
        <div style={{ fontWeight: 700, color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          $1.00
        </div>
      </td>
      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "var(--text-dim)", padding: "0.55rem 1rem" }}>
        0.00%
      </td>
      <td style={{ color: "var(--text-dim)", fontSize: 12, padding: "0.55rem 1rem" }}>—</td>
      <td style={{ color: "var(--text-dim)", fontSize: 12, padding: "0.55rem 1rem" }}>—</td>
      <td style={{ color: "var(--text-dim)", fontSize: 12, padding: "0.55rem 1rem" }}>—</td>
      <td style={{ color: "var(--text-dim)", fontSize: 12, padding: "0.55rem 1rem" }}>—</td>
      <td style={{ color: "var(--text-dim)", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: "0.55rem 1rem" }}>
        {weightPct.toFixed(1)}%
      </td>
      <td style={{ padding: "0.55rem 1rem" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", opacity: rowHover ? 1 : 0, transition: "opacity 0.15s" }}>
          <button
            onClick={e => {
              e.stopPropagation();
              setEditVal(String(cashBalance));
              setEditing(true);
            }}
            title="Edit cash amount"
            aria-label="Edit cash amount"
            style={{
              background: "none", border: "none", color: "var(--text-dim)",
              cursor: "pointer", fontSize: "0.82rem", padding: 2,
            }}
          >
            ✎
          </button>
        </div>
      </td>
    </tr>
  );
}

export function CashCardMobile({ cashBalance, onEditCash, portfolioValue, editing, setEditing, editValue, setEditValue }) {
  const weightPct = portfolioValue > 0 ? (cashBalance / portfolioValue) * 100 : 0;

  function saveCash() {
    const val = parseFloat(editValue);
    if (!isNaN(val) && val >= 0) onEditCash(val);
    setEditing(false);
  }

  return (
    <div style={{
      padding: "0.8rem", borderBottom: "1px solid var(--border-row)",
      background: "var(--bg-card)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: "var(--text-muted)", fontSize: "0.95rem", letterSpacing: "0.06em" }}>
          $CASH
        </span>
        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.9rem", fontFamily: "'JetBrains Mono', monospace" }}>
          {formatCurrency(cashBalance)}
        </span>
      </div>
      <div style={{ fontSize: "0.7rem", color: "var(--text-sub)", marginBottom: 8 }}>Cash Position</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 8 }}>
        <MobileCashMetric label="Yield" value="0.00%" />
        <MobileCashMetric label="Div" value="—" />
        <MobileCashMetric label="Growth" value="—" />
        <MobileCashMetric label="Weight" value={`${weightPct.toFixed(1)}%`} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {editing ? (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1 }} onClick={e => e.stopPropagation()}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>$</span>
            <input
              type="number"
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") saveCash();
                if (e.key === "Escape") setEditing(false);
              }}
              min="0"
              step="0.01"
              autoFocus
              aria-label="Edit cash amount"
              style={{
                width: 100, padding: "6px 8px",
                background: "var(--bg-pill)", border: "1px solid var(--primary)",
                color: "var(--text-primary)", fontFamily: "'JetBrains Mono', monospace",
                fontSize: "0.85rem", borderRadius: 8,
              }}
            />
            <button onClick={saveCash} style={{
              background: "var(--primary)", border: "none", color: "white",
              padding: "6px 12px", cursor: "pointer", fontSize: "0.75rem",
              minHeight: 44, fontWeight: 600, borderRadius: 8,
            }}>Save</button>
            <button onClick={() => setEditing(false)} style={{
              background: "var(--bg-pill)", border: "none", color: "var(--text-muted)",
              padding: "6px 10px", cursor: "pointer", fontSize: "0.75rem",
              minHeight: 44, borderRadius: 8,
            }}>Cancel</button>
          </div>
        ) : (
          <>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCurrency(cashBalance)}
            </span>
            <button
              onClick={e => {
                e.stopPropagation();
                setEditValue(String(cashBalance));
                setEditing(true);
              }}
              style={{
                background: "var(--bg-pill)", border: "none", color: "var(--text-muted)",
                padding: "6px 14px", cursor: "pointer", fontSize: "0.75rem",
                minHeight: 44, minWidth: 44, borderRadius: 8,
              }}
              aria-label="Edit cash amount"
            >Edit</button>
          </>
        )}
      </div>
    </div>
  );
}

function MobileCashMetric({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-dim)", fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
    </div>
  );
}
