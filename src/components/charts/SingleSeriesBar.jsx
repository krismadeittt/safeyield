import React, { useState, useRef, useEffect } from 'react';

/**
 * Single-series SVG bar chart.
 * Used for income projections, fundamentals sparklines, etc.
 */
export default function SingleSeriesBar({
  pts, valKey = "value", color = "#005EB8", fmt, H = 160, PL = 50, PB = 30,
  labelKey = "label", sharedHov = null, onHov = null,
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

  if (!pts?.length) return null;

  const padTop = 20;
  const PR = 20;
  const chartW = width - PL - PR;
  const chartH = H - padTop - PB;
  const maxVal = Math.max(...pts.map(p => p[valKey] || 0), 1);
  const barW = Math.max(3, (chartW / pts.length) * 0.65);
  const stepW = chartW / pts.length;

  const currentYear = new Date().getFullYear();

  return (
    <div ref={containerRef} style={{ width: "100%" }}>
      <svg width={width} height={H} style={{ display: "block" }}>
        {/* Y-axis */}
        {[0, 0.5, 1].map(pct => {
          const y = padTop + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={PL} y1={y} x2={width - PR} y2={y} stroke="#0a1e30" strokeWidth={0.5} />
              <text x={PL - 6} y={y + 3} textAnchor="end" fontSize="8" fill="#1a4060">
                {fmt ? fmt(maxVal * pct) : (maxVal * pct).toFixed(0)}
              </text>
            </g>
          );
        })}

        {pts.map((p, i) => {
          const val = p[valKey] || 0;
          const barH = (val / maxVal) * chartH;
          const x = PL + i * stepW + (stepW - barW) / 2;
          const y = padTop + chartH - barH;
          const isHov = hovIdx === i;
          const isPast = p.yr != null && p.yr < currentYear;

          return (
            <g key={i}
              onMouseEnter={() => { setHovered(i); onHov?.(i); }}
              onMouseLeave={() => { setHovered(null); onHov?.(null); }}
            >
              <rect
                x={x} y={y} width={barW} height={barH}
                fill={isHov ? "#5aaff8" : color}
                opacity={isPast ? 0.5 : (isHov ? 1 : 0.8)}
              />
              {isHov && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="9" fill="#c8dff0">
                  {fmt ? fmt(val) : val.toFixed(2)}
                </text>
              )}
            </g>
          );
        })}

        {/* X-axis labels */}
        {pts.map((p, i) => {
          if (pts.length > 15 && i % Math.ceil(pts.length / 10) !== 0) return null;
          return (
            <text key={i} x={PL + i * stepW + stepW / 2} y={H - 6}
              textAnchor="middle" fontSize="8" fill="#1a4060">
              {p[labelKey] || i}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
