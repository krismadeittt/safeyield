import React, { useState, useRef, useEffect } from 'react';

export default function AfterTaxChart({ perHolding, isMobile }) {
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

  if (!perHolding || perHolding.length === 0) return null;

  // Sort by gross descending, limit to 15
  var data = perHolding.slice().sort(function(a, b) { return b.grossAmount - a.grossAmount; }).slice(0, 15);

  var padL = 55, padR = 16, padTop = 16, padBot = 40;
  var chartH = 200;
  var chartW = width - padL - padR;
  var maxVal = Math.max.apply(null, data.map(function(d) { return d.grossAmount; })) || 1;
  var barGroupW = chartW / data.length;
  var barW = Math.max(8, Math.min(32, barGroupW * 0.6));

  function yFor(v) { return chartH - (v / maxVal) * chartH; }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={width} height={chartH + padTop + padBot} style={{ display: 'block' }}>
        {/* Y-axis grid lines and labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(function(pct) {
          var val = maxVal * pct;
          var y = padTop + yFor(val);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--border-row)" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fill="var(--text-dim)" fontSize={9} fontFamily="'JetBrains Mono', monospace">
                ${Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Stacked bars: net (bottom) + tax (top) */}
        {data.map(function(d, idx) {
          var x = padL + idx * barGroupW + (barGroupW - barW) / 2;
          var grossH = (d.grossAmount / maxVal) * chartH;
          var netH = (d.netAmount / maxVal) * chartH;
          var taxH = grossH - netH;
          var isHover = hoverIdx === idx;

          return (
            <g key={d.ticker}
               onMouseEnter={function() { setHoverIdx(idx); }}
               onMouseLeave={function() { setHoverIdx(-1); }}
            >
              {/* Net portion (bottom) */}
              <rect
                x={x}
                y={padTop + chartH - grossH}
                width={barW}
                height={Math.max(0, netH)}
                fill={isHover ? 'var(--chart-hist-bright)' : 'var(--chart-hist)'}
                rx={2}
                transform={'translate(0,' + Math.max(0, taxH) + ')'}
              />
              {/* Tax portion (top) */}
              <rect
                x={x}
                y={padTop + chartH - grossH}
                width={barW}
                height={Math.max(0, taxH)}
                fill="var(--red)"
                opacity={isHover ? 0.6 : 0.4}
                rx={2}
              />

              {/* Ticker label */}
              <text
                x={x + barW / 2} y={padTop + chartH + 14}
                textAnchor="middle" fill="var(--text-dim)"
                fontSize={isMobile ? 7 : 9}
                fontFamily="'JetBrains Mono', monospace"
              >
                {d.ticker}
              </text>

              {/* Hover tooltip */}
              {isHover && (
                <g>
                  <rect
                    x={x + barW / 2 - 55} y={padTop - 2}
                    width={110} height={44}
                    fill="var(--bg-card)" stroke="var(--border)"
                    rx={4}
                  />
                  <text x={x + barW / 2} y={padTop + 10} textAnchor="middle" fill="var(--text-primary)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
                    Gross: ${d.grossAmount.toFixed(2)}
                  </text>
                  <text x={x + barW / 2} y={padTop + 22} textAnchor="middle" fill="var(--red)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
                    Tax: ${d.taxAmount.toFixed(2)}
                  </text>
                  <text x={x + barW / 2} y={padTop + 34} textAnchor="middle" fill="var(--chart-hist-bright)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
                    Net: ${d.netAmount.toFixed(2)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 4 }}>
        <LegendItem color="var(--chart-hist)" label="Net Income" />
        <LegendItem color="var(--red)" opacity={0.4} label="Tax" />
      </div>
    </div>
  );
}

function LegendItem({ color, label, opacity }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 10, height: 10, borderRadius: 2, background: color, opacity: opacity || 1 }} />
      <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{label}</span>
    </div>
  );
}
