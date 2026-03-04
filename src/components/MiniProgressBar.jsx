import React from 'react';

export default function MiniProgressBar({ value, max, color = "var(--primary)" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ height: 4, background: "var(--border-dim)", marginTop: 3, overflow: "hidden", borderRadius: 2 }}>
      <div style={{
        width: `${pct}%`,
        height: "100%",
        background: color,
        borderRadius: 2,
      }} />
    </div>
  );
}
