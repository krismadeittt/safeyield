import React, { useRef, useState } from 'react';
import { MONTHS, formatCurrency } from '../../utils/format';

/**
 * Portfolio balance monthly view — SVG tooltip (no layout shift).
 */
export default function PortfolioBalanceMonthly({
  dripVals, contribVals, monthlyData, totalIncome, avgYield, horizon, extraContrib,
}) {
  const containerRef = useRef(null);
  const [hovered, setHovered] = useState(null);

  const vals = extraContrib > 0 && contribVals ? contribVals : dripVals;
  const bars = [];
  for (let yr = 0; yr <= horizon; yr++) {
    const start = vals?.[yr] || 0;
    const end = vals?.[yr + 1] || start;
    for (let mo = 0; mo < 12; mo++) {
      const t = mo / 12;
      const value = Math.round(start + (end - start) * t);
      bars.push({ yr, mo, label: `Y${yr} ${MONTHS[mo]}`, value });
    }
  }

  const maxVal = Math.max(...bars.map(b => b.value), 1);

  const getColor = (yr) => {
    const t = yr / Math.max(horizon, 1);
    if (t < 0.5) {
      const p = t * 2;
      return `rgb(${Math.round(26 + p * -26)},${Math.round(58 + p * 36)},${Math.round(92 + p * 92)})`;
    } else {
      const p = (t - 0.5) * 2;
      return `rgb(${Math.round(0 + p * 58)},${Math.round(94 + p * 65)},${Math.round(184 + p * 48)})`;
    }
  };

  const H = 220;
  const barW = Math.max(5, Math.min(12, Math.floor(900 / (horizon * 12 + 12))));
  const gapW = Math.max(1, Math.floor(barW * 0.2));
  const stepW = barW + gapW;
  const totalW = bars.length * stepW + 4;
  const padTop = 46;
  const padBot = 22;
  const padLeft = 8;
  const chartH = H - padLeft - padBot;

  const hovBar = hovered ? bars.find(b => b.yr === hovered.yr && b.mo === hovered.mo) : null;
  const hovIdx = hovBar ? bars.indexOf(hovBar) : -1;

  return (
    <div style={{
      background: "#071525", border: "1px solid #0a1e30", padding: "1.2rem",
      overflowX: "auto",
    }}>
      <div style={{
        fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
        textTransform: "uppercase", marginBottom: "0.8rem",
      }}>
        Portfolio Balance — Monthly View
      </div>
      <svg width={totalW} height={H} style={{ display: "block" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(pct => {
          const y = padTop + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line x1={0} y1={y} x2={totalW} y2={y} stroke="#0a1e30" strokeWidth={0.5} />
              <text x={2} y={y - 3} fontSize="8" fill="#1a4060">
                {formatCurrency(maxVal * pct)}
              </text>
            </g>
          );
        })}

        {bars.map((bar, i) => {
          const barH = maxVal > 0 ? (bar.value / maxVal) * chartH : 0;
          const x = i * stepW;
          const y = padTop + chartH - barH;
          const isHov = hovered?.yr === bar.yr && hovered?.mo === bar.mo;

          return (
            <rect
              key={i}
              x={x} y={y} width={barW} height={barH}
              fill={isHov ? "#5aaff8" : getColor(bar.yr)}
              opacity={isHov ? 1 : 0.8}
              onMouseEnter={() => setHovered({ yr: bar.yr, mo: bar.mo })}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: "pointer" }}
            />
          );
        })}

        {/* SVG tooltip */}
        {hovBar && hovIdx >= 0 && (
          <g>
            <rect
              x={Math.min(hovIdx * stepW + barW + 6, totalW - 140)}
              y={padTop}
              width={130} height={24}
              fill="#071020" stroke="#1a3a5c" strokeWidth={1}
            />
            <text
              x={Math.min(hovIdx * stepW + barW + 12, totalW - 134)}
              y={padTop + 16}
              fontSize={10} fill="#c8dff0" fontFamily="system-ui"
            >
              {hovBar.label}: {formatCurrency(hovBar.value)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
