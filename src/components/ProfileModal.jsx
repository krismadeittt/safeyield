import React, { useState, useEffect } from 'react';
import { getUserProfile, updateUserProfile } from '../api/user';
import useIsMobile from '../hooks/useIsMobile';

const STRATEGIES = [
  { id: '', label: 'None' },
  { id: 'nobl', label: 'Safe Dividend' },
  { id: 'vig', label: 'Dividend Growth' },
  { id: 'reit', label: 'REIT Income' },
  { id: 'voo', label: 'Broad Market' },
];

export default function ProfileModal({ getToken, onClose, dripEnabled, toggleDrip, onShowTour, retirementMode, onToggleRetirement }) {
  const isMobile = useIsMobile();
  const [displayName, setDisplayName] = useState('');
  const [defaultStrategy, setDefaultStrategy] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserProfile(getToken).then(profile => {
      setDisplayName(profile?.display_name || '');
      setDefaultStrategy(profile?.default_strategy || '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [getToken]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateUserProfile(getToken, { displayName, defaultStrategy });
      onClose();
    } catch (e) {
      console.warn('Profile save failed:', e.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px',
    background: 'var(--bg-input-fill)', border: '1px solid var(--bg-input-border)',
    color: 'var(--text-primary)', fontFamily: "'DM Sans', system-ui, sans-serif",
    marginBottom: 12,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'var(--bg-overlay)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-accent)',
        padding: isMobile ? '1.5rem' : '2rem',
        width: isMobile ? 'calc(100vw - 2rem)' : 360,
        maxWidth: 360,
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          fontWeight: 600, letterSpacing: '0.12em', fontSize: '0.72rem',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          Profile Settings
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '2rem' }}>Loading...</div>
        ) : (
          <>
            <label style={{ fontSize: '0.7rem', color: 'var(--text-link)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Display Name
            </label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name..."
              style={inputStyle}
            />

            <label style={{ fontSize: '0.7rem', color: 'var(--text-link)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Default Strategy
            </label>
            <select
              value={defaultStrategy}
              onChange={e => setDefaultStrategy(e.target.value)}
              style={{ ...inputStyle, marginBottom: 20 }}
            >
              {STRATEGIES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>

            <label style={{ fontSize: '0.7rem', color: 'var(--text-link)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Dividend Reinvestment (DRIP)
            </label>
            <div
              onClick={toggleDrip}
              role="switch"
              aria-checked={dripEnabled}
              aria-label="Toggle DRIP"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDrip(); } }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <div style={{
                width: 36, height: 20, borderRadius: 10,
                background: dripEnabled ? 'var(--primary)' : 'var(--bg-input-border)',
                position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 8,
                  background: 'var(--text-primary)', position: 'absolute', top: 2,
                  left: dripEnabled ? 18 : 2, transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                {dripEnabled ? 'ON — Reinvest dividends as shares' : 'OFF — Accumulate as cash'}
              </span>
            </div>

            {retirementMode === 2 && onToggleRetirement && (
              <>
                <label style={{ fontSize: '0.7rem', color: 'var(--text-link)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  Retirement Planning
                </label>
                <button
                  onClick={() => { onToggleRetirement(); onClose(); }}
                  style={{
                    width: '100%', padding: '8px', cursor: 'pointer', marginBottom: 20,
                    background: 'none', border: '1px solid var(--border-accent)',
                    color: 'var(--primary)', fontSize: '0.8rem',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                  }}
                >
                  Enable Retirement Planning
                </button>
              </>
            )}

            <button onClick={() => { onShowTour?.(); onClose(); }} style={{
              width: '100%', padding: '8px', cursor: 'pointer', marginBottom: 12,
              background: 'none', border: '1px solid var(--border-accent)',
              color: 'var(--text-link)', fontSize: '0.8rem',
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              Show Welcome Tour
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 1, padding: '10px', cursor: 'pointer',
                background: saving ? 'var(--border-accent)' : 'var(--primary)',
                color: 'white', border: 'none', fontSize: '0.9rem',
                fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={onClose} style={{
                padding: '10px 16px', cursor: 'pointer',
                background: 'transparent', border: '1px solid var(--border-accent)',
                color: 'var(--text-link)', fontSize: '0.9rem',
              }}>
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
