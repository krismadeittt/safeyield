import React from 'react';

export default function MiniProgressBar({ value, max, color = "#005EB8" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ height: 4, background: "#1a3a5c", marginTop: 3, overflow: "hidden" }}>
      <div style={{
        width: `${pct}%`,
        height: "100%",
        background: color,
      }} />
    </div>
  );
}
