import React, { useState, useRef, useEffect } from 'react';

/**
 * Multi-series SVG line chart.
 * Used for DRIP vs No-DRIP portfolio value lines, fundamentals sparklines, etc.
 */
export default function MultiLineChart({
  pts, keys, colors, dashes = [], fmt, H = 180, PL = 50, PB = 30,
  sharedHov = null, onHov = null,
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(600);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const hovIdx = sharedHov !== null ? sharedHov : hovered;

  if (!pts?.length || !keys?.length) return null;

  const padTop = 20;
  const PR = 20;
  const chartW = width - PL - PR;
  const chartH = H - padTop - PB;

  // Find global min/max across all series
  let maxVal = -Infinity;
  let minVal = Infinity;
  keys.forEach(k => {
    pts.forEach(p => {
      const v = p[k];
      if (v != null) {
        if (v > maxVal) maxVal = v;
        if (v < minVal) minVal = v;
      }
    });
  });
  if (minVal === maxVal) { maxVal += 1; minVal -= 1; }
  const range = maxVal - minVal;

  const getX = (i) => PL + (i / Math.max(pts.length - 1, 1)) * chartW;
  const getY = (v) => padTop + chartH - ((v - minVal) / range) * chartH;

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg width={width} height={H} style={{ display: "block" }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padTop + chartH * (1 - pct);
          const val = minVal + range * pct;
          return (
            <g key={pct}>
              <line x1={PL} y1={y} x2={width - PR} y2={y} stroke="#0a1e30" strokeWidth={0.5} />
              <text x={PL - 6} y={y + 3} textAnchor="end" fontSize="8" fill="#1a4060">
                {fmt ? fmt(val) : val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Lines */}
        {keys.map((key, ki) => {
          const points = pts
            .map((p, i) => p[key] != null ? `${getX(i)},${getY(p[key])}` : null)
            .filter(Boolean)
            .join(" ");
          return (
            <polyline
              key={key}
              points={points}
              fill="none"
              stroke={colors[ki] || "#005EB8"}
              strokeWidth={1.5}
              strokeDasharray={dashes[ki] || "none"}
            />
          );
        })}

        {/* Hover crosshair */}
        {hovIdx != null && hovIdx >= 0 && hovIdx < pts.length && (
          <g>
            <line
              x1={getX(hovIdx)} y1={padTop}
              x2={getX(hovIdx)} y2={padTop + chartH}
              stroke="#2a4a6a" strokeWidth={0.5}
            />
            {keys.map((key, ki) => {
              const val = pts[hovIdx]?.[key];
              if (val == null) return null;
              return (
                <circle
                  key={key}
                  cx={getX(hovIdx)} cy={getY(val)} r={3}
                  fill={colors[ki] || "#005EB8"}
                />
              );
            })}
          </g>
        )}

        {/* Invisible hover rects */}
        {pts.map((_, i) => (
          <rect
            key={i}
            x={getX(i) - chartW / pts.length / 2}
            y={padTop}
            width={chartW / pts.length}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => { setHovered(i); onHov?.(i); }}
            onMouseLeave={() => { setHovered(null); onHov?.(null); }}
          />
        ))}

        {/* X-axis labels */}
        {pts.map((p, i) => {
          if (pts.length > 20 && i % 5 !== 0) return null;
          return (
            <text key={i} x={getX(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="#1a4060">
              {p.label || i}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
