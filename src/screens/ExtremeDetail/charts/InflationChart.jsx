import React, { useState, useRef, useEffect } from 'react';

export default function InflationChart({ projections, isMobile }) {
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

  if (!projections || projections.length < 2) return null;

  var padL = 60, padR = 16, padTop = 20, padBot = 40;
  var chartH = 200;
  var chartW = width - padL - padR;

  // Compute y-axis bounds
  var allVals = [];
  for (var i = 0; i < projections.length; i++) {
    allVals.push(projections[i].nominal);
    allVals.push(projections[i].real);
  }
  var minVal = Math.min.apply(null, allVals) * 0.95;
  var maxVal = Math.max.apply(null, allVals) * 1.05;
  var range = maxVal - minVal || 1;

  function xFor(idx) {
    return padL + (idx / (projections.length - 1)) * chartW;
  }

  function yFor(v) {
    return padTop + chartH - ((v - minVal) / range) * chartH;
  }

  // Build line paths
  var nominalPath = '';
  var realPath = '';
  for (var p = 0; p < projections.length; p++) {
    var px = xFor(p);
    var ny = yFor(projections[p].nominal);
    var ry = yFor(projections[p].real);
    nominalPath += (p === 0 ? 'M' : 'L') + px + ',' + ny;
    realPath += (p === 0 ? 'M' : 'L') + px + ',' + ry;
  }

  // Build area fill between the two lines (gap area)
  var areaPath = '';
  for (var a = 0; a < projections.length; a++) {
    areaPath += (a === 0 ? 'M' : 'L') + xFor(a) + ',' + yFor(projections[a].nominal);
  }
  for (var b = projections.length - 1; b >= 0; b--) {
    areaPath += 'L' + xFor(b) + ',' + yFor(projections[b].real);
  }
  areaPath += 'Z';

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={width} height={chartH + padTop + padBot} style={{ display: 'block' }}
           onMouseLeave={function() { setHoverIdx(-1); }}
      >
        {/* Y-axis grid lines and labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(function(pct) {
          var val = minVal + range * pct;
          var y = yFor(val);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--border-row)" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fill="var(--text-dim)" fontSize={9} fontFamily="'JetBrains Mono', monospace">
                ${Math.round(val).toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Area fill between nominal and real (purchasing power gap) */}
        <path d={areaPath} fill="var(--red)" opacity={0.08} />

        {/* Nominal line (blue) */}
        <path d={nominalPath} fill="none" stroke="var(--chart-proj-bright)" strokeWidth={2} />

        {/* Real line (green) */}
        <path d={realPath} fill="none" stroke="var(--chart-hist-bright)" strokeWidth={2} />

        {/* Data points and hover zones */}
        {projections.map(function(d, idx) {
          var cx = xFor(idx);
          var ncy = yFor(d.nominal);
          var rcy = yFor(d.real);
          var isHover = hoverIdx === idx;

          return (
            <g key={idx}
               onMouseEnter={function() { setHoverIdx(idx); }}
            >
              {/* Invisible hover zone */}
              <rect
                x={cx - chartW / projections.length / 2}
                y={padTop}
                width={chartW / projections.length}
                height={chartH}
                fill="transparent"
              />

              {/* Nominal dot */}
              <circle cx={cx} cy={ncy} r={isHover ? 5 : 3} fill="var(--chart-proj-bright)" />

              {/* Real dot */}
              <circle cx={cx} cy={rcy} r={isHover ? 5 : 3} fill="var(--chart-hist-bright)" />

              {/* X-axis year label */}
              <text
                x={cx} y={padTop + chartH + 14}
                textAnchor="middle" fill="var(--text-dim)"
                fontSize={isMobile ? 7 : 9}
                fontFamily="'JetBrains Mono', monospace"
              >
                {d.year}
              </text>

              {/* Hover tooltip */}
              {isHover && (
                <g>
                  <rect
                    x={Math.min(cx - 55, width - padR - 110)} y={padTop - 4}
                    width={110} height={36}
                    fill="var(--bg-card)" stroke="var(--border)"
                    rx={4}
                  />
                  <text x={Math.min(cx, width - padR - 55)} y={padTop + 10} textAnchor="middle" fill="var(--chart-proj-bright)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
                    Nominal: ${d.nominal.toLocaleString()}
                  </text>
                  <text x={Math.min(cx, width - padR - 55)} y={padTop + 24} textAnchor="middle" fill="var(--chart-hist-bright)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
                    Real: ${d.real.toLocaleString()}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 4 }}>
        <LegendItem color="var(--chart-proj-bright)" label="Nominal Income" />
        <LegendItem color="var(--chart-hist-bright)" label="Real Income (Inflation-Adjusted)" />
      </div>
    </div>
  );
}

function LegendItem({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{label}</span>
    </div>
  );
}
