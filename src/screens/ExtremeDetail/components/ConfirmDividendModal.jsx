import React, { useState } from 'react';

export default function ConfirmDividendModal({ record, onConfirm, onClose }) {
  var [actualAmount, setActualAmount] = useState(record.expected_amount || 0);
  var [actualTotal, setActualTotal] = useState(record.expected_total || 0);
  var [notes, setNotes] = useState('');
  var [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm(actualAmount, actualTotal, notes || null);
    } finally {
      setSaving(false);
    }
  }

  var inputStyle = {
    width: '100%', padding: '8px 12px',
    background: 'var(--bg-input)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', fontFamily: "'DM Sans', system-ui, sans-serif",
    borderRadius: 8, fontSize: '0.85rem',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg-overlay)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        padding: '1.5rem', width: 360, maxWidth: 'calc(100vw - 2rem)',
        borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>
          Confirm Dividend — {record.ticker}
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: 16 }}>
          Ex-Date: {record.ex_date} &middot; Expected: ${record.expected_total?.toFixed(2) || '0.00'}
        </div>

        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Actual per share ($)</label>
        <input
          type="number" step="0.0001" min="0"
          value={actualAmount}
          onChange={e => {
            var v = parseFloat(e.target.value) || 0;
            setActualAmount(v);
            // Auto-calc total if we know shares
            if (record.expected_amount && record.expected_total && record.expected_amount > 0) {
              var shares = record.expected_total / record.expected_amount;
              setActualTotal(Math.round(v * shares * 100) / 100);
            }
          }}
          style={{ ...inputStyle, marginBottom: 10 }}
        />

        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Actual total received ($)</label>
        <input
          type="number" step="0.01" min="0"
          value={actualTotal}
          onChange={e => setActualTotal(parseFloat(e.target.value) || 0)}
          style={{ ...inputStyle, marginBottom: 10 }}
        />

        <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any notes..."
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', marginBottom: 16 }}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleConfirm} disabled={saving} style={{
            flex: 1, padding: '10px', cursor: saving ? 'default' : 'pointer',
            background: saving ? 'var(--border-accent)' : 'var(--primary)',
            color: 'white', border: 'none', fontSize: '0.85rem',
            fontWeight: 600, borderRadius: 8,
          }}>
            {saving ? 'Confirming...' : 'Confirm'}
          </button>
          <button onClick={onClose} style={{
            padding: '10px 16px', cursor: 'pointer',
            background: 'var(--bg-pill)', border: 'none',
            color: 'var(--text-muted)', fontSize: '0.85rem', borderRadius: 8,
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
