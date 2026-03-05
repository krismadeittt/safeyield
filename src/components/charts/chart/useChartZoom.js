import { useState, useCallback, useEffect, useRef, useMemo } from 'react';

/**
 * Zoom/pan state for charts. Manages viewRange [startIdx, endIdx].
 *
 * Interactions:
 *  - Scroll wheel: zoom in/out centered on cursor (1.15x per tick)
 *  - Click + drag: pan left/right when zoomed
 *  - Double-click: reset zoom to full view
 *  - Pinch (mobile): zoom in/out
 *  - Single-finger drag (mobile, zoomed): pan
 *
 * Shared between Portfolio Value and Dividend Income charts for synced zoom.
 */
export default function useChartZoom(totalPoints, totalYearsSpan = 1) {
  const maxSpan = Math.max(0, totalPoints - 1);
  const minSpan = Math.min(7, maxSpan);

  const [viewRange, setViewRange] = useState([0, maxSpan]);
  const dragRef = useRef({ active: false, startX: 0, startRange: null });
  const pinchRef = useRef({ active: false, initialDist: 0, initialRange: null });
  const chartWidthRef = useRef(600);

  // Reset when total points change
  useEffect(() => {
    setViewRange([0, Math.max(0, totalPoints - 1)]);
  }, [totalPoints]);

  const isZoomed = viewRange[0] > 0 || viewRange[1] < totalPoints - 1;
  const visibleCount = viewRange[1] - viewRange[0] + 1;

  // Approximate visible years for smart granularity
  const visibleYears = useMemo(() => {
    if (totalPoints <= 1) return totalYearsSpan;
    return totalYearsSpan * (visibleCount / totalPoints);
  }, [totalYearsSpan, visibleCount, totalPoints]);

  // Store chart pixel width for pan calculations
  const setChartWidth = useCallback((w) => {
    chartWidthRef.current = w;
  }, []);

  // ── Scroll wheel zoom ──
  const handleWheel = useCallback((e, cursorFraction) => {
    e.preventDefault();
    if (totalPoints <= 1) return;

    const [start, end] = viewRange;
    const span = end - start;
    const zoomFactor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    const newSpan = Math.max(minSpan, Math.min(maxSpan, Math.round(span * zoomFactor)));
    if (newSpan === span) return;

    const cf = cursorFraction || 0.5;
    const center = start + span * cf;
    let newStart = Math.round(center - newSpan * cf);
    let newEnd = newStart + newSpan;

    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > totalPoints - 1) { newStart -= (newEnd - totalPoints + 1); newEnd = totalPoints - 1; }
    newStart = Math.max(0, newStart);
    newEnd = Math.min(totalPoints - 1, newEnd);

    setViewRange([newStart, newEnd]);
  }, [viewRange, totalPoints, minSpan, maxSpan]);

  // ── Click + drag to pan ──
  const handleMouseDown = useCallback((e) => {
    if (!isZoomed) return;
    dragRef.current = { active: true, startX: e.clientX, startRange: [...viewRange] };
  }, [isZoomed, viewRange]);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current.active) return;
    const deltaX = e.clientX - dragRef.current.startX;
    const pointsPerPx = visibleCount / (chartWidthRef.current || 600);
    const deltaPoints = Math.round(-deltaX * pointsPerPx);

    const [origStart, origEnd] = dragRef.current.startRange;
    let newStart = origStart + deltaPoints;
    let newEnd = origEnd + deltaPoints;

    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > totalPoints - 1) { newStart -= (newEnd - totalPoints + 1); newEnd = totalPoints - 1; }
    newStart = Math.max(0, newStart);
    newEnd = Math.min(totalPoints - 1, newEnd);

    setViewRange([newStart, newEnd]);
  }, [visibleCount, totalPoints]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = { active: false, startX: 0, startRange: null };
  }, []);

  // ── Double-click to reset ──
  const handleDoubleClick = useCallback(() => {
    setViewRange([0, Math.max(0, totalPoints - 1)]);
  }, [totalPoints]);

  // ── Pan (programmatic) ──
  const pan = useCallback((deltaPoints) => {
    const [start, end] = viewRange;
    let newStart = start + deltaPoints;
    let newEnd = end + deltaPoints;
    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > totalPoints - 1) { newStart -= (newEnd - totalPoints + 1); newEnd = totalPoints - 1; }
    newStart = Math.max(0, newStart);
    newEnd = Math.min(totalPoints - 1, newEnd);
    setViewRange([newStart, newEnd]);
  }, [viewRange, totalPoints]);

  // ── Touch pinch zoom ──
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchRef.current = { active: true, initialDist: dist, initialRange: [...viewRange] };
    } else if (e.touches.length === 1 && isZoomed) {
      dragRef.current = { active: true, startX: e.touches[0].clientX, startRange: [...viewRange] };
    }
  }, [viewRange, isZoomed]);

  const handleTouchMove = useCallback((e) => {
    if (pinchRef.current.active && e.touches.length === 2) {
      e.preventDefault();
      if (totalPoints <= 1) return;

      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (dist < 1 || pinchRef.current.initialDist < 1) return;

      const scale = pinchRef.current.initialDist / dist;
      const [iStart, iEnd] = pinchRef.current.initialRange;
      const iSpan = iEnd - iStart;
      const center = (iStart + iEnd) / 2;
      const newSpan = Math.max(minSpan, Math.min(maxSpan, Math.round(iSpan * scale)));
      let newStart = Math.round(center - newSpan / 2);
      let newEnd = newStart + newSpan;
      if (newStart < 0) { newEnd -= newStart; newStart = 0; }
      if (newEnd > totalPoints - 1) { newStart -= (newEnd - totalPoints + 1); newEnd = totalPoints - 1; }
      setViewRange([Math.max(0, newStart), Math.min(totalPoints - 1, newEnd)]);
    } else if (dragRef.current.active && e.touches.length === 1) {
      const deltaX = e.touches[0].clientX - dragRef.current.startX;
      const pointsPerPx = visibleCount / (chartWidthRef.current || 600);
      const deltaPoints = Math.round(-deltaX * pointsPerPx);

      const [origStart, origEnd] = dragRef.current.startRange || viewRange;
      let newStart = origStart + deltaPoints;
      let newEnd = origEnd + deltaPoints;
      if (newStart < 0) { newEnd -= newStart; newStart = 0; }
      if (newEnd > totalPoints - 1) { newStart -= (newEnd - totalPoints + 1); newEnd = totalPoints - 1; }
      setViewRange([Math.max(0, newStart), Math.min(totalPoints - 1, newEnd)]);
    }
  }, [totalPoints, visibleCount, viewRange, minSpan, maxSpan]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = { active: false, initialDist: 0, initialRange: null };
    dragRef.current = { active: false, startX: 0, startRange: null };
  }, []);

  const resetZoom = useCallback(() => {
    setViewRange([0, Math.max(0, totalPoints - 1)]);
  }, [totalPoints]);

  return {
    viewRange,
    isZoomed,
    visibleCount,
    visibleYears,
    setChartWidth,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleDoubleClick,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    pan,
    resetZoom,
  };
}
