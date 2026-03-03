import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../../utils/format';

/**
 * DRIP vs No-DRIP stacked bar chart with SVG tooltip (no layout shift).
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
  const n = (v) => formatCurrency(v);

  const H = 250;
  const padL = 60;
  const padR = 20;
  const padTop = 30;
  const padBot = 30;
  const chartW = width - padL - padR;
  const chartH = H - padTop - padBot;
  const barCount = vals.length;
  const barW = Math.max(4, (chartW / barCount) * 0.7);
  const stepW = chartW / barCount;

  // Tooltip positioning
  const hovData = hovered != null ? {
    label: `Year ${hovered}`,
    nodrip: noDrip[hovered] || 0,
    drip: vals[hovered] || 0,
  } : null;

  let tipX = 0, tipY = 0, flipLeft = false;
  if (hovData != null) {
    tipX = padL + hovered * stepW + stepW / 2;
    tipY = padTop + 10;
    flipLeft = tipX > width - 180;
  }

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
      <svg width={width} height={H} style={{ display: "block" }}>
        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padTop + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#081828" strokeWidth={0.5} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#1a4060">
                {fmtY ? fmtY(maxVal * pct) : n(maxVal * pct)}
              </text>
            </g>
          );
        })}

        {vals.map((val, i) => {
          const noDripH = (noDrip[i] / maxVal) * chartH;
          const dripH = (val / maxVal) * chartH;
          const x = padL + i * stepW + (stepW - barW) / 2;
          const isHov = hovered === i;
          const midX = x + barW / 2;

          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            >
              {/* No-DRIP portion */}
              <rect
                x={x} y={padTop + chartH - noDripH}
                width={barW} height={noDripH}
                fill={isHov ? "#2a4a70" : "#1a3050"}
                opacity={isHov ? 1 : 0.85}
              />
              {/* DRIP advantage */}
              {dripH > noDripH && (
                <rect
                  x={x} y={padTop + chartH - dripH}
                  width={barW} height={dripH - noDripH}
                  fill={isHov ? "#1a8eff" : "#005EB8"}
                  opacity={isHov ? 1 : 0.75}
                />
              )}
              {/* Year label below bar */}
              <text
                x={midX} y={H - padBot + 14}
                textAnchor="middle" fontSize={9}
                fill={isHov ? "#5a9ad0" : "#1e3a58"}
                fontFamily="system-ui"
              >
                {barCount > 20 && i % 5 !== 0 ? "" : i}
              </text>
            </g>
          );
        })}

        {/* SVG tooltip box — follows hovered bar */}
        {hovData && (
          <g>
            <rect
              x={flipLeft ? tipX - 154 : tipX + 10}
              y={tipY}
              width={144} height={76}
              fill="#071020" stroke="#1a3a5c" strokeWidth={1}
            />
            <text x={flipLeft ? tipX - 146 : tipX + 18} y={tipY + 14}
              fontSize={10} fontWeight={700} fill="#c8dff0" fontFamily="system-ui">
              {hovData.label}
            </text>
            <text x={flipLeft ? tipX - 146 : tipX + 18} y={tipY + 30}
              fontSize={9.5} fill="#5a8ab0" fontFamily="system-ui">
              No DRIP: {n(hovData.nodrip)}
            </text>
            <text x={flipLeft ? tipX - 146 : tipX + 18} y={tipY + 46}
              fontSize={9.5} fill="#1a8eff" fontFamily="system-ui">
              DRIP: {n(hovData.drip)}
            </text>
            <text x={flipLeft ? tipX - 146 : tipX + 18} y={tipY + 62}
              fontSize={9.5} fontWeight={700} fill="#005EB8" fontFamily="system-ui">
              Advantage: +{n(hovData.drip - hovData.nodrip)}
              {hovData.nodrip > 0 && ` (${((hovData.drip - hovData.nodrip) / hovData.nodrip * 100).toFixed(1)}%)`}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
