import React, { useState, useEffect } from 'react';
import { MONTHS } from '../../utils/format';

/**
 * Monthly dividend heatmap / bar chart (SVG).
 * Shows grouped bars by year with monthly breakdown.
 */
export default function MonthlyHeatmap({ fullYearData, avgYield, monthlyData }) {
  const [visible, setVisible] = useState([]);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (!fullYearData?.length) return;
    setVisible([]);
    fullYearData.forEach((_, i) => {
      setTimeout(() => setVisible(prev => [...prev, i]), i * 120);
    });
  }, [fullYearData?.length]);

  if (!fullYearData?.length) return null;

  const barW = 14;
  const gap = 2;
  const groupGap = 16;
  const groupW = 12 * (barW + gap) - gap;
  const totalW = fullYearData.length * (groupW + groupGap) - groupGap + 60;
  const H = 180;
  const padTop = 24;
  const padBot = 36;
  const chartH = H - padTop - padBot;
  const maxVal = Math.max(...fullYearData.flatMap(y => y.months || []), 1);

  return (
    <div style={{
      background: "var(--bg-dark)", border: "1px solid var(--border-dim)", padding: "1.2rem",
      overflowX: "auto",
    }}>
      <div style={{
        fontSize: "0.6rem", color: "var(--text-label)", letterSpacing: "0.2em",
        textTransform: "uppercase", marginBottom: "0.8rem",
      }}>
        Monthly Dividend Payments
      </div>
      <svg width={totalW} height={H} style={{ display: "block" }}>
        {fullYearData.map((yearData, yi) => {
          if (!visible.includes(yi)) return null;
          const groupX = yi * (groupW + groupGap) + 30;
          const yearProgress = yi / Math.max(fullYearData.length - 1, 1);

          return (
            <g key={yi}>
              <text
                x={groupX + groupW / 2} y={H - 8}
                textAnchor="middle" fontSize="10" fill="var(--text-label)"
              >
                Y{yi}
              </text>
              {(yearData.months || []).map((val, mi) => {
                const barH = maxVal > 0 ? (val / maxVal) * chartH : 0;
                const x = groupX + mi * (barW + gap);
                const y = padTop + chartH - barH;
                const t = yearProgress;
                const r = Math.round(26 + t * (-26 + 58));
                const g = Math.round(58 + t * (36 + 65));
                const b = Math.round(92 + t * (92 + 48));
                const isHov = hovered?.yr === yi && hovered?.mo === mi;

                return (
                  <g key={mi}
                    onMouseEnter={() => setHovered({ yr: yi, mo: mi, val })}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <rect
                      x={x} y={y} width={barW} height={barH}
                      fill={isHov ? "var(--primary)" : `rgb(${r},${g},${b})`}
                      opacity={isHov ? 1 : 0.85}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}

        {hovered && (
          <text
            x={totalW / 2} y={14}
            textAnchor="middle" fontSize="11" fill="var(--text-primary)"
          >
            Y{hovered.yr} {MONTHS[hovered.mo]}: ${hovered.val?.toLocaleString()}
          </text>
        )}
      </svg>
    </div>
  );
}
