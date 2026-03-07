import React, { useState, useRef, useEffect } from 'react';
import { shortMoney, formatCurrency } from '../../utils/format';

/**
 * Two-phase retirement Monte Carlo fan chart.
 * Phase 1 (growth) → Phase 2 (withdrawal) on a single timeline.
 *
 * Props:
 *   mcResult: { months, bands: { p10, p25, p50, p75, p90 }[], successRate, retirementMonthIdx }
 *   startYear: calendar year of simulation start
 */
export default function RetirementFanChart({ mcResult, startYear }) {
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

  const { months, bands, retirementMonthIdx } = mcResult;
  const n = months.length;

  // Layout
  const padL = 65;
  const padR = 15;
  const padTop = 20;
  const padBot = 34;
  const chartH = 300;
  const svgH = chartH + padTop + padBot;
  const svgW = Math.max(200, width - 32);
  const chartW = svgW - padL - padR;

  // Value range
  const allVals = bands.flatMap(b => [b.p10, b.p90]);
  const maxVal = Math.max(...allVals) * 1.08;
  const minVal = Math.min(0, Math.min(...allVals) * 0.95);
  const range = maxVal - minVal || 1;

  const xForMonth = i => padL + (i / (n - 1)) * chartW;
  const yForVal = v => padTop + ((maxVal - v) / range) * chartH;

  const pathPoints = (key) => bands.map((b, i) => `${xForMonth(i)},${yForVal(b[key])}`);

  const bandPath = (upperKey, lowerKey) => {
    const upper = bands.map((b, i) => `${xForMonth(i)},${yForVal(b[upperKey])}`);
    const lower = bands.map((b, i) => `${xForMonth(i)},${yForVal(b[lowerKey])}`).reverse();
    return `M${upper.join(' L')} L${lower.join(' L')} Z`;
  };

  const medianPath = `M${pathPoints('p50').join(' L')}`;

  // Grid lines
  const gridLines = [];
  const step = range / 5;
  for (let i = 0; i <= 5; i++) gridLines.push(minVal + step * i);

  // X-axis labels at year boundaries
  const yearLabels = [];
  for (let i = 0; i < n; i += 12) {
    const year = startYear + Math.floor(i / 12);
    yearLabels.push({ i, year });
  }
  // Always include the last point
  if (yearLabels.length === 0 || yearLabels[yearLabels.length - 1].i !== n - 1) {
    yearLabels.push({ i: n - 1, year: startYear + Math.floor((n - 1) / 12) });
  }

  // Retirement line x
  const retX = xForMonth(retirementMonthIdx);

  // Tooltip data
  const hovData = hovered != null ? bands[hovered] : null;
  const hovMonth = hovered != null ? months[hovered] : null;
  const hovYear = hovered != null ? startYear + Math.floor(hovMonth / 12) : null;
  const hovPhase = hovered != null ? (hovered < retirementMonthIdx ? 'Growth' : 'Withdrawal') : null;

  // Stat cards
  const retBand = bands[retirementMonthIdx] || bands[0];
  const finalBand = bands[n - 1];

  return (
    <div ref={containerRef} style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
    }}>
      {/* Header */}
      <div style={{ padding: '1.2rem 1.2rem 0' }}>
        <div style={{
          fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          Projected Portfolio Value & Monte Carlo Simulation
        </div>
        <div style={{
          fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: 2,
          fontFamily: "'DM Sans', system-ui, sans-serif", fontStyle: 'italic',
        }}>
          10,000 simulations · Growth phase → Withdrawal phase
        </div>

        {/* Stat cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0, marginTop: '0.8rem',
        }}>
          {[
            { label: 'Bearish at Retirement (P10)', value: shortMoney(retBand.p10), color: 'var(--red)' },
            { label: 'Median at Retirement (P50)', value: shortMoney(retBand.p50), color: 'var(--green)' },
            { label: 'Median at End (P50)', value: shortMoney(finalBand.p50), color: 'var(--primary)' },
            { label: 'Bullish at End (P90)', value: shortMoney(finalBand.p90), color: 'var(--primary)' },
          ].map((card, i) => (
            <div key={i} style={{
              padding: '0.7rem 0.6rem', border: '1px solid var(--border)',
              marginRight: i < 3 ? -1 : 0, marginBottom: -1,
            }}>
              <div style={{
                fontSize: '0.42rem', color: 'var(--text-dim)', textTransform: 'uppercase',
                letterSpacing: '0.12em', marginBottom: '0.3rem', fontFamily: 'system-ui',
              }}>
                {card.label}
              </div>
              <div style={{
                fontSize: '1rem', fontWeight: 700, color: card.color, lineHeight: 1,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: '0.8rem', flexWrap: 'wrap' }}>
          <LegendItem color="rgba(60,191,163,0.12)" label="P10–P90 range" />
          <LegendItem color="rgba(60,191,163,0.25)" label="P25–P75 range" />
          <LegendItem color="var(--primary)" label="Median (P50)" />
          <LegendItem color="var(--red)" dashed label="Retirement date" />
        </div>
      </div>

      {/* Tooltip */}
      <div style={{
        height: 36, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '0 1rem',
      }}>
        {hovData ? (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            padding: '4px 14px', display: 'inline-flex', gap: 10, alignItems: 'center',
            borderRadius: 6,
          }}>
            <span style={{
              fontSize: '0.72rem', color: 'var(--primary)',
              fontFamily: 'system-ui', fontWeight: 600,
            }}>
              {hovYear} · {hovPhase}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--red)', fontFamily: "'JetBrains Mono', monospace" }}>
              P10: {shortMoney(hovData.p10)}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--green)', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              P50: {shortMoney(hovData.p50)}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--primary)', fontFamily: "'JetBrains Mono', monospace" }}>
              P90: {shortMoney(hovData.p90)}
            </span>
          </div>
        ) : (
          <span style={{
            fontSize: '0.5rem', color: 'var(--text-dim)', letterSpacing: '0.12em',
            textTransform: 'uppercase', fontFamily: 'system-ui',
          }}>
            Hover to inspect · GBM + DRIP · monthly resolution
          </span>
        )}
      </div>

      {/* SVG chart */}
      <svg width={svgW} height={svgH} style={{ display: 'block', overflow: 'hidden' }}>
        {/* Grid lines */}
        {gridLines.map((val, i) => {
          const y = yForVal(val);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={svgW - padR} y2={y}
                stroke="var(--border)" strokeWidth={0.5} />
              <text x={padL - 8} y={y + 3} textAnchor="end"
                fontSize="8" fill="var(--text-dim)" fontFamily="'JetBrains Mono', monospace">
                {shortMoney(val)}
              </text>
            </g>
          );
        })}

        {/* Zero line */}
        {minVal < 0 && (
          <line x1={padL} y1={yForVal(0)} x2={svgW - padR} y2={yForVal(0)}
            stroke="var(--red)" strokeWidth={0.8} opacity={0.3} />
        )}

        {/* P10–P90 band */}
        <path d={bandPath('p90', 'p10')}
          fill="rgba(60,191,163,0.08)" stroke="none" />

        {/* P25–P75 band */}
        <path d={bandPath('p75', 'p25')}
          fill="rgba(60,191,163,0.18)" stroke="none" />

        {/* Percentile lines */}
        <path d={`M${pathPoints('p90').join(' L')}`}
          fill="none" stroke="var(--green)" strokeWidth={0.7} opacity={0.25}
          strokeDasharray="3,3" />
        <path d={`M${pathPoints('p10').join(' L')}`}
          fill="none" stroke="var(--red)" strokeWidth={0.7} opacity={0.3}
          strokeDasharray="3,3" />
        <path d={`M${pathPoints('p75').join(' L')}`}
          fill="none" stroke="var(--green)" strokeWidth={0.7} opacity={0.35} />
        <path d={`M${pathPoints('p25').join(' L')}`}
          fill="none" stroke="var(--warning)" strokeWidth={0.7} opacity={0.35} />

        {/* Median line */}
        <path d={medianPath}
          fill="none" stroke="var(--primary)" strokeWidth={2.5} opacity={0.9} />

        {/* Retirement vertical line */}
        <line x1={retX} y1={padTop} x2={retX} y2={padTop + chartH}
          stroke="var(--red)" strokeWidth={1.5} strokeDasharray="6,4" opacity={0.7} />
        <text x={retX} y={padTop - 6} textAnchor="middle"
          fontSize="9" fill="var(--red)" fontWeight={600} fontFamily="'DM Sans', system-ui, sans-serif">
          Retirement
        </text>

        {/* Hover zones */}
        {months.map((mo, i) => {
          const x = xForMonth(i);
          const halfStep = i < n - 1 ? (xForMonth(i + 1) - x) / 2 : chartW / (n - 1) / 2;
          return (
            <g key={i}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'crosshair' }}
            >
              <rect x={x - halfStep} y={padTop} width={halfStep * 2} height={chartH}
                fill="transparent" />
              {hovered === i && (
                <>
                  <line x1={x} y1={padTop} x2={x} y2={padTop + chartH}
                    stroke="var(--primary)" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
                  {['p10', 'p25', 'p50', 'p75', 'p90'].map(key => (
                    <circle key={key} cx={x} cy={yForVal(bands[i][key])} r={2.5}
                      fill={key === 'p50' ? 'var(--primary)' : key === 'p10' ? 'var(--red)' : 'var(--green)'}
                      opacity={0.9} />
                  ))}
                </>
              )}
            </g>
          );
        })}

        {/* Starting dot */}
        <circle cx={xForMonth(0)} cy={yForVal(bands[0].p50)} r={3.5}
          fill="var(--text-primary)" />

        {/* X-axis labels */}
        {yearLabels.map(({ i, year }) => (
          <text key={i} x={xForMonth(i)} y={svgH - 8}
            textAnchor="middle" fontSize={yearLabels.length > 20 ? 7 : 9}
            fill={hovered != null && Math.abs(hovered - i) < 6 ? 'var(--primary)' : 'var(--text-dim)'}
            fontFamily="'JetBrains Mono', monospace">
            {year}
          </text>
        ))}
      </svg>
    </div>
  );
}

function LegendItem({ color, label, dashed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 14, height: dashed ? 2 : 8,
        background: dashed ? 'none' : color,
        borderTop: dashed ? `2px dashed ${color}` : 'none',
        border: dashed ? 'none' : '1px solid var(--border)',
      }} />
      <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        {label}
      </span>
    </div>
  );
}
