import React from 'react';

export default function MiniProgressBar({ value, max, color = "#005EB8" }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ width: "100%", height: 4, background: "#0a1628", position: "relative" }}>
      <div style={{
        width: `${pct}%`,
        height: "100%",
        background: color,
        transition: "width 0.3s ease",
      }} />
    </div>
  );
}
