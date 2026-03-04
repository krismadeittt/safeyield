import React, { useState, useEffect } from 'react';
import { getUserProfile, updateUserProfile } from '../api/user';
import useIsMobile from '../hooks/useIsMobile';

const STRATEGIES = [
  { id: '', label: 'None' },
  { id: 'nobl', label: 'Dividend Aristocrats' },
  { id: 'vig', label: 'Dividend Growth (VIG)' },
  { id: 'reit', label: 'REIT Income' },
  { id: 'voo', label: 'High Yield Mix' },
];

export default function ProfileModal({ getToken, onClose, dripEnabled, toggleDrip }) {
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
      await updateUserProfile(getToken, displayName, defaultStrategy);
      onClose();
    } catch (e) {
      console.warn('Profile save failed:', e.message);
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#c8dff0', fontFamily: "'EB Garamond', Georgia, serif",
    outline: 'none', marginBottom: 12,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(2,8,23,0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: '#0a1628', border: '1px solid #1a3a5c',
        padding: isMobile ? '1.5rem' : '2rem',
        width: isMobile ? 'calc(100vw - 2rem)' : 360,
        maxWidth: 360,
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          fontWeight: 600, letterSpacing: '0.12em', fontSize: '0.72rem',
          textTransform: 'uppercase', color: '#7a9ab8', marginBottom: '1rem',
          fontFamily: "'EB Garamond', Georgia, serif",
        }}>
          Profile Settings
        </div>

        {loading ? (
          <div style={{ color: '#2a4a6a', textAlign: 'center', padding: '2rem' }}>Loading...</div>
        ) : (
          <>
            <label style={{ fontSize: '0.7rem', color: '#5a8ab0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Display Name
            </label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name..."
              style={inputStyle}
            />

            <label style={{ fontSize: '0.7rem', color: '#5a8ab0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
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

            <label style={{ fontSize: '0.7rem', color: '#5a8ab0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Dividend Reinvestment (DRIP)
            </label>
            <div
              onClick={toggleDrip}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <div style={{
                width: 36, height: 20, borderRadius: 10,
                background: dripEnabled ? '#005EB8' : 'rgba(255,255,255,0.08)',
                position: 'relative', transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 8,
                  background: '#c8dff0', position: 'absolute', top: 2,
                  left: dripEnabled ? 18 : 2, transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ color: '#c8dff0', fontSize: '0.85rem', fontFamily: "'EB Garamond', Georgia, serif" }}>
                {dripEnabled ? 'ON — Reinvest dividends as shares' : 'OFF — Accumulate as cash'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 1, padding: '10px', cursor: 'pointer',
                background: saving ? '#1a3a5c' : '#005EB8',
                color: 'white', border: 'none', fontSize: '0.9rem',
                fontWeight: 700, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={onClose} style={{
                padding: '10px 16px', cursor: 'pointer',
                background: 'transparent', border: '1px solid #1a3a5c',
                color: '#5a8ab0', fontSize: '0.9rem',
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
