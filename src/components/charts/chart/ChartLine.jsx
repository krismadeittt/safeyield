import React, { useId } from 'react';

/**
 * SVG line/area chart renderer for daily/weekly granularity.
 *
 * Portfolio mode: Two lines — total (solid) and noDrip (dashed).
 *   Green gradient for historical, blue for projected. Hover dot + crosshair.
 *
 * Dividend mode: Spike markers at payment points (vertical lines from baseline).
 *   Dot at top of each spike. Flat $0 baseline between payments.
 *
 * @param {Object} props
 * @param {Array} props.data - Data points. Portfolio: [{total, noDrip, isHistorical, isCurrent}]
 *                              Dividend: [{value, isHistorical, isCurrent}]
 * @param {number} props.chartW - Available chart width
 * @param {number} props.chartH - Available chart height
 * @param {number} props.padL - Left padding
 * @param {number} props.padTop - Top padding
 * @param {number} props.maxVal - Max value for Y scaling
 * @param {number|null} props.hovered - Hovered index
 * @param {Function} props.onHover - (index) => void
 * @param {Function} props.onLeave - () => void
 * @param {string} props.mode - "portfolio" or "dividend"
 * @param {number} props.nowIndex - Index of "Now" bar (historical/projected divider)
 * @param {Object} [props.zoom] - Zoom state from useChartZoom
 */
export default function ChartLine({
  data, chartW, chartH, padL, padTop, maxVal,
  hovered, onHover, onLeave,
  mode = 'portfolio', nowIndex = 0, zoom,
}) {
  const uid = useId();
  if (!data?.length || !maxVal) return null;

  const visibleData = zoom?.isZoomed
    ? data.slice(zoom.viewRange[0], zoom.viewRange[1] + 1)
    : data;
  const startIdx = zoom?.isZoomed ? zoom.viewRange[0] : 0;
  const visibleNowIndex = nowIndex - startIdx;

  const count = visibleData.length;
  if (count < 2) return null;

  // X position for a visible index
  const xAt = (vi) => padL + (vi / (count - 1)) * chartW;
  // Y position for a value
  const yAt = (val) => padTop + chartH - (val / maxVal) * chartH;

  if (mode === 'dividend') {
    return <DividendLine
      data={visibleData} startIdx={startIdx}
      count={count} xAt={xAt} yAt={yAt}
      padL={padL} padTop={padTop} chartW={chartW} chartH={chartH}
      hovered={hovered} onHover={onHover} onLeave={onLeave}
      nowIndex={visibleNowIndex} uid={uid}
    />;
  }

  return <PortfolioLine
    data={visibleData} startIdx={startIdx}
    count={count} xAt={xAt} yAt={yAt}
    padL={padL} padTop={padTop} chartW={chartW} chartH={chartH}
    maxVal={maxVal}
    hovered={hovered} onHover={onHover} onLeave={onLeave}
    nowIndex={visibleNowIndex} uid={uid}
  />;
}

function PortfolioLine({
  data, startIdx, count, xAt, yAt,
  padL, padTop, chartW, chartH, maxVal,
  hovered, onHover, onLeave, nowIndex, uid,
}) {
  // Build path strings for total and noDrip lines
  // Split at nowIndex for color transition
  const histTotal = [];
  const projTotal = [];
  const histNoDrip = [];
  const projNoDrip = [];

  data.forEach((pt, vi) => {
    const x = xAt(vi);
    const yTotal = yAt(pt.total);
    const yNoDrip = yAt(pt.noDrip);

    if (vi <= nowIndex) {
      histTotal.push(`${x},${yTotal}`);
      histNoDrip.push(`${x},${yNoDrip}`);
    }
    if (vi >= nowIndex) {
      projTotal.push(`${x},${yTotal}`);
      projNoDrip.push(`${x},${yNoDrip}`);
    }
  });

  const baseline = padTop + chartH;

  // Area fill paths (closed polygons for gradient)
  const histAreaPath = histTotal.length > 1
    ? `M${histTotal[0]} L${histTotal.join(' L')} L${histTotal[histTotal.length - 1].split(',')[0]},${baseline} L${histTotal[0].split(',')[0]},${baseline} Z`
    : '';
  const projAreaPath = projTotal.length > 1
    ? `M${projTotal[0]} L${projTotal.join(' L')} L${projTotal[projTotal.length - 1].split(',')[0]},${baseline} L${projTotal[0].split(',')[0]},${baseline} Z`
    : '';

  // Hovered point
  const hovIdx = hovered != null ? hovered - startIdx : null;
  const hovVisible = hovIdx != null && hovIdx >= 0 && hovIdx < count;
  const hovPt = hovVisible ? data[hovIdx] : null;

  return (
    <g>
      {/* Gradient definitions */}
      <defs>
        <linearGradient id={`${uid}-hist-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-hist)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--chart-hist)" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id={`${uid}-proj-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--chart-proj)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--chart-proj)" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Historical area fill */}
      {histAreaPath && (
        <path d={histAreaPath} fill={`url(#${uid}-hist-grad)`} />
      )}
      {/* Projected area fill */}
      {projAreaPath && (
        <path d={projAreaPath} fill={`url(#${uid}-proj-grad)`} />
      )}

      {/* Historical total line (solid) */}
      {histTotal.length > 1 && (
        <polyline points={histTotal.join(' ')}
          fill="none" stroke="var(--chart-hist-bright)" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round"
        />
      )}
      {/* Historical noDrip line (dashed) */}
      {histNoDrip.length > 1 && (
        <polyline points={histNoDrip.join(' ')}
          fill="none" stroke="var(--chart-hist)" strokeWidth={1.2}
          strokeDasharray="4,3" strokeLinejoin="round" strokeLinecap="round"
          opacity={0.7}
        />
      )}

      {/* Projected total line (solid) */}
      {projTotal.length > 1 && (
        <polyline points={projTotal.join(' ')}
          fill="none" stroke="var(--chart-proj-bright)" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round"
        />
      )}
      {/* Projected noDrip line (dashed) */}
      {projNoDrip.length > 1 && (
        <polyline points={projNoDrip.join(' ')}
          fill="none" stroke="var(--chart-proj)" strokeWidth={1.2}
          strokeDasharray="4,3" strokeLinejoin="round" strokeLinecap="round"
          opacity={0.7}
        />
      )}

      {/* Hover crosshair + dot */}
      {hovPt && hovVisible && (() => {
        const hx = xAt(hovIdx);
        const hy = yAt(hovPt.total);
        return (
          <g>
            <line x1={hx} y1={padTop} x2={hx} y2={baseline}
              stroke="var(--primary)" strokeWidth={1} strokeDasharray="3,2" opacity={0.5} />
            <circle cx={hx} cy={hy} r={4}
              fill="var(--primary)" stroke="var(--bg-card)" strokeWidth={2} />
            {/* noDrip dot */}
            <circle cx={hx} cy={yAt(hovPt.noDrip)} r={3}
              fill="var(--chart-hist)" stroke="var(--bg-card)" strokeWidth={1.5} opacity={0.8} />
          </g>
        );
      })()}

      {/* Invisible hit rects for hover detection */}
      {data.map((_, vi) => {
        const stepW = chartW / (count - 1 || 1);
        const rx = padL + vi * stepW - stepW / 2;
        return (
          <rect key={vi}
            x={Math.max(padL, rx)} y={padTop}
            width={stepW} height={chartH}
            fill="transparent"
            onMouseEnter={() => onHover(startIdx + vi)}
            onMouseLeave={onLeave}
          />
        );
      })}
    </g>
  );
}

function DividendLine({
  data, startIdx, count, xAt, yAt,
  padL, padTop, chartW, chartH,
  hovered, onHover, onLeave, nowIndex, uid,
}) {
  const baseline = padTop + chartH;

  // For daily dividend view: show spikes at payment days, flat baseline otherwise
  // For weekly: continuous line of aggregated totals
  const hasSpikes = data.some(d => (d.value || 0) > 0);
  if (!hasSpikes) return null;

  // Build line path for weekly (continuous) or spike markers for daily
  const points = data.map((pt, vi) => ({
    x: xAt(vi),
    y: yAt(pt.value || 0),
    val: pt.value || 0,
    isHist: vi <= nowIndex,
  }));

  const hovIdx = hovered != null ? hovered - startIdx : null;
  const hovVisible = hovIdx != null && hovIdx >= 0 && hovIdx < count;
  const hovPt = hovVisible ? data[hovIdx] : null;

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-div-hist-grad`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--green)" stopOpacity="0.2" />
          <stop offset="100%" stopColor="var(--green)" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Spike markers — vertical lines from baseline to value */}
      {points.map((pt, vi) => {
        if (pt.val <= 0) return null;
        const i = startIdx + vi;
        const isHov = hovered === i;
        const spikeColor = vi <= nowIndex ? 'var(--chart-hist-bright)' : 'var(--chart-proj-bright)';

        return (
          <g key={vi}>
            <line x1={pt.x} y1={baseline} x2={pt.x} y2={pt.y}
              stroke={isHov ? 'var(--green)' : spikeColor}
              strokeWidth={isHov ? 2.5 : 1.5}
              opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.3 : 0.75}
            />
            <circle cx={pt.x} cy={pt.y} r={isHov ? 3.5 : 2}
              fill={isHov ? 'var(--green)' : spikeColor}
              opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.3 : 0.85}
            />
          </g>
        );
      })}

      {/* Hover crosshair */}
      {hovPt && hovVisible && (() => {
        const hx = xAt(hovIdx);
        return (
          <line x1={hx} y1={padTop} x2={hx} y2={baseline}
            stroke="var(--green)" strokeWidth={1} strokeDasharray="3,2" opacity={0.4} />
        );
      })()}

      {/* Invisible hit rects for hover detection */}
      {data.map((_, vi) => {
        const stepW = chartW / (count - 1 || 1);
        const rx = xAt(vi) - stepW / 2;
        return (
          <rect key={vi}
            x={Math.max(padL, rx)} y={padTop}
            width={stepW} height={chartH}
            fill="transparent"
            onMouseEnter={() => onHover(startIdx + vi)}
            onMouseLeave={onLeave}
          />
        );
      })}
    </g>
  );
}
