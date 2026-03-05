import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Zoom/pan state for charts. Manages viewRange [startIdx, endIdx],
 * mouse wheel zoom, click-drag selection, pan, and pinch.
 *
 * Designed to be shared between Portfolio Value and Dividend Income charts
 * so zoom is synced.
 *
 * React compatibility: uses only useState, useCallback, useEffect, useRef —
 * all stable APIs fully supported in React 19.x.
 */
export default function useChartZoom(totalPoints) {
  const maxSpan = Math.max(0, totalPoints - 1);
  const [viewRange, setViewRange] = useState([0, maxSpan]);
  const [selectionRange, setSelectionRange] = useState(null);
  const dragRef = useRef({ active: false, start: null });
  const pinchRef = useRef({ active: false, initialDist: 0, initialRange: null });

  // Reset when total points change significantly
  useEffect(() => {
    setViewRange([0, Math.max(0, totalPoints - 1)]);
    setSelectionRange(null);
  }, [totalPoints]);

  const isZoomed = viewRange[0] > 0 || viewRange[1] < totalPoints - 1;
  const visibleCount = viewRange[1] - viewRange[0] + 1;

  // Minimum visible span — clamped so it works with small datasets
  const minSpan = Math.min(7, maxSpan);

  // Mouse wheel zoom centered on cursor
  const handleWheel = useCallback((e, cursorFraction) => {
    e.preventDefault();
    if (totalPoints <= 1) return;

    const [start, end] = viewRange;
    const span = end - start;
    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
    const newSpan = Math.max(minSpan, Math.min(maxSpan, Math.round(span * zoomFactor)));
    if (newSpan === span) return;

    const center = start + span * (cursorFraction || 0.5);
    let newStart = Math.round(center - newSpan * (cursorFraction || 0.5));
    let newEnd = newStart + newSpan;

    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > totalPoints - 1) { newStart -= (newEnd - totalPoints + 1); newEnd = totalPoints - 1; }
    newStart = Math.max(0, newStart);
    newEnd = Math.min(totalPoints - 1, newEnd);

    setViewRange([newStart, newEnd]);
  }, [viewRange, totalPoints, minSpan, maxSpan]);

  // Click-drag to select range
  const handleMouseDown = useCallback((index) => {
    dragRef.current = { active: true, start: index };
    setSelectionRange(null);
  }, []);

  const handleMouseMove = useCallback((index) => {
    if (dragRef.current.active && dragRef.current.start != null) {
      const start = Math.min(dragRef.current.start, index);
      const end = Math.max(dragRef.current.start, index);
      if (end - start >= 2) {
        setSelectionRange([start, end]);
      }
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    if (selectionRange && selectionRange[1] - selectionRange[0] >= 2) {
      setViewRange(selectionRange);
    }
    dragRef.current = { active: false, start: null };
    setSelectionRange(null);
  }, [selectionRange]);

  // Pan when zoomed (shift+drag or programmatic)
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

  // Touch pinch zoom
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchRef.current = { active: true, initialDist: dist, initialRange: [...viewRange] };
    } else if (e.touches.length === 1 && isZoomed) {
      dragRef.current = { active: true, startX: e.touches[0].clientX };
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
      // Guard against zero distance (fingers at same point)
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
    } else if (dragRef.current.active && e.touches.length === 1 && isZoomed) {
      const deltaX = e.touches[0].clientX - (dragRef.current.startX || 0);
      dragRef.current.startX = e.touches[0].clientX;
      // Convert pixel delta to point delta (approximate)
      const pointsPerPx = visibleCount / 300; // rough estimate
      const deltaPoints = Math.round(-deltaX * pointsPerPx);
      if (deltaPoints !== 0) pan(deltaPoints);
    }
  }, [totalPoints, isZoomed, visibleCount, pan, minSpan, maxSpan]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = { active: false, initialDist: 0, initialRange: null };
    dragRef.current = { active: false, start: null };
  }, []);

  const resetZoom = useCallback(() => {
    setViewRange([0, Math.max(0, totalPoints - 1)]);
    setSelectionRange(null);
  }, [totalPoints]);

  return {
    viewRange,
    isZoomed,
    visibleCount,
    selectionRange,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    pan,
    resetZoom,
  };
}
