import React, { useState, useRef, useEffect } from 'react';
import { shortMoney } from '../../utils/format';

/**
 * Monte Carlo fan chart — shows percentile bands (P10–P90) as shaded areas.
 * Neon aesthetic matching HistoricalProjectedChart.
 *
 * Props:
 *   mcResult: { years: number[], bands: { p10, p25, p50, p75, p90 }[] }
 *   price: current share price (for normalizing to $1 invested)
 *   title: chart title
 *   subtitle: chart subtitle
 */
export default function MonteCarloFanChart({ mcResult, price, title, subtitle }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(600);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  if (!mcResult || !mcResult.bands?.length) return null;

  const { years, bands } = mcResult;
  const n = years.length;

  // Layout
  const padL = 60;
  const padR = 15;
  const padTop = 16;
  const padBot = 30;
  const chartH = 280;
  const svgH = chartH + padTop + padBot;
  const svgW = Math.max(200, width - 32);
  const chartW = svgW - padL - padR;

  // Value range
  const allVals = bands.flatMap(b => [b.p10, b.p90]);
  const maxVal = Math.max(...allVals) * 1.05;
  const minVal = Math.min(...allVals) * 0.95;
  const range = maxVal - minVal || 1;

  const xForYear = i => padL + (i / (n - 1)) * chartW;
  const yForVal = v => padTop + ((maxVal - v) / range) * chartH;

  // Build SVG path strings for bands
  const pathPoints = (key) => bands.map((b, i) => `${xForYear(i)},${yForVal(b[key])}`);

  // Band area: upper line forward, lower line backward
  const bandPath = (upperKey, lowerKey) => {
    const upper = bands.map((b, i) => `${xForYear(i)},${yForVal(b[upperKey])}`);
    const lower = bands.map((b, i) => `${xForYear(i)},${yForVal(b[lowerKey])}`).reverse();
    return `M${upper.join(' L')} L${lower.join(' L')} Z`;
  };

  // Median line
  const medianPath = `M${pathPoints('p50').join(' L')}`;

  // Grid lines (4 lines)
  const gridLines = [];
  const step = range / 4;
  for (let i = 0; i <= 4; i++) {
    gridLines.push(minVal + step * i);
  }

  // Tooltip
  const hovData = hovered != null ? bands[hovered] : null;
  const hovYear = hovered != null ? years[hovered] : null;

  // Stat cards
  const finalBand = bands[bands.length - 1];
  const medianReturn = bands[0].p50 > 0 ? ((finalBand.p50 / bands[0].p50 - 1) * 100).toFixed(0) : "0";

  return (
    <div ref={containerRef} style={{
      background: "var(--bg-card)", border: "1px solid var(--border-accent)", marginBottom: "1rem",
    }}>
      {/* Header */}
      <div style={{ padding: "1.2rem 1.2rem 0" }}>
        <div style={{
          fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          {title || "Monte Carlo Returns Projection"}
        </div>
        {subtitle && (
          <div style={{
            fontSize: "0.7rem", color: "var(--text-dim)", marginTop: 2,
            fontFamily: "'DM Sans', system-ui, sans-serif", fontStyle: "italic",
          }}>
            {subtitle}
          </div>
        )}

        {/* Stat cards */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
          gap: 0, marginTop: "0.8rem",
        }}>
          {[
            { label: "Bearish (P10)", value: shortMoney(finalBand.p10), color: "var(--red)" },
            { label: "Conservative (P25)", value: shortMoney(finalBand.p25), color: "var(--warning)" },
            { label: "Median (P50)", value: shortMoney(finalBand.p50), color: "var(--green)" },
            { label: "Bullish (P90)", value: shortMoney(finalBand.p90), color: "var(--primary)" },
          ].map((card, i) => (
            <div key={i} style={{
              padding: "0.7rem 0.6rem", border: "1px solid var(--border-accent)",
              marginRight: i < 3 ? -1 : 0, marginBottom: -1,
            }}>
              <div style={{
                fontSize: "0.45rem", color: "var(--text-dim)", textTransform: "uppercase",
                letterSpacing: "0.12em", marginBottom: "0.3rem", fontFamily: "system-ui",
              }}>
                {card.label}
              </div>
              <div style={{
                fontSize: "1.05rem", fontWeight: 700, color: card.color, lineHeight: 1,
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: "0.8rem" }}>
          <LegendItem color="rgba(90,175,248,0.15)" label="P10–P90 range" />
          <LegendItem color="rgba(42,138,58,0.25)" label="P25–P75 range" />
          <LegendItem color="var(--primary)" label="Median (P50)" />
          <span style={{
            fontSize: "0.65rem", color: "var(--text-dim)", fontFamily: "'DM Sans', system-ui, sans-serif",
            fontStyle: "italic", marginLeft: "auto",
          }}>
            +{medianReturn}% median return
          </span>
        </div>
      </div>

      {/* Tooltip area */}
      <div style={{
        height: 38, display: "flex", alignItems: "center",
        justifyContent: "center", padding: "0 1rem",
      }}>
        {hovData ? (
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border-accent)",
            padding: "4px 16px", display: "inline-flex", gap: 12, alignItems: "center",
          }}>
            <span style={{
              fontSize: "0.72rem", color: "#5a8ab8",
              fontFamily: "system-ui", fontWeight: 600,
            }}>
              Year {hovYear}
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--red)", fontFamily: "system-ui" }}>
              P10: {shortMoney(hovData.p10)}
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--warning)", fontFamily: "system-ui" }}>
              P25: {shortMoney(hovData.p25)}
            </span>
            <span style={{ fontSize: "0.8rem", color: "var(--green)", fontWeight: 700, fontFamily: "system-ui" }}>
              P50: {shortMoney(hovData.p50)}
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--primary)", fontFamily: "system-ui" }}>
              P90: {shortMoney(hovData.p90)}
            </span>
          </div>
        ) : (
          <span style={{
            fontSize: "0.5rem", color: "var(--text-label)", letterSpacing: "0.15em",
            textTransform: "uppercase", fontFamily: "system-ui",
          }}>
            1,000 simulations · CAPM + GBM · DRIP reinvested quarterly
          </span>
        )}
      </div>

      {/* SVG Chart */}
      <svg width={svgW} height={svgH} style={{ display: "block" }}>
        <defs>
          <filter id="mc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {gridLines.map((val, i) => {
          const y = yForVal(val);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={svgW - padR} y2={y}
                stroke="var(--border-dim)" strokeWidth={0.5} />
              <text x={padL - 8} y={y + 3} textAnchor="end"
                fontSize="8" fill="var(--text-label)" fontFamily="system-ui">
                {shortMoney(val)}
              </text>
            </g>
          );
        })}

        {/* P10–P90 band (outer, light) */}
        <path d={bandPath('p90', 'p10')}
          fill="rgba(90,175,248,0.08)" stroke="none" />

        {/* P25–P75 band (inner, darker) */}
        <path d={bandPath('p75', 'p25')}
          fill="rgba(42,138,58,0.15)" stroke="none" />

        {/* P10 and P90 lines (faint) */}
        <path d={`M${pathPoints('p90').join(' L')}`}
          fill="none" stroke="#3a9aff" strokeWidth={0.8} opacity={0.3}
          strokeDasharray="3,3" />
        <path d={`M${pathPoints('p10').join(' L')}`}
          fill="none" stroke="var(--red)" strokeWidth={0.8} opacity={0.3}
          strokeDasharray="3,3" />

        {/* P25 and P75 lines */}
        <path d={`M${pathPoints('p75').join(' L')}`}
          fill="none" stroke="var(--green)" strokeWidth={0.8} opacity={0.4} />
        <path d={`M${pathPoints('p25').join(' L')}`}
          fill="none" stroke="var(--warning)" strokeWidth={0.8} opacity={0.4} />

        {/* Median line (P50) — bold with glow */}
        <path d={medianPath}
          fill="none" stroke="var(--primary)" strokeWidth={2.5}
          filter="url(#mc-glow)" opacity={0.9} />

        {/* Hover interaction zones + vertical lines */}
        {years.map((yr, i) => {
          const x = xForYear(i);
          const halfStep = i < n - 1 ? (xForYear(i + 1) - x) / 2 : chartW / (n - 1) / 2;
          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "crosshair" }}
            >
              {/* Invisible wide hit area */}
              <rect x={x - halfStep} y={padTop} width={halfStep * 2} height={chartH}
                fill="transparent" />
              {/* Hover vertical line */}
              {hovered === i && (
                <>
                  <line x1={x} y1={padTop} x2={x} y2={padTop + chartH}
                    stroke="var(--primary)" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                  {/* Dots at each percentile */}
                  {['p10', 'p25', 'p50', 'p75', 'p90'].map(key => (
                    <circle key={key} cx={x} cy={yForVal(bands[i][key])} r={3}
                      fill={key === 'p50' ? 'var(--primary)' : key === 'p10' ? 'var(--red)' : key === 'p90' ? 'var(--primary)' : 'var(--green)'}
                      filter={key === 'p50' ? 'url(#mc-glow)' : undefined}
                      opacity={0.9} />
                  ))}
                </>
              )}
            </g>
          );
        })}

        {/* Starting dot */}
        <circle cx={xForYear(0)} cy={yForVal(bands[0].p50)} r={4}
          fill="#ffffff" filter="url(#mc-glow)" />

        {/* X-axis labels */}
        {years.map((yr, i) => {
          const x = xForYear(i);
          return (
            <text key={i} x={x} y={svgH - 6}
              textAnchor="middle" fontSize={n > 15 ? 7 : 9}
              fill={hovered === i ? "var(--primary)" : "var(--text-label)"}
              fontWeight={hovered === i ? 700 : 400}
              fontFamily="system-ui">
              {yr === 0 ? "Now" : `Y${yr}`}
            </text>
          );
        })}
      </svg>

      {/* Footer */}
      <div style={{
        padding: "0.4rem 1.2rem", display: "flex", justifyContent: "flex-end",
        borderTop: "1px solid var(--border-dim)",
      }}>
        <span style={{
          fontSize: "0.6rem", color: "var(--border-accent)", fontStyle: "italic",
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          CAPM + GBM · divs reinvested quarterly · 1,000 paths
        </span>
      </div>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <div style={{ width: 14, height: 8, background: color, border: "1px solid var(--border-accent)" }} />
      <span style={{ fontSize: "0.65rem", color: "#5a8ab8", fontFamily: "'DM Sans', system-ui, sans-serif" }}>{label}</span>
    </div>
  );
}
