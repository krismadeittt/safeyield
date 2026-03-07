import React, { useState, useEffect } from 'react';
import { calcEffectiveRate, getMarginalRate, getQualifiedRate } from '../../../utils/tax';

const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married Filing Jointly' },
  { value: 'married_separate', label: 'Married Filing Separately' },
  { value: 'head_of_household', label: 'Head of Household' },
];

const PRESETS = [
  { label: 'Single, 22% bracket', filing_status: 'single', federal_rate: 22, qualified_rate: 15, ordinary_rate: 22, stcg_rate: 22, ltcg_rate: 15 },
  { label: 'Single, 24% bracket', filing_status: 'single', federal_rate: 24, qualified_rate: 15, ordinary_rate: 24, stcg_rate: 24, ltcg_rate: 15 },
  { label: 'MFJ, 22% bracket', filing_status: 'married_joint', federal_rate: 22, qualified_rate: 15, ordinary_rate: 22, stcg_rate: 22, ltcg_rate: 15 },
  { label: 'MFJ, 24% bracket', filing_status: 'married_joint', federal_rate: 24, qualified_rate: 15, ordinary_rate: 24, stcg_rate: 24, ltcg_rate: 15 },
  { label: 'CA MFJ 24%', filing_status: 'married_joint', federal_rate: 24, state_rate: 9.3, qualified_rate: 15, ordinary_rate: 24, stcg_rate: 24, ltcg_rate: 15, state_code: 'CA' },
  { label: 'NY Single 24%', filing_status: 'single', federal_rate: 24, state_rate: 6.85, qualified_rate: 15, ordinary_rate: 24, stcg_rate: 24, ltcg_rate: 15, state_code: 'NY' },
  { label: 'TX MFJ 24% (no state)', filing_status: 'married_joint', federal_rate: 24, state_rate: 0, qualified_rate: 15, ordinary_rate: 24, stcg_rate: 24, ltcg_rate: 15, state_code: 'TX' },
];

var inputStyle = {
  width: '100%', padding: '8px 12px',
  background: 'var(--bg-input)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', fontFamily: "'DM Sans', system-ui, sans-serif",
  borderRadius: 8, fontSize: '0.85rem',
};

var labelStyle = {
  fontSize: '0.75rem', color: 'var(--text-muted)',
  fontWeight: 500, marginBottom: 4, display: 'block',
};

function RateInput({ label, value, onChange, suffix }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type="number" step="0.1" min="0" max="100"
          value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={inputStyle}
        />
        {suffix && (
          <span style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-dim)', fontSize: '0.75rem',
          }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

export default function TaxProfileForm({ taxProfile, holdings, liveData, isMobile }) {
  var { profile, loading, saving, error, save, remove } = taxProfile;

  var [form, setForm] = useState({
    filing_status: 'single',
    federal_rate: 0,
    state_rate: 0,
    local_rate: 0,
    qualified_rate: 0,
    ordinary_rate: 0,
    reit_rate: 0,
    ltcg_rate: 0,
    stcg_rate: 0,
    state_code: '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        filing_status: profile.filing_status || 'single',
        federal_rate: profile.federal_rate || 0,
        state_rate: profile.state_rate || 0,
        local_rate: profile.local_rate || 0,
        qualified_rate: profile.qualified_rate || 0,
        ordinary_rate: profile.ordinary_rate || 0,
        reit_rate: profile.reit_rate || 0,
        ltcg_rate: profile.ltcg_rate || 0,
        stcg_rate: profile.stcg_rate || 0,
        state_code: profile.state_code || '',
      });
    }
  }, [profile]);

  function setField(key, val) {
    setForm(function(prev) { var next = { ...prev }; next[key] = val; return next; });
  }

  function applyPreset(preset) {
    setForm(function(prev) {
      return {
        ...prev,
        filing_status: preset.filing_status || prev.filing_status,
        federal_rate: preset.federal_rate ?? prev.federal_rate,
        state_rate: preset.state_rate ?? prev.state_rate,
        qualified_rate: preset.qualified_rate ?? prev.qualified_rate,
        ordinary_rate: preset.ordinary_rate ?? prev.ordinary_rate,
        stcg_rate: preset.stcg_rate ?? prev.stcg_rate,
        ltcg_rate: preset.ltcg_rate ?? prev.ltcg_rate,
        state_code: preset.state_code || prev.state_code,
      };
    });
  }

  async function handleSave() {
    await save(form);
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: 'var(--text-dim)', textAlign: 'center' }}>Loading tax profile...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>Tax Profile</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Set your tax rates to see after-tax dividend income across all features.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}

      {/* Presets */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Quick Presets</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESETS.map(function(p, i) {
            return (
              <button key={i} onClick={() => applyPreset(p)} style={{
                background: 'var(--bg-pill)', border: '1px solid var(--border)',
                color: 'var(--text-muted)', padding: '5px 10px',
                cursor: 'pointer', fontSize: '0.7rem', borderRadius: 6,
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Form */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Filing Status</div>
        <select
          value={form.filing_status}
          onChange={e => setField('filing_status', e.target.value)}
          style={{ ...inputStyle, marginBottom: 16 }}
        >
          {FILING_STATUSES.map(function(fs) {
            return <option key={fs.value} value={fs.value}>{fs.label}</option>;
          })}
        </select>

        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Income Tax Rates</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <RateInput label="Federal Rate %" value={form.federal_rate} onChange={v => setField('federal_rate', v)} suffix="%" />
          <RateInput label="State Rate %" value={form.state_rate} onChange={v => setField('state_rate', v)} suffix="%" />
          <RateInput label="Local Rate %" value={form.local_rate} onChange={v => setField('local_rate', v)} suffix="%" />
        </div>

        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Dividend Tax Rates</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <RateInput label="Qualified Div Rate %" value={form.qualified_rate} onChange={v => setField('qualified_rate', v)} suffix="%" />
          <RateInput label="Ordinary Div Rate %" value={form.ordinary_rate} onChange={v => setField('ordinary_rate', v)} suffix="%" />
          <RateInput label="REIT Rate %" value={form.reit_rate} onChange={v => setField('reit_rate', v)} suffix="%" />
        </div>

        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Capital Gains Rates</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <RateInput label="Long-Term CG %" value={form.ltcg_rate} onChange={v => setField('ltcg_rate', v)} suffix="%" />
          <RateInput label="Short-Term CG %" value={form.stcg_rate} onChange={v => setField('stcg_rate', v)} suffix="%" />
        </div>

        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>State</div>
        <input
          placeholder="State code (e.g., CA, NY, TX)"
          value={form.state_code}
          onChange={e => setField('state_code', e.target.value.toUpperCase().slice(0, 5))}
          style={{ ...inputStyle, marginBottom: 16, maxWidth: 200 }}
        />

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '10px 24px', cursor: saving ? 'default' : 'pointer',
            background: saving ? 'var(--border-accent)' : 'var(--primary)',
            color: 'white', border: 'none', fontSize: '0.85rem',
            fontWeight: 600, borderRadius: 8,
          }}>
            {saving ? 'Saving...' : (profile ? 'Update Profile' : 'Save Profile')}
          </button>
          {profile && (
            <button onClick={remove} style={{
              padding: '10px 16px', cursor: 'pointer',
              background: 'var(--bg-pill)', border: 'none',
              color: 'var(--text-muted)', fontSize: '0.85rem',
              borderRadius: 8,
            }}>
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {profile && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Current Profile Summary</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <SummaryItem label="Filing Status" value={FILING_STATUSES.find(function(f) { return f.value === profile.filing_status; })?.label || profile.filing_status} />
            <SummaryItem label="Qualified Rate" value={profile.qualified_rate + '%'} />
            <SummaryItem label="Ordinary Rate" value={profile.ordinary_rate + '%'} />
            <SummaryItem label="State + Local" value={(profile.state_rate + profile.local_rate) + '%'} />
            <SummaryItem label="Total Drag (Qualified)" value={((profile.qualified_rate || 0) + (profile.state_rate || 0) + (profile.local_rate || 0)) + '%'} />
            <SummaryItem label="Total Drag (Ordinary)" value={((profile.ordinary_rate || 0) + (profile.state_rate || 0) + (profile.local_rate || 0)) + '%'} />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={{ minWidth: 100 }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
