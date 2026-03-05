import React from 'react';

export function MetricBox({ label, value, color }) {
  return (
    <div style={{
      background: "var(--bg-hover-subtle)",
      padding: "5px 7px",
      border: "1px solid var(--border-subtle)",
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 7, color: "var(--text-dim)", letterSpacing: 1.5, fontFamily: "'DM Sans', system-ui, sans-serif" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color, marginTop: 1, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}

export default function VizTooltip({ mouse, containerRef, children, width = 240, height = 340, docked = false }) {
  const shared = {
    width,
    background: "var(--bg-overlay-nav)",
    border: "1px solid var(--border-accent)",
    padding: 14,
    boxShadow: "0 16px 48px rgba(0,0,0,0.12)",
    borderRadius: 12,
    pointerEvents: "none",
    zIndex: 50,
    backdropFilter: "blur(8px)",
  };

  if (docked) {
    return (
      <div style={{
        ...shared,
        margin: "12px auto 0",
        transition: "opacity 0.15s ease-out",
      }}>
        {children}
      </div>
    );
  }

  const cw = containerRef.current?.clientWidth || 900;
  const ch = containerRef.current?.clientHeight || 900;

  const gap = 14;
  const inRight = mouse.x > cw / 2;
  const inBottom = mouse.y > ch / 2;

  const rawX = inRight ? mouse.x - width - gap : mouse.x + gap;
  const rawY = inBottom ? mouse.y - height - gap : mouse.y + gap;

  const x = Math.max(4, Math.min(rawX, cw - width - 4));
  const y = Math.max(4, Math.min(rawY, ch - height - 4));

  return (
    <div style={{
      ...shared,
      position: "absolute",
      left: x,
      top: y,
      transition: "left 0.06s ease-out, top 0.06s ease-out",
    }}>
      {children}
    </div>
  );
}
