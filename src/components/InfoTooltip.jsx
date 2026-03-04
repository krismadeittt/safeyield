import React, { useState, useRef, useEffect } from 'react';

export default function InfoTooltip({ text }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!show) return;
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setShow(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [show]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <span
        onClick={e => { e.stopPropagation(); setShow(s => !s); }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        role="button"
        aria-label="More info"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShow(s => !s); } }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%',
          border: '1px solid #3a5a78', color: '#3a5a78',
          fontSize: '0.55rem', fontWeight: 700, cursor: 'help',
          marginLeft: 4, lineHeight: 1, fontFamily: 'system-ui',
          flexShrink: 0,
        }}
      >
        i
      </span>
      {show && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 6, padding: '8px 12px', background: '#0a1628',
          border: '1px solid #1a3a5c', color: '#c8dff0', fontSize: '0.75rem',
          fontFamily: "'EB Garamond', Georgia, serif", lineHeight: 1.4,
          whiteSpace: 'normal', width: 220, zIndex: 50,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)', fontWeight: 400,
          pointerEvents: 'auto',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}
