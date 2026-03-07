import React, { useState } from 'react';
import { useSignIn, useUser } from '@clerk/clerk-react';
import useIsMobile from '../hooks/useIsMobile';

export default function ResetConfirmModal({ onConfirm, onCancel }) {
  const isMobile = useIsMobile();
  const { user } = useUser();
  const { signIn, setActive } = useSignIn();
  const [step, setStep] = useState('warn'); // 'warn' | 'password'
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  async function handleVerify(e) {
    e.preventDefault();
    if (!password || verifying) return;
    setVerifying(true);
    setError('');
    try {
      const email = user.primaryEmailAddress?.emailAddress;
      if (!email) throw new Error('No email found');
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        onConfirm();
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err) {
      const msg = err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err.message || 'Incorrect password';
      setError(msg);
    } finally {
      setVerifying(false);
    }
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 250,
    background: 'var(--bg-overlay)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  };

  const cardStyle = {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    padding: isMobile ? '1.5rem' : '2rem',
    width: isMobile ? 'calc(100vw - 2rem)' : 380,
    maxWidth: 380, borderRadius: 16,
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  };

  const headerStyle = {
    fontWeight: 600, letterSpacing: '0.12em', fontSize: '0.72rem',
    textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem',
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };

  if (step === 'warn') {
    return (
      <div style={overlayStyle} onClick={onCancel} role="dialog" aria-modal="true">
        <div style={cardStyle} onClick={e => e.stopPropagation()}>
          <div style={headerStyle}>Reset Portfolio</div>
          <div style={{
            color: 'var(--red)', fontSize: '1.5rem', textAlign: 'center',
            marginBottom: 12,
          }}>
            &#9888;
          </div>
          <p style={{
            color: 'var(--text-primary)', fontSize: '0.9rem',
            marginBottom: 8, lineHeight: 1.5, textAlign: 'center',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            Are you sure you want to reset your portfolio?
          </p>
          <p style={{
            color: 'var(--text-secondary)', fontSize: '0.78rem',
            marginBottom: 24, lineHeight: 1.5, textAlign: 'center',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            This will permanently delete all your holdings, snapshots, retirement plan, and cash balance. This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setStep('password')} style={{
              flex: 1, padding: '10px', cursor: 'pointer',
              background: 'var(--red)', color: 'white', border: 'none',
              fontSize: '0.9rem', fontWeight: 700, borderRadius: 8,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              Yes, Reset Everything
            </button>
            <button onClick={onCancel} style={{
              padding: '10px 16px', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: '0.9rem', borderRadius: 8,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }} autoFocus>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onCancel} role="dialog" aria-modal="true">
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <div style={headerStyle}>Confirm Your Identity</div>
        <p style={{
          color: 'var(--text-secondary)', fontSize: '0.82rem',
          marginBottom: 16, lineHeight: 1.5,
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          Enter your password to confirm the reset.
        </p>
        <form onSubmit={handleVerify}>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(''); }}
            placeholder="Enter your password"
            autoFocus
            style={{
              width: '100%', padding: '10px 14px', marginBottom: error ? 6 : 16,
              background: 'var(--bg-input)', border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              color: 'var(--text-primary)', fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: '0.9rem', borderRadius: 8, boxSizing: 'border-box',
            }}
          />
          {error && (
            <div style={{
              color: 'var(--red)', fontSize: '0.72rem', marginBottom: 12,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={!password || verifying} style={{
              flex: 1, padding: '10px', cursor: !password || verifying ? 'default' : 'pointer',
              background: !password || verifying ? 'var(--border)' : 'var(--red)',
              color: 'white', border: 'none',
              fontSize: '0.9rem', fontWeight: 700, borderRadius: 8,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              {verifying ? 'Verifying...' : 'Reset Portfolio'}
            </button>
            <button type="button" onClick={onCancel} style={{
              padding: '10px 16px', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', fontSize: '0.9rem', borderRadius: 8,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
