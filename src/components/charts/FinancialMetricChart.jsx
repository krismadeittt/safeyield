import React, { useState, useRef, useEffect, useMemo } from 'react';
import useIsMobile from '../../hooks/useIsMobile';

let instanceCounter = 0;

/**
 * Reusable neon bar chart — historical (green) + projected (blue) bars
 * with "Now" divider, hover glow, stat cards, and negative bar support.
 */
export default function FinancialMetricChart({
  title,
  subtitle,
  statCards = [],
  historicalData = [],
  projectedData = [],
  formatValue = v => String(v),
  height = 220,
}) {
  const isMobile = useIsMobile();
  const containerRef = useRef(null);
  const [width, setWidth] = useState(isMobile ? 340 : 600);
  const [hovered, setHovered] = useState(null);
  const [filterId] = useState(() => `fmc-glow-${++instanceCounter}`);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const allBars = useMemo(() => {
    const hist = historicalData.map(d => ({ ...d, isHistorical: true }));
    const proj = projectedData.map(d => ({ ...d, isHistorical: false }));
    return [...hist, ...proj];
  }, [historicalData, projectedData]);

  if (allBars.length === 0) return null;

  const nowIndex = historicalData.length - 1;
  const barCount = allBars.length;

  // Layout
  const padL = isMobile ? 35 : 55;
  const padR = 10;
  const svgW = Math.max(100, width - 32);
  const chartW = svgW - padL - padR;
  const padTop = 12;
  const padBot = 28;
  const chartH = height - padTop - padBot;
  const stepW = chartW / barCount;
  const barW = Math.max(3, Math.min(stepW * 0.65, 20));

  // Compute value range (support negatives)
  const values = allBars.map(b => b.value);
  const rawMax = Math.max(...values, 0);
  const rawMin = Math.min(...values, 0);
  const range = rawMax - rawMin || 1;
  const maxVal = rawMax + range * 0.05;
  const minVal = rawMin - range * 0.05;
  const totalRange = maxVal - minVal;

  // Zero line position
  const zeroY = padTop + ((maxVal - 0) / totalRange) * chartH;

  // Y position for a value
  const yForVal = v => padTop + ((maxVal - v) / totalRange) * chartH;

  // Axis labels
  const getLabel = d => {
    if (!d.date) return '';
    return d.date.slice(0, 4);
  };

  // Only show label for first bar of each year
  const axisLabels = useMemo(() => {
    const labels = [];
    let lastYear = '';
    allBars.forEach((b, i) => {
      const yr = getLabel(b);
      if (yr !== lastYear) {
        labels.push({ i, label: yr });
        lastYear = yr;
      }
    });
    return labels;
  }, [allBars]);

  // Tooltip data
  const hovBar = hovered != null ? allBars[hovered] : null;

  // Grid lines (3-5 lines)
  const gridLines = useMemo(() => {
    const lines = [];
    const step = totalRange / 4;
    for (let i = 0; i <= 4; i++) {
      const val = minVal + step * i;
      lines.push(val);
    }
    return lines;
  }, [minVal, totalRange]);

  // "Now" divider X
  const nowX = padL + (nowIndex + 0.5) * stepW;

  return (
    <div ref={containerRef} style={{
      background: "var(--bg-card)", border: "1px solid var(--border-accent)", marginBottom: "1rem",
    }}>
      {/* Header */}
      <div style={{ padding: "1.2rem 1.2rem 0" }}>
        <div style={{
          fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)",
          fontFamily: "'Playfair Display', Georgia, serif",
        }}>
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: "0.7rem", color: "var(--text-dim)", marginTop: 2,
            fontFamily: "Georgia, serif", fontStyle: "italic",
          }}>
            {subtitle}
          </div>
        )}

        {/* Stat cards */}
        {statCards.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? `repeat(${Math.min(statCards.length, 2)}, 1fr)`
              : `repeat(${Math.min(statCards.length, 4)}, 1fr)`,
            gap: 0, marginTop: "0.8rem",
          }}>
            {statCards.map((card, i) => (
              <div key={i} style={{
                padding: "0.7rem 0.8rem",
                border: "1px solid var(--border-accent)",
                marginRight: i < statCards.length - 1 ? -1 : 0,
                marginBottom: -1,
              }}>
                <div style={{
                  fontSize: "0.5rem", color: "var(--text-dim)", textTransform: "uppercase",
                  letterSpacing: "0.15em", marginBottom: "0.3rem", fontFamily: "system-ui",
                }}>
                  {card.label}
                </div>
                <div style={{
                  fontSize: "1.15rem", fontWeight: 700,
                  color: card.color || "var(--text-primary)", lineHeight: 1,
                  fontFamily: "'Playfair Display', Georgia, serif",
                }}>
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tooltip area */}
      <div style={{
        height: 36, display: "flex", alignItems: "center",
        justifyContent: "center", padding: "0 1rem",
      }}>
        {hovBar ? (
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border-accent)",
            padding: "4px 16px", display: "inline-flex", gap: 10, alignItems: "center",
          }}>
            <span style={{
              fontSize: "0.72rem", color: "var(--text-link)",
              fontFamily: "system-ui", fontWeight: 600,
            }}>
              {hovBar.date?.slice(0, 4) || ''}
              {hovBar.isHistorical ? ' (actual)' : ' (projected)'}
            </span>
            <span style={{
              fontSize: "0.95rem", color: "var(--accent)",
              fontWeight: 800, fontFamily: "system-ui",
            }}>
              {formatValue(hovBar.value)}
            </span>
          </div>
        ) : (
          <span style={{
            fontSize: "0.5rem", color: "var(--text-label)", letterSpacing: "0.15em",
            textTransform: "uppercase", fontFamily: "system-ui",
          }}>
            {isMobile ? 'Tap for details' : 'Hover for details'}
          </span>
        )}
      </div>

      {/* SVG Chart */}
      <svg width={svgW} height={height} style={{ display: "block" }}>
        <defs>
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid lines */}
        {gridLines.map((val, gi) => {
          const y = yForVal(val);
          return (
            <g key={gi}>
              <line x1={padL} y1={y} x2={svgW - padR} y2={y}
                stroke="var(--border-row)" strokeWidth={0.5} />
              <text x={padL - 6} y={y + 3} textAnchor="end"
                fontSize="8" fill="var(--text-label)" fontFamily="system-ui">
                {formatValue(Math.round(val))}
              </text>
            </g>
          );
        })}

        {/* Zero line (if negatives exist) */}
        {rawMin < 0 && (
          <line x1={padL} y1={zeroY} x2={svgW - padR} y2={zeroY}
            stroke="var(--text-dim)" strokeWidth={0.8} strokeDasharray="2,2" />
        )}

        {/* Bars */}
        {allBars.map((bar, i) => {
          const x = padL + i * stepW + (stepW - barW) / 2;
          const isHov = hovered === i;
          const dimmed = hovered != null && !isHov;

          let fill;
          if (isHov) {
            fill = "#ffffff";
          } else if (bar.isHistorical) {
            fill = i === nowIndex ? "#e0f0e0" : "#2a8a3a";
          } else {
            fill = "#3a9aff";
          }

          let barH, barY;
          if (bar.value >= 0) {
            barH = Math.max(1, (bar.value / totalRange) * chartH);
            barY = zeroY - barH;
          } else {
            barH = Math.max(1, (Math.abs(bar.value) / totalRange) * chartH);
            barY = zeroY;
          }

          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setHovered(prev => prev === i ? null : i)}
              style={{ cursor: "pointer" }}
            >
              <rect x={x} y={barY} width={barW} height={barH}
                fill={fill}
                filter={isHov || i === nowIndex ? `url(#${filterId})` : undefined}
                opacity={dimmed ? 0.4 : (bar.isHistorical ? 0.85 : 0.6)}
              />
            </g>
          );
        })}

        {/* NOW divider */}
        {historicalData.length > 0 && projectedData.length > 0 && (
          <>
            <line x1={nowX + stepW * 0.4} y1={padTop - 4}
              x2={nowX + stepW * 0.4} y2={padTop + chartH + 4}
              stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4,3" opacity={0.5} />
            <text x={nowX + stepW * 0.4} y={padTop - 8}
              textAnchor="middle" fontSize="7" fontWeight="700"
              fill="var(--accent)" fontFamily="system-ui">
              NOW
            </text>
          </>
        )}

        {/* X-axis labels */}
        {axisLabels.map(({ i, label }) => {
          const x = padL + i * stepW + stepW / 2;
          const bar = allBars[i];
          return (
            <text key={i} x={x} y={height - 6}
              textAnchor="middle" fontSize={barCount > 15 ? 7 : 8.5}
              fill={hovered === i ? "var(--accent)" : "var(--text-label)"}
              fontWeight={hovered === i ? 700 : 400}
              fontFamily="system-ui">
              {label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
