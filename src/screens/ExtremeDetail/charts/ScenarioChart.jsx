import React, { useState, useRef, useEffect } from 'react';

var SCENARIO_COLORS = ['var(--chart-proj)', '#e879f9', '#f59e0b'];
var SCENARIO_BRIGHT = ['var(--chart-proj-bright)', '#f0abfc', '#fbbf24'];

export default function ScenarioChart({ currentIncome, scenarioResults, isMobile }) {
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

  if (!scenarioResults || scenarioResults.length === 0) return null;

  var padL = 50, padR = 16, padTop = 16, padBot = 44;
  var chartH = isMobile ? 160 : 200;
  var chartW = width - padL - padR;

  // Build grouped data: Current + each scenario
  var groups = [{ name: 'Current', income: currentIncome || 0 }];
  for (var i = 0; i < scenarioResults.length; i++) {
    groups.push({ name: scenarioResults[i].name, income: scenarioResults[i].totalIncome });
  }

  var maxVal = 0;
  for (var m = 0; m < groups.length; m++) {
    if (groups[m].income > maxVal) maxVal = groups[m].income;
  }
  maxVal = maxVal || 1;
  maxVal = maxVal * 1.1;

  var barGroupW = chartW / groups.length;
  var barW = Math.max(10, Math.min(60, barGroupW * 0.6));

  function yFor(v) { return chartH - (v / maxVal) * chartH; }

  function formatDollar(v) {
    if (v >= 1000) return '$' + Math.round(v / 1000) + 'k';
    return '$' + Math.round(v);
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg width={width} height={chartH + padTop + padBot} style={{ display: 'block' }}>
        {/* Y-axis grid + labels */}
        {[0, 0.25, 0.5, 0.75, 1].map(function(pct) {
          var val = maxVal * pct;
          var y = padTop + yFor(val);
          return (
            <g key={pct}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="var(--border-row)" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fill="var(--text-dim)" fontSize={9} fontFamily="'JetBrains Mono', monospace">
                {formatDollar(val)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {groups.map(function(g, idx) {
          var x = padL + idx * barGroupW + barGroupW / 2;
          var h = (g.income / maxVal) * chartH;
          var isHover = hoverIdx === idx;
          var color = idx === 0 ? 'var(--chart-hist)' : SCENARIO_COLORS[(idx - 1) % SCENARIO_COLORS.length];
          var brightColor = idx === 0 ? 'var(--chart-hist-bright)' : SCENARIO_BRIGHT[(idx - 1) % SCENARIO_BRIGHT.length];

          return (
            <g key={idx}
              onMouseEnter={function() { setHoverIdx(idx); }}
              onMouseLeave={function() { setHoverIdx(-1); }}
            >
              <rect
                x={x - barW / 2}
                y={padTop + chartH - h}
                width={barW}
                height={Math.max(0, h)}
                fill={isHover ? brightColor : color}
                rx={3}
              />
              {/* Label below */}
              <text
                x={x} y={padTop + chartH + 14}
                textAnchor="middle" fill="var(--text-dim)"
                fontSize={isMobile ? 7 : 9}
                fontFamily="'DM Sans', system-ui, sans-serif"
              >
                {g.name.length > 12 ? g.name.slice(0, 11) + '...' : g.name}
              </text>

              {/* Value on top of bar */}
              {h > 15 && (
                <text
                  x={x} y={padTop + chartH - h - 4}
                  textAnchor="middle" fill={isHover ? brightColor : color}
                  fontSize={9} fontWeight={600}
                  fontFamily="'JetBrains Mono', monospace"
                >
                  {formatDollar(g.income)}
                </text>
              )}

              {/* Hover tooltip */}
              {isHover && (
                <g>
                  <rect
                    x={Math.min(x - 50, width - padR - 100)}
                    y={padTop - 2}
                    width={100} height={22}
                    fill="var(--bg-card)" stroke="var(--border)" rx={4}
                  />
                  <text
                    x={Math.min(x, width - padR - 50)}
                    y={padTop + 12}
                    textAnchor="middle" fill="var(--text-primary)"
                    fontSize={9} fontFamily="'JetBrains Mono', monospace"
                  >
                    {formatDollar(g.income)}/yr
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        <LegendItem color="var(--chart-hist)" label="Current" />
        {scenarioResults.map(function(s, idx) {
          return <LegendItem key={idx} color={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]} label={s.name} />;
        })}
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
