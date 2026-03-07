import React from 'react';
import useIsMobile from '../hooks/useIsMobile';

export default function RetirementGate({ onYes, onNo }) {
  const isMobile = useIsMobile();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: isMobile ? '1rem' : '2rem',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 40, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 9, height: 9, background: 'var(--primary)',
          boxShadow: '0 0 8px #10b981',
        }} />
        <span style={{ fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Safe<span style={{ color: 'var(--primary)' }}>Yield</span>
        </span>
      </div>

      {/* Card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        padding: isMobile ? '2rem 1.5rem' : '2.5rem 3rem',
        maxWidth: 460,
        width: '100%',
        borderRadius: 16,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '1.2rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 12,
        }}>
          Would you like to use Retirement Planning?
        </div>

        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          lineHeight: 1.6,
          marginBottom: 32,
        }}>
          Retirement mode analyzes your portfolio with Monte Carlo simulations to estimate
          the probability of sustaining your desired income through retirement.
          You can switch back to the standard dividend dashboard at any time.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            onClick={onYes}
            style={{
              width: '100%',
              padding: '14px',
              cursor: 'pointer',
              background: 'var(--primary)',
              color: 'white',
              border: 'none',
              fontSize: '0.95rem',
              fontWeight: 700,
              borderRadius: 10,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            Use Retirement Tracker
          </button>
          <button
            onClick={onNo}
            style={{
              width: '100%',
              padding: '14px',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              fontSize: '0.95rem',
              fontWeight: 500,
              borderRadius: 10,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          >
            No, Just Track Portfolio
          </button>
        </div>
      </div>
    </div>
  );
}
