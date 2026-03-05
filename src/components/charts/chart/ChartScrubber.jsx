import React, { useRef, useCallback, useEffect, useMemo } from 'react';
import useIsMobile from '../../../hooks/useIsMobile';

/**
 * Zoom scrubber bar with mini bar preview, draggable range handles, and center-drag pan.
 * Placed below each chart for intuitive zoom control.
 */
export default function ChartScrubber({
  data, viewRange, totalPoints, onRangeChange, chartW, padL, mode = 'portfolio',
}) {
  const isMobile = useIsMobile();
  const svgRef = useRef(null);
  const dragRef = useRef({ type: null, startX: 0, startRange: null });
  const height = isMobile ? 38 : 32;
  const barAreaH = 16;
  const barAreaTop = (height - barAreaH) / 2;
  const minSpan = 7;

  // Bucket-sample bars for mini preview when data is large
  const miniBars = useMemo(() => {
    if (!data?.length) return [];
    const maxBuckets = Math.min(data.length, 200);
    if (data.length <= maxBuckets) {
      return data.map(b => ({
        value: mode === 'dividend' ? (b.value || 0) : (b.total || 0),
        isHistorical: b.isHistorical,
      }));
    }
    const bucketSize = data.length / maxBuckets;
    const result = [];
    for (let i = 0; i < maxBuckets; i++) {
      const from = Math.floor(i * bucketSize);
      const to = Math.min(Math.floor((i + 1) * bucketSize), data.length);
      let maxVal = 0;
      let isHist = true;
      for (let j = from; j < to; j++) {
        const v = mode === 'dividend' ? (data[j].value || 0) : (data[j].total || 0);
        if (v > maxVal) maxVal = v;
        if (!data[j].isHistorical) isHist = false;
      }
      result.push({ value: maxVal, isHistorical: isHist });
    }
    return result;
  }, [data, mode]);

  const maxVal = useMemo(() => {
    return Math.max(...miniBars.map(b => b.value), 1);
  }, [miniBars]);

  // Convert data index to pixel X position in SVG
  const idxToPx = useCallback((idx) => {
    if (totalPoints <= 1) return padL;
    return padL + (idx / (totalPoints - 1)) * chartW;
  }, [padL, chartW, totalPoints]);

  const leftHandleX = idxToPx(viewRange[0]);
  const rightHandleX = idxToPx(viewRange[1]);
  const handleW = 4;
  const touchPad = isMobile ? 12 : 8;

  // Pixel-delta drag: convert clientX delta to index delta using stable pxPerPoint
  const onPointerMove = useCallback((clientX) => {
    const { type, startX, startRange } = dragRef.current;
    if (!type || !startRange) return;

    const pxPerPoint = chartW / Math.max(1, totalPoints - 1);
    const deltaIdx = Math.round((clientX - startX) / pxPerPoint);
    const [origStart, origEnd] = startRange;
    const maxEnd = totalPoints - 1;

    if (type === 'left') {
      const newStart = Math.max(0, Math.min(origEnd - minSpan, origStart + deltaIdx));
      onRangeChange(newStart, origEnd);
    } else if (type === 'right') {
      const newEnd = Math.min(maxEnd, Math.max(origStart + minSpan, origEnd + deltaIdx));
      onRangeChange(origStart, newEnd);
    } else if (type === 'center') {
      let newStart = origStart + deltaIdx;
      let newEnd = origEnd + deltaIdx;
      if (newStart < 0) { newEnd -= newStart; newStart = 0; }
      if (newEnd > maxEnd) { newStart -= (newEnd - maxEnd); newEnd = maxEnd; }
      onRangeChange(Math.max(0, newStart), Math.min(maxEnd, newEnd));
    }
  }, [chartW, totalPoints, onRangeChange]);

  const onPointerUp = useCallback(() => {
    dragRef.current = { type: null, startX: 0, startRange: null };
  }, []);

  useEffect(() => {
    const moveHandler = (e) => {
      if (!dragRef.current.type) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      onPointerMove(clientX);
    };
    const upHandler = () => onPointerUp();

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
    window.addEventListener('touchmove', moveHandler, { passive: true });
    window.addEventListener('touchend', upHandler);

    return () => {
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
      window.removeEventListener('touchmove', moveHandler);
      window.removeEventListener('touchend', upHandler);
    };
  }, [onPointerMove, onPointerUp]);

  const startDrag = useCallback((type, clientX, e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    dragRef.current = { type, startX: clientX, startRange: [...viewRange] };
  }, [viewRange]);

  const svgW = padL + chartW + 10;

  return (
    <svg ref={svgRef} width={svgW} height={height} style={{ display: 'block', cursor: 'default' }}>
      {/* Mini bar preview */}
      {miniBars.map((bar, i) => {
        const barCount = miniBars.length;
        const stepW = chartW / barCount;
        const bW = Math.max(1, stepW * 0.7);
        const x = padL + i * stepW + (stepW - bW) / 2;
        const h = maxVal > 0 ? (bar.value / maxVal) * barAreaH : 0;
        const y = barAreaTop + barAreaH - h;
        return (
          <rect key={i} x={x} y={y} width={bW} height={h}
            fill={bar.isHistorical ? 'var(--chart-hist)' : 'var(--chart-proj)'}
            opacity={0.5} rx={0.5}
          />
        );
      })}

      {/* Dimmed overlay — left side */}
      <rect x={padL} y={0} width={Math.max(0, leftHandleX - padL)} height={height}
        fill="var(--bg-dark)" opacity={0.7} />

      {/* Dimmed overlay — right side */}
      <rect x={rightHandleX + handleW} y={0}
        width={Math.max(0, padL + chartW - rightHandleX - handleW)} height={height}
        fill="var(--bg-dark)" opacity={0.7} />

      {/* Visible region highlight */}
      <rect x={leftHandleX + handleW} y={1}
        width={Math.max(0, rightHandleX - leftHandleX - handleW)} height={height - 2}
        fill="var(--primary)" opacity={0.06} rx={2} />

      {/* Center drag area */}
      <rect x={leftHandleX + handleW} y={0}
        width={Math.max(0, rightHandleX - leftHandleX - handleW)} height={height}
        fill="transparent"
        style={{ cursor: 'grab' }}
        onMouseDown={(e) => startDrag('center', e.clientX, e)}
        onTouchStart={(e) => e.touches.length === 1 && startDrag('center', e.touches[0].clientX, e)}
      />

      {/* Left handle touch target (behind visible handle, larger hit area) */}
      <rect x={leftHandleX - touchPad} y={0} width={handleW + touchPad * 2} height={height}
        fill="transparent" style={{ cursor: 'ew-resize' }}
        onMouseDown={(e) => startDrag('left', e.clientX, e)}
        onTouchStart={(e) => e.touches.length === 1 && startDrag('left', e.touches[0].clientX, e)}
      />
      {/* Left handle (visible) */}
      <rect x={leftHandleX} y={2} width={handleW} height={height - 4}
        fill="var(--primary)" rx={2} style={{ cursor: 'ew-resize', pointerEvents: 'none' }}
      />

      {/* Right handle touch target (behind visible handle, larger hit area) */}
      <rect x={rightHandleX - touchPad} y={0} width={handleW + touchPad * 2} height={height}
        fill="transparent" style={{ cursor: 'ew-resize' }}
        onMouseDown={(e) => startDrag('right', e.clientX, e)}
        onTouchStart={(e) => e.touches.length === 1 && startDrag('right', e.touches[0].clientX, e)}
      />
      {/* Right handle (visible) */}
      <rect x={rightHandleX} y={2} width={handleW} height={height - 4}
        fill="var(--primary)" rx={2} style={{ cursor: 'ew-resize', pointerEvents: 'none' }}
      />

      {/* Subtle top border line */}
      <line x1={padL} y1={0.5} x2={padL + chartW} y2={0.5}
        stroke="var(--border)" strokeWidth={1} />
    </svg>
  );
}
