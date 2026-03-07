import React, { useState, useRef, useEffect } from 'react';

export default function ReconciliationChart({ records, isMobile }) {
  var containerRef = useRef(null);
  var [width, setWidth] = useState(600);
  var [hoverIdx, setHoverIdx] = useState(-1);

  useEffect(() => {
    if (!containerRef.current) return;
    var ro = new ResizeObserver(function(entries) {
      for (var e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Aggregate by ticker: sum expected and actual
  if (!records) return null;
  var byTicker = {};
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (!byTicker[r.ticker]) byTicker[r.ticker] = { ticker: r.ticker, expected: 0, actual: 0 };
    byTicker[r.ticker].expected += r.expected_total || 0;
    byTicker[r.ticker].actual += r.actual_total || 0;
  }
  var data = Object.values(byTicker).sort(function(a, b) { return b.expected - a.expected; }).slice(0, 15);

  if (data.length === 0) return null;

  var padL = 50, padR = 16, padTop = 16, padBot = 40;
  var chartH = 200;
  var chartW = width - padL - padR;
  var maxVal = Math.max.apply(null, data.map(function(d) { return Math.max(d.expected, d.actual); })) || 1;
  var barGroupW = chartW / data.length;
  var barW = Math.max(4, Math.min(20, barGroupW * 0.35));
  var gap = Math.max(2, barW * 0.2);

  function yFor(v) { return chartH - (v / maxVal) * chartH; }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={width} height={chartH + padTop + padBot} style={{ display: 'block' }}>
        {/* Y-axis labels */}
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

        {/* Bars */}
        {data.map(function(d, idx) {
          var x = padL + idx * barGroupW + barGroupW / 2;
          var expH = (d.expected / maxVal) * chartH;
          var actH = (d.actual / maxVal) * chartH;
          var isHover = hoverIdx === idx;

          return (
            <g key={d.ticker}
               onMouseEnter={() => setHoverIdx(idx)}
               onMouseLeave={() => setHoverIdx(-1)}
            >
              {/* Expected bar */}
              <rect
                x={x - barW - gap / 2}
                y={padTop + chartH - expH}
                width={barW}
                height={Math.max(0, expH)}
                fill={isHover ? 'var(--chart-proj-bright)' : 'var(--chart-proj)'}
                rx={2}
              />
              {/* Actual bar */}
              <rect
                x={x + gap / 2}
                y={padTop + chartH - actH}
                width={barW}
                height={Math.max(0, actH)}
                fill={isHover ? 'var(--chart-hist-bright)' : 'var(--chart-hist)'}
                rx={2}
              />
              {/* Ticker label */}
              <text
                x={x} y={padTop + chartH + 14}
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
                    x={x - 50} y={padTop - 2}
                    width={100} height={32}
                    fill="var(--bg-card)" stroke="var(--border)"
                    rx={4}
                  />
                  <text x={x} y={padTop + 10} textAnchor="middle" fill="var(--chart-proj-bright)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
                    Exp: ${d.expected.toFixed(2)}
                  </text>
                  <text x={x} y={padTop + 22} textAnchor="middle" fill="var(--chart-hist-bright)" fontSize={8} fontFamily="'JetBrains Mono', monospace">
                    Act: ${d.actual.toFixed(2)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 4 }}>
        <LegendItem color="var(--chart-proj)" label="Expected" />
        <LegendItem color="var(--chart-hist)" label="Actual" />
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
