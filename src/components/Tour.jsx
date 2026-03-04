import React, { useState, useEffect, useCallback } from 'react';

const STEPS = [
  {
    target: '[data-tour="stats"]',
    title: 'Portfolio Stats',
    content: 'Your key metrics at a glance — portfolio value, yield, annual income, and dividend growth rate.',
    position: 'bottom',
  },
  {
    target: '[data-tour="chart"]',
    title: 'Historical & Projected Chart',
    content: 'See how your portfolio has performed and where it\'s headed. Toggle DRIP, contributions, and time horizons.',
    position: 'bottom',
  },
  {
    target: '[data-tour="holdings"]',
    title: 'Your Holdings',
    content: 'View, search, sort, edit shares, and export your portfolio. Click any row for detailed stock analysis.',
    position: 'top',
  },
  {
    target: '[data-tour="market-tab"]',
    title: 'Market Browser',
    content: 'Browse 200+ dividend stocks. Filter by sector, sort by yield or growth, and add to your portfolio.',
    position: 'bottom',
  },
  {
    target: '[data-tour="watchlist-tab"]',
    title: 'Watchlist',
    content: 'Track stocks you\'re interested in. Use the star button on any stock to add it to your watchlist.',
    position: 'bottom',
  },
];

const STORAGE_KEY = 'safeyield-tour-seen';

export default function Tour({ onComplete }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  const updateRect = useCallback(() => {
    const el = document.querySelector(STEPS[step].target);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    } else {
      setRect(null);
    }
  }, [step]);

  useEffect(() => {
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [updateRect]);

  function finish() {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    onComplete();
  }

  function next() {
    if (step >= STEPS.length - 1) finish();
    else setStep(s => s + 1);
  }

  function prev() {
    if (step > 0) setStep(s => s - 1);
  }

  const current = STEPS[step];
  const pad = 8;

  // Clip path to create spotlight cutout
  const clipPath = rect
    ? `polygon(
        0% 0%, 0% 100%, 100% 100%, 100% 0%,
        0% 0%,
        ${rect.left - pad}px ${rect.top - pad}px,
        ${rect.left - pad}px ${rect.top + rect.height + pad}px,
        ${rect.left + rect.width + pad}px ${rect.top + rect.height + pad}px,
        ${rect.left + rect.width + pad}px ${rect.top - pad}px,
        ${rect.left - pad}px ${rect.top - pad}px
      )`
    : 'none';

  // Tooltip position
  const tooltipStyle = {};
  if (rect) {
    const isBottom = current.position === 'bottom';
    tooltipStyle.position = 'fixed';
    tooltipStyle.left = Math.max(16, Math.min(rect.left, window.innerWidth - 320));
    if (isBottom) {
      tooltipStyle.top = rect.top + rect.height + pad + 12;
    } else {
      tooltipStyle.bottom = window.innerHeight - rect.top + pad + 12;
    }
  } else {
    tooltipStyle.position = 'fixed';
    tooltipStyle.top = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }} role="dialog" aria-modal="true" aria-label="Welcome tour">
      {/* Overlay with cutout */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          clipPath: clipPath,
          transition: 'clip-path 0.3s ease',
        }}
        onClick={finish}
      />

      {/* Spotlight border */}
      {rect && (
        <div style={{
          position: 'fixed',
          top: rect.top - pad,
          left: rect.left - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          border: '2px solid var(--primary, #005EB8)',
          boxShadow: '0 0 20px rgba(0,94,184,0.3)',
          pointerEvents: 'none',
          transition: 'all 0.3s ease',
        }} />
      )}

      {/* Tooltip card */}
      <div style={{
        ...tooltipStyle,
        background: 'var(--bg-card, #0a1628)',
        border: '1px solid var(--border-accent, #1a3a5c)',
        padding: '1.2rem',
        width: 300,
        maxWidth: 'calc(100vw - 32px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        zIndex: 10001,
      }}>
        <div style={{
          fontSize: '0.65rem', color: 'var(--text-label, #4a7090)',
          letterSpacing: '0.15em', textTransform: 'uppercase',
          marginBottom: '0.3rem', fontFamily: "'EB Garamond', Georgia, serif",
        }}>
          Step {step + 1} of {STEPS.length}
        </div>
        <div style={{
          fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary, #c8dff0)',
          fontFamily: "'Playfair Display', Georgia, serif",
          marginBottom: '0.5rem',
        }}>
          {current.title}
        </div>
        <div style={{
          fontSize: '0.85rem', color: 'var(--text-muted, #7a9ab8)',
          lineHeight: 1.5, marginBottom: '1rem',
          fontFamily: "'EB Garamond', Georgia, serif",
        }}>
          {current.content}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={finish} style={{
            background: 'none', border: 'none', color: 'var(--text-dim, #4a6a8a)',
            cursor: 'pointer', fontSize: '0.75rem', fontFamily: "'EB Garamond', Georgia, serif",
          }}>
            Skip tour
          </button>
          <div style={{ display: 'flex', gap: 6 }}>
            {step > 0 && (
              <button onClick={prev} style={{
                background: 'none', border: '1px solid var(--border-accent, #1a3a5c)',
                color: 'var(--text-link, #5a8ab0)', padding: '6px 14px',
                cursor: 'pointer', fontSize: '0.8rem',
                fontFamily: "'EB Garamond', Georgia, serif",
              }}>
                Back
              </button>
            )}
            <button onClick={next} style={{
              background: 'var(--primary, #005EB8)', border: 'none',
              color: 'white', padding: '6px 18px', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 700,
              fontFamily: "'EB Garamond', Georgia, serif",
            }}>
              {step >= STEPS.length - 1 ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function shouldShowTour() {
  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function resetTour() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
