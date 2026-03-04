import React from 'react';

export function MetricBox({ label, value, color }) {
  return (
    <div style={{
      background: "var(--bg-hover-subtle)",
      padding: "5px 7px",
      border: "1px solid var(--border-subtle)",
    }}>
      <div style={{ fontSize: 7, color: "var(--text-dim)", letterSpacing: 1.5 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color, marginTop: 1 }}>{value}</div>
    </div>
  );
}

export default function VizTooltip({ mouse, containerRef, children, width = 240, height = 340 }) {
  const cw = containerRef.current?.clientWidth || 900;
  const ch = containerRef.current?.clientHeight || 900;
  const x = Math.min(Math.max(mouse.x + 18, 8), cw - width - 8);
  const y = Math.min(Math.max(mouse.y + 14, 8), ch - height - 8);

  return (
    <div style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      background: "var(--bg-overlay-nav)",
      border: "1px solid var(--border-accent)",
      padding: 14,
      boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
      pointerEvents: "none",
      zIndex: 50,
      backdropFilter: "blur(8px)",
      transition: "left 0.06s ease-out, top 0.06s ease-out",
    }}>
      {children}
    </div>
  );
}
