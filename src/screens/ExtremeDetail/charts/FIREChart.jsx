import React, { useState, useRef, useEffect } from 'react';

export default function FIREChart({ projections, crossoverYear, isMobile }) {
  var containerRef = useRef(null);
  var [width, setWidth] = useState(600);
  var [hoverIdx, setHoverIdx] = useState(-1);

  useEffect(function() {
    if (!containerRef.current) return;
    var ro = new ResizeObserver(function(entries) {
      for (var e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    return function() { ro.disconnect(); };
  }, []);

  if (!projections || projections.length === 0) return null;

  var padL = 60, padR = 16, padTop = 24, padBot = 44;
  var chartH = isMobile ? 180 : 240;
  var chartW = width - padL - padR;

  // Find max Y value across income and expenses
  var maxVal = 0;
  for (var i = 0; i < projections.length; i++) {
    var p = projections[i];
    if (p.dividendIncome > maxVal) maxVal = p.dividendIncome;
    if (p.expenses > maxVal) maxVal = p.expenses;
  }
  maxVal = maxVal || 1;
  // Add 10% headroom
  maxVal = maxVal * 1.1;

  function xFor(idx) {
    return padL + (idx / (projections.length - 1)) * chartW;
  }

  function yFor(v) {
    return padTop + chartH - (v / maxVal) * chartH;
  }

  // Build area path for dividend income
  var areaPath = 'M ' + xFor(0) + ' ' + yFor(0);
  for (var a = 0; a < projections.length; a++) {
    areaPath += ' L ' + xFor(a) + ' ' + yFor(projections[a].dividendIncome);
  }
  // Close area back to baseline
  areaPath += ' L ' + xFor(projections.length - 1) + ' ' + yFor(0);
  areaPath += ' Z';

  // Build line path for dividend income
  var linePath = 'M ' + xFor(0) + ' ' + yFor(projections[0].dividendIncome);
  for (var b = 1; b < projections.length; b++) {
    linePath += ' L ' + xFor(b) + ' ' + yFor(projections[b].dividendIncome);
  }

  // Expenses line Y
  var expensesY = yFor(projections[0].expenses);

  // Crossover X
  var crossoverX = crossoverYear !== null ? xFor(crossoverYear) : null;

  // Y-axis labels
  var yTicks = [0, 0.25, 0.5, 0.75, 1];

  function formatDollar(v) {
    if (v >= 1000) return '$' + Math.round(v / 1000) + 'k';
    return '$' + Math.round(v);
  }

  // Hover tooltip
  var hoverData = hoverIdx >= 0 && hoverIdx < projections.length ? projections[hoverIdx] : null;
  var hoverX = hoverIdx >= 0 ? xFor(hoverIdx) : 0;

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={width} height={chartH + padTop + padBot} style={{ display: 'block' }}>
        {/* Y-axis grid + labels */}
        {yTicks.map(function(pct) {
          var val = maxVal * pct;
          var y = yFor(val);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--border-row)" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fill="var(--text-dim)" fontSize={9} fontFamily="'JetBrains Mono', monospace">
                {formatDollar(val)}
              </text>
            </g>
          );
        })}

        {/* Filled area for dividend income */}
        <path d={areaPath} fill="rgba(60,191,163,0.15)" />

        {/* Dividend income line */}
        <path d={linePath} fill="none" stroke="var(--green)" strokeWidth={2} />

        {/* Expenses dashed line */}
        <line
          x1={padL} y1={expensesY}
          x2={width - padR} y2={expensesY}
          stroke="var(--red)" strokeWidth={1.5} strokeDasharray="6,4"
        />
        <text x={width - padR - 2} y={expensesY - 6} textAnchor="end" fill="var(--red)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
          Expenses
        </text>

        {/* Crossover vertical line */}
        {crossoverX !== null && (
          <g>
            <line
              x1={crossoverX} y1={padTop}
              x2={crossoverX} y2={padTop + chartH}
              stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="4,3"
            />
            <text x={crossoverX} y={padTop - 6} textAnchor="middle" fill="var(--primary)" fontSize={10} fontWeight={700} fontFamily="'DM Sans', system-ui, sans-serif">
              FIRE!
            </text>
          </g>
        )}

        {/* X-axis labels */}
        {projections.map(function(p, idx) {
          // Show every 5 years or first/last
          if (idx > 0 && idx < projections.length - 1 && idx % 5 !== 0) return null;
          return (
            <text key={idx} x={xFor(idx)} y={padTop + chartH + 16} textAnchor="middle" fill="var(--text-dim)" fontSize={isMobile ? 7 : 9} fontFamily="'JetBrains Mono', monospace">
              Y{p.year}
            </text>
          );
        })}

        {/* Invisible hit areas for hover */}
        {projections.map(function(p, idx) {
          var stepW = chartW / Math.max(1, projections.length - 1);
          return (
            <rect
              key={idx}
              x={xFor(idx) - stepW / 2}
              y={padTop}
              width={stepW}
              height={chartH}
              fill="transparent"
              onMouseEnter={function() { setHoverIdx(idx); }}
              onMouseLeave={function() { setHoverIdx(-1); }}
            />
          );
        })}

        {/* Hover tooltip */}
        {hoverData && (
          <g>
            <line x1={hoverX} y1={padTop} x2={hoverX} y2={padTop + chartH} stroke="var(--border-accent)" strokeWidth={1} />
            <circle cx={hoverX} cy={yFor(hoverData.dividendIncome)} r={4} fill="var(--green)" />
            <rect
              x={Math.min(hoverX + 8, width - padR - 130)}
              y={padTop + 4}
              width={120} height={52}
              fill="var(--bg-card)" stroke="var(--border)" rx={4}
            />
            <text x={Math.min(hoverX + 14, width - padR - 124)} y={padTop + 17} fill="var(--text-primary)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
              Year {hoverData.year}
            </text>
            <text x={Math.min(hoverX + 14, width - padR - 124)} y={padTop + 29} fill="var(--green)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
              Income: {formatDollar(hoverData.dividendIncome)}
            </text>
            <text x={Math.min(hoverX + 14, width - padR - 124)} y={padTop + 41} fill="var(--red)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
              Expenses: {formatDollar(hoverData.expenses)}
            </text>
            <text x={Math.min(hoverX + 14, width - padR - 124)} y={padTop + 53} fill="var(--text-dim)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
              Gap: {formatDollar(hoverData.dividendIncome - hoverData.expenses)}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 4 }}>
        <LegendItem color="var(--green)" label="Dividend Income" />
        <LegendItem color="var(--red)" label="Annual Expenses" dashed />
        {crossoverYear !== null && <LegendItem color="var(--primary)" label="FIRE Crossover" dashed />}
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{
        width: 14, height: 2, background: color,
        borderTop: dashed ? '2px dashed ' + color : 'none',
        background: dashed ? 'transparent' : color,
        height: dashed ? 0 : 2,
      }} />
      {!dashed && <div style={{ width: 14, height: 2, background: color, borderRadius: 1 }} />}
      <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{label}</span>
    </div>
  );
}
