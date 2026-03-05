import React from 'react';

/**
 * SVG bar chart renderer for all granularities (daily, weekly, monthly, yearly).
 * Renders stacked bars: bottom = noDrip/price, top = DRIP bonus/div return.
 *
 * Supports drag-to-pan when zoomed via zoom.handleMouseDown/Move/Up.
 */
export default function ChartBars({
  data, chartW, chartH, padL, padTop, maxVal,
  hovered, onHover, onLeave, showDivReturn = true,
  mode = 'portfolio', zoom,
}) {
  if (!data?.length || !maxVal) return null;

  const visibleData = zoom?.isZoomed
    ? data.slice(zoom.viewRange[0], zoom.viewRange[1] + 1)
    : data;
  const startIdx = zoom?.isZoomed ? zoom.viewRange[0] : 0;

  const barCount = visibleData.length || 1;
  const stepW = chartW / barCount;
  const barW = Math.max(2, Math.min(stepW * 0.65, 18));

  if (mode === 'dividend') {
    return visibleData.map((bar, vi) => {
      const i = startIdx + vi;
      const x = padL + vi * stepW + (stepW - barW) / 2;
      const barH = maxVal > 0 ? (bar.value / maxVal) * chartH : 0;
      const y = padTop + chartH - barH;
      const isHov = hovered === i;

      let fill;
      if (isHov) fill = 'var(--green)';
      else if (hovered != null && i > hovered) fill = 'var(--border)';
      else if (hovered != null) fill = 'var(--chart-hist-bright)';
      else fill = 'var(--chart-hist)';

      return (
        <g key={i}
          onMouseEnter={() => onHover(i)}
          onMouseLeave={onLeave}
          style={{ cursor: zoom?.isZoomed ? 'grab' : 'pointer' }}
        >
          <rect x={x} y={y} width={barW} height={barH}
            fill={fill}
            filter={isHov ? 'url(#neonGlow)' : undefined}
            opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.4 : 0.85}
            rx={1}
          />
          {/* Invisible hit area */}
          <rect x={padL + vi * stepW} y={padTop} width={stepW} height={chartH}
            fill="transparent" />
        </g>
      );
    });
  }

  // Portfolio mode — stacked bars
  return visibleData.map((bar, vi) => {
    const i = startIdx + vi;
    const x = padL + vi * stepW + (stepW - barW) / 2;
    const isHov = hovered === i;
    const totalH = maxVal > 0 ? (bar.total / maxVal) * chartH : 0;
    const noDripH = maxVal > 0 ? (bar.noDrip / maxVal) * chartH : 0;
    const bonusH = Math.max(0, totalH - noDripH);
    const showStack = bar.isHistorical ? (showDivReturn && bar.dripBonus > 0) : true;

    let bottomFill, topFill;
    if (bar.isHistorical) {
      if (isHov) { bottomFill = 'var(--chart-hist-bright)'; topFill = 'var(--text-primary)'; }
      else if (hovered != null && i > hovered) { bottomFill = 'var(--border)'; topFill = 'var(--border-dim)'; }
      else { bottomFill = 'var(--chart-hist)'; topFill = 'var(--chart-hist-bright)'; }
    } else {
      if (isHov) { bottomFill = 'var(--chart-proj-bright)'; topFill = 'var(--text-primary)'; }
      else if (hovered != null && i > hovered) { bottomFill = 'var(--border)'; topFill = 'var(--border-dim)'; }
      else { bottomFill = 'var(--chart-proj)'; topFill = 'var(--chart-proj-bright)'; }
    }

    const bottomBarH = showStack ? noDripH : totalH;
    const topBarH = showStack ? bonusH : 0;

    return (
      <g key={i}
        onMouseEnter={() => onHover(i)}
        onMouseLeave={onLeave}
        style={{ cursor: zoom?.isZoomed ? 'grab' : 'pointer' }}
      >
        {/* Bottom (noDrip / price) */}
        <rect x={x} y={padTop + chartH - bottomBarH} width={barW} height={bottomBarH}
          fill={bottomFill}
          opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.4 : 0.85}
          rx={1}
        />
        {/* Top (DRIP bonus / div return) */}
        {topBarH > 0 && (
          <rect x={x} y={padTop + chartH - bottomBarH - topBarH} width={barW} height={topBarH}
            fill={topFill}
            filter={isHov ? 'url(#neonGlow)' : undefined}
            opacity={isHov ? 1 : (hovered != null && i > hovered) ? 0.4 : 0.9}
            rx={1}
          />
        )}
        {/* Invisible hit area */}
        <rect x={padL + vi * stepW} y={padTop} width={stepW} height={chartH}
          fill="transparent" />
      </g>
    );
  });
}
