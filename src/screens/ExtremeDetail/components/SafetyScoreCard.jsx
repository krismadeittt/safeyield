import React, { useState } from 'react';
import { getGradeColor } from '../../../utils/safety';

export default function SafetyScoreCard({ ticker, score, grade, factors }) {
  var [expanded, setExpanded] = useState(false);

  var gradeColor = getGradeColor(grade);
  var radius = 32;
  var circumference = 2 * Math.PI * radius;
  var fillPct = Math.min(score, 100) / 100;
  var dashLen = circumference * fillPct;
  var gapLen = circumference - dashLen;

  return (
    <div
      onClick={function() { setExpanded(function(v) { return !v; }); }}
      style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '1rem', cursor: 'pointer',
        minWidth: 160, transition: 'border-color 0.2s',
      }}
    >
      {/* Top: Ticker + Gauge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Circular gauge */}
        <svg width={76} height={76} viewBox="0 0 76 76">
          {/* Background circle */}
          <circle
            cx={38} cy={38} r={radius}
            fill="none" stroke="var(--border-row)" strokeWidth={5}
          />
          {/* Score arc */}
          <circle
            cx={38} cy={38} r={radius}
            fill="none" stroke={gradeColor} strokeWidth={5}
            strokeDasharray={dashLen + ' ' + gapLen}
            strokeDashoffset={circumference * 0.25}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.4s ease' }}
          />
          {/* Score text */}
          <text x={38} y={34} textAnchor="middle" fill="var(--text-primary)"
                fontSize={16} fontWeight={700} fontFamily="'JetBrains Mono', monospace">
            {Math.round(score)}
          </text>
          {/* Grade text */}
          <text x={38} y={50} textAnchor="middle" fill={gradeColor}
                fontSize={12} fontWeight={700} fontFamily="'JetBrains Mono', monospace">
            {grade}
          </text>
        </svg>

        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
            {ticker}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Safety Score
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: 4 }}>
            {expanded ? 'Click to collapse' : 'Click for details'}
          </div>
        </div>
      </div>

      {/* Expanded factor breakdown */}
      {expanded && factors && factors.length > 0 && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border-row)', paddingTop: 10 }}>
          {factors.map(function(f) {
            var barColor = f.score >= 70 ? '#22c55e' : f.score >= 40 ? '#eab308' : '#ef4444';
            return (
              <div key={f.name} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)' }}>{f.name}</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {Math.round(f.score)}
                  </span>
                </div>
                <div style={{ width: '100%', height: 4, borderRadius: 2, background: 'var(--bg-input)' }}>
                  <div style={{
                    width: Math.min(f.score, 100) + '%', height: '100%',
                    borderRadius: 2, background: barColor,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
