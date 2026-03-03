import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../../utils/format';

/**
 * DRIP vs No-DRIP stacked bar chart.
 * Shows the advantage of dividend reinvestment over time.
 */
export default function DripComparisonBar({
  projData, contribVals, horizon, extraContrib, fmtY,
}) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  if (!projData) return null;

  const { noDrip, drip } = projData;
  const vals = extraContrib > 0 && contribVals ? contribVals : drip;
  const maxVal = Math.max(...vals, ...noDrip, 1);

  const H = 220;
  const padL = 60;
  const padR = 20;
  const padTop = 30;
  const padBot = 30;
  const chartW = width - padL - padR;
  const chartH = H - padTop - padBot;
  const barCount = vals.length;
  const barW = Math.max(4, (chartW / barCount) * 0.7);
  const stepW = chartW / barCount;

  return (
    <div ref={containerRef} style={{
      background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem",
    }}>
      <div style={{
        fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
        textTransform: "uppercase", marginBottom: "0.8rem",
      }}>
        DRIP vs No-DRIP — Portfolio Value
      </div>
      {hovered != null && (
        <div style={{ fontSize: "0.8rem", color: "#c8dff0", marginBottom: 4 }}>
          Year {hovered}: No-DRIP {formatCurrency(noDrip[hovered])} · DRIP {formatCurrency(vals[hovered])}
          {vals[hovered] > noDrip[hovered] && (
            <span style={{ color: "#00cc66", marginLeft: 8 }}>
              +{formatCurrency(vals[hovered] - noDrip[hovered])} advantage
            </span>
          )}
        </div>
      )}
      <svg width={width} height={H} style={{ display: "block" }}>
        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padTop + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#0a1e30" strokeWidth={0.5} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#1a4060">
                {fmtY ? fmtY(maxVal * pct) : formatCurrency(maxVal * pct)}
              </text>
            </g>
          );
        })}

        {vals.map((val, i) => {
          const noDripH = (noDrip[i] / maxVal) * chartH;
          const dripH = (val / maxVal) * chartH;
          const x = padL + i * stepW + (stepW - barW) / 2;
          const isHov = hovered === i;

          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* No-DRIP portion (dark) */}
              <rect
                x={x} y={padTop + chartH - noDripH}
                width={barW} height={noDripH}
                fill={isHov ? "#1a3a5c" : "#0a1e30"}
              />
              {/* DRIP advantage (blue) */}
              {dripH > noDripH && (
                <rect
                  x={x} y={padTop + chartH - dripH}
                  width={barW} height={dripH - noDripH}
                  fill={isHov ? "#5aaff8" : "#005EB8"}
                  opacity={isHov ? 1 : 0.8}
                />
              )}
            </g>
          );
        })}

        {/* X-axis year labels */}
        {vals.map((_, i) => {
          if (barCount > 20 && i % 5 !== 0) return null;
          const x = padL + i * stepW + stepW / 2;
          return (
            <text key={i} x={x} y={H - 8} textAnchor="middle" fontSize="9" fill="#1a4060">
              {i}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
