import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Zoom state for charts. Manages viewRange [startIdx, endIdx].
 *
 * Interactions:
 *  - Drag on chart: select range to zoom into
 *  - Double-click: reset zoom to default range for current granularity
 *  - Scrubber bar: handles + center-drag for precise zoom control
 *
 * Shared between Portfolio Value and Dividend Income charts for synced zoom.
 */

function getDefaultRange(granularity, totalPoints) {
  const maxIdx = Math.max(0, totalPoints - 1);
  if (granularity === 'daily') {
    const span = Math.min(63, maxIdx); // ~3 months of trading days
    return [Math.max(0, maxIdx - span), maxIdx];
  }
  if (granularity === 'weekly') {
    const span = Math.min(52, maxIdx); // ~1 year
    return [Math.max(0, maxIdx - span), maxIdx];
  }
  return [0, maxIdx]; // monthly/yearly = full range
}

export default function useChartZoom(totalPoints, granularity) {
  const maxIdx = Math.max(0, totalPoints - 1);
  const minSpan = Math.min(7, maxIdx);

  const [viewRange, setViewRange] = useState(() => getDefaultRange(granularity, totalPoints));
  const chartWidthRef = useRef(600);
  const padLRef = useRef(0);

  // Selection state for drag-to-select
  const [selectionRange, setSelectionRange] = useState(null); // [startIdx, endIdx]
  const [selectionPx, setSelectionPx] = useState(null);       // { x1, x2 } relative to chart area
  const dragRef = useRef({ active: false, startX: 0, startPx: 0, startIdx: 0 });

  // Apply default range when granularity or totalPoints changes
  useEffect(() => {
    const [defStart, defEnd] = getDefaultRange(granularity, totalPoints);
    setViewRange([defStart, defEnd]);
  }, [granularity, totalPoints]);

  const isZoomed = viewRange[0] > 0 || viewRange[1] < maxIdx;
  const visibleCount = viewRange[1] - viewRange[0] + 1;

  const setChartWidth = useCallback((w) => {
    chartWidthRef.current = w;
  }, []);

  const setPadL = useCallback((p) => {
    padLRef.current = p;
  }, []);

  // Convert pixel X (relative to container left edge) to bar index
  // Subtracts padL to get chart-area-relative coordinate
  const pxToIdx = useCallback((px) => {
    const chartW = chartWidthRef.current || 600;
    const adjustedPx = px - padLRef.current;
    const [start, end] = viewRange;
    const span = end - start + 1;
    const fraction = Math.max(0, Math.min(1, adjustedPx / chartW));
    return Math.round(start + fraction * (span - 1));
  }, [viewRange]);

  // ── Drag-to-select on chart ──
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rawPx = e.clientX - rect.left;
    const chartPx = rawPx - padLRef.current; // chart-area-relative
    dragRef.current = { active: true, startX: e.clientX, startPx: chartPx, startIdx: pxToIdx(rawPx) };
  }, [pxToIdx]);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const deltaX = Math.abs(e.clientX - dragRef.current.startX);
    if (deltaX < 3) return; // Dead zone

    const rect = e.currentTarget.getBoundingClientRect();
    const rawPx = e.clientX - rect.left;
    const chartPx = rawPx - padLRef.current; // chart-area-relative
    const currentIdx = pxToIdx(rawPx);
    const startIdx = dragRef.current.startIdx;

    const minIdx = Math.min(startIdx, currentIdx);
    const maxSelectIdx = Math.max(startIdx, currentIdx);
    setSelectionRange([
      Math.max(viewRange[0], minIdx),
      Math.min(viewRange[1], maxSelectIdx),
    ]);

    // Store selectionPx as chart-area-relative (0 = chart area left edge)
    const chartW = chartWidthRef.current || 600;
    const x1 = Math.min(dragRef.current.startPx, chartPx);
    const x2 = Math.max(dragRef.current.startPx, chartPx);
    setSelectionPx({ x1: Math.max(0, x1), x2: Math.min(chartW, x2) });
  }, [pxToIdx, viewRange]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current.active && selectionRange) {
      const [sStart, sEnd] = selectionRange;
      if (sEnd - sStart >= 2) {
        setViewRange([
          Math.max(0, sStart),
          Math.min(maxIdx, sEnd),
        ]);
      }
    }
    dragRef.current = { active: false, startX: 0, startPx: 0, startIdx: 0 };
    setSelectionRange(null);
    setSelectionPx(null);
  }, [selectionRange, maxIdx]);

  // ── Touch drag-to-select ──
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const rect = e.currentTarget.getBoundingClientRect();
    const rawPx = touch.clientX - rect.left;
    const chartPx = rawPx - padLRef.current;
    dragRef.current = { active: true, startX: touch.clientX, startPx: chartPx, startIdx: pxToIdx(rawPx) };
  }, [pxToIdx]);

  const handleTouchMove = useCallback((e) => {
    if (!dragRef.current.active || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const deltaX = Math.abs(touch.clientX - dragRef.current.startX);
    if (deltaX < 3) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const rawPx = touch.clientX - rect.left;
    const chartPx = rawPx - padLRef.current;
    const currentIdx = pxToIdx(rawPx);
    const startIdx = dragRef.current.startIdx;

    const minIdx = Math.min(startIdx, currentIdx);
    const maxSelectIdx = Math.max(startIdx, currentIdx);
    setSelectionRange([
      Math.max(viewRange[0], minIdx),
      Math.min(viewRange[1], maxSelectIdx),
    ]);

    const chartW = chartWidthRef.current || 600;
    const x1 = Math.min(dragRef.current.startPx, chartPx);
    const x2 = Math.max(dragRef.current.startPx, chartPx);
    setSelectionPx({ x1: Math.max(0, x1), x2: Math.min(chartW, x2) });
  }, [pxToIdx, viewRange]);

  const handleTouchEnd = useCallback(() => {
    handleMouseUp();
  }, [handleMouseUp]);

  // ── Scrubber API ──
  const setScrubberRange = useCallback((start, end) => {
    const newStart = Math.max(0, Math.min(start, maxIdx));
    const newEnd = Math.max(newStart + minSpan, Math.min(end, maxIdx));
    setViewRange([newStart, newEnd]);
  }, [maxIdx, minSpan]);

  // ── Reset zoom ──
  const resetZoom = useCallback((gran) => {
    const g = gran || granularity;
    const [defStart, defEnd] = getDefaultRange(g, totalPoints);
    setViewRange([defStart, defEnd]);
  }, [granularity, totalPoints]);

  const handleDoubleClick = useCallback(() => {
    resetZoom();
  }, [resetZoom]);

  return {
    viewRange,
    isZoomed,
    visibleCount,
    setChartWidth,
    setPadL,
    // Drag-to-select
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    selectionRange,
    selectionPx,
    // Scrubber
    setScrubberRange,
    // Reset
    resetZoom,
    handleDoubleClick,
  };
}
