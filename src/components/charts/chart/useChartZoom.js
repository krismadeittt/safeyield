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

/**
 * Compute the default viewRange for a granularity.
 * Centers "Now" at ~65% from left so user sees mostly history + some future.
 *
 * @param {string} granularity - 'daily' | 'weekly' | 'monthly' | 'yearly'
 * @param {number} totalPoints - total bar count
 * @param {number} nowIdx - index of the "Now" bar
 */
function getDefaultRange(granularity, totalPoints, nowIdx) {
  const maxIdx = Math.max(0, totalPoints - 1);
  const now = Math.max(0, Math.min(maxIdx, nowIdx));

  // Monthly/yearly: show full range
  if (granularity !== 'daily' && granularity !== 'weekly') {
    return [0, maxIdx];
  }

  // Daily: ~63 trading days (~3 months). Weekly: ~52 weeks (~1 year).
  const span = granularity === 'daily' ? Math.min(63, maxIdx) : Math.min(52, maxIdx);

  // Place "Now" at 65% from left edge
  const nowOffset = Math.round(span * 0.65);
  let start = now - nowOffset;
  let end = start + span;

  // Clamp to valid range
  if (start < 0) { end -= start; start = 0; }
  if (end > maxIdx) { start -= (end - maxIdx); end = maxIdx; }
  start = Math.max(0, start);
  end = Math.min(maxIdx, end);

  return [start, end];
}

export default function useChartZoom(totalPoints, granularity, nowIdx = -1) {
  const maxIdx = Math.max(0, totalPoints - 1);
  const minSpan = Math.min(7, maxIdx);
  const effectiveNow = nowIdx >= 0 ? nowIdx : maxIdx;

  const [viewRange, setViewRange] = useState(() => getDefaultRange(granularity, totalPoints, effectiveNow));
  const chartWidthRef = useRef(600);
  const padLRef = useRef(0);

  // Selection state for drag-to-select
  const [selectionRange, setSelectionRange] = useState(null); // [startIdx, endIdx]
  const [selectionPx, setSelectionPx] = useState(null);       // { x1, x2 } relative to chart area
  const dragRef = useRef({ active: false, startX: 0, startPx: 0, startIdx: 0 });

  // Apply default range when granularity or totalPoints changes
  useEffect(() => {
    const [defStart, defEnd] = getDefaultRange(granularity, totalPoints, effectiveNow);
    setViewRange([defStart, defEnd]);
  }, [granularity, totalPoints, effectiveNow]);

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
    const [defStart, defEnd] = getDefaultRange(g, totalPoints, effectiveNow);
    setViewRange([defStart, defEnd]);
  }, [granularity, totalPoints, effectiveNow]);

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
