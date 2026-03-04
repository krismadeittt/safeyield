import React from 'react';
import useIsMobile from '../hooks/useIsMobile';

export default function ConfirmModal({ message, onConfirm, onCancel }) {
  const isMobile = useIsMobile();

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 250,
      background: 'var(--bg-overlay)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel} role="dialog" aria-modal="true" aria-label="Confirmation">
      <div style={{
        background: 'var(--bg-card, #FFFFFF)', border: '1px solid var(--border-accent, #DDE1EA)',
        padding: isMobile ? '1.5rem' : '2rem',
        width: isMobile ? 'calc(100vw - 2rem)' : 340,
        maxWidth: 340, borderRadius: 16,
        boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          fontWeight: 600, letterSpacing: '0.12em', fontSize: '0.72rem',
          textTransform: 'uppercase', color: 'var(--text-muted, #7a9ab8)', marginBottom: '1rem',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          Confirm
        </div>
        <p style={{
          color: 'var(--text-primary, #1F2234)', fontSize: '0.95rem',
          marginBottom: '1.5rem', lineHeight: 1.5,
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '10px', cursor: 'pointer',
            background: 'var(--red)', color: 'white', border: 'none',
            fontSize: '0.9rem', fontWeight: 700,
            fontFamily: "'DM Sans', system-ui, sans-serif",
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }} aria-label="Confirm action">
            Confirm
          </button>
          <button onClick={onCancel} style={{
            padding: '10px 16px', cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border-accent, #DDE1EA)',
            color: 'var(--text-link, #5a8ab0)', fontSize: '0.9rem',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }} aria-label="Cancel action" autoFocus>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
