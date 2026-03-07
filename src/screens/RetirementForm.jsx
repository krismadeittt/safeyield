import React, { useState, useMemo } from 'react';
import useIsMobile from '../hooks/useIsMobile';

function calcAge(dateStr) {
  if (!dateStr) return null;
  const dob = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

function calcAgeAtDate(dobStr, targetStr) {
  if (!dobStr || !targetStr) return null;
  const dob = new Date(dobStr + 'T00:00:00');
  const target = new Date(targetStr + 'T00:00:00');
  let age = target.getFullYear() - dob.getFullYear();
  const m = target.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && target.getDate() < dob.getDate())) age--;
  return age;
}

export default function RetirementForm({ onSave, onBack, existingPlan }) {
  const isMobile = useIsMobile();

  const [dob, setDob] = useState(existingPlan?.date_of_birth || '');
  const [retirementDate, setRetirementDate] = useState(existingPlan?.retirement_date || '');
  const [lifeAge, setLifeAge] = useState(existingPlan?.life_expectancy_age || '');
  const [monthlyIncome, setMonthlyIncome] = useState(
    existingPlan?.monthly_income_needed ? (existingPlan.monthly_income_needed / 100).toString() : ''
  );
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const currentAge = useMemo(() => calcAge(dob), [dob]);
  const retirementAge = useMemo(() => calcAgeAtDate(dob, retirementDate), [dob, retirementDate]);

  function validate() {
    const errs = {};
    if (!dob) {
      errs.dob = 'Required';
    } else {
      const age = calcAge(dob);
      if (age < 18 || age > 99) errs.dob = 'Age must be between 18 and 99';
    }

    if (!retirementDate) {
      errs.retirementDate = 'Required';
    } else {
      const today = new Date().toISOString().slice(0, 10);
      if (retirementDate <= today) errs.retirementDate = 'Must be a future date';
      if (dob && retirementAge !== null && retirementAge <= currentAge) {
        errs.retirementDate = 'Retirement age must be greater than current age';
      }
    }

    const lifeAgeNum = parseInt(lifeAge, 10);
    if (!lifeAge || isNaN(lifeAgeNum)) {
      errs.lifeAge = 'Required';
    } else if (lifeAgeNum > 120) {
      errs.lifeAge = 'Must be 120 or less';
    } else if (retirementAge !== null && lifeAgeNum <= retirementAge) {
      errs.lifeAge = 'Must be greater than retirement age';
    }

    const income = parseFloat(monthlyIncome);
    if (!monthlyIncome || isNaN(income) || income <= 0) {
      errs.monthlyIncome = 'Enter a positive amount';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      await onSave({
        date_of_birth: dob,
        retirement_date: retirementDate,
        life_expectancy_age: parseInt(lifeAge, 10),
        monthly_income_needed: Math.round(parseFloat(monthlyIncome) * 100),
      });
    } catch (err) {
      console.warn('Save failed:', err.message);
      setSaving(false);
    }
  }

  const labelStyle = {
    display: 'block',
    fontSize: '0.7rem',
    color: 'var(--text-muted)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 6,
    fontFamily: "'DM Sans', system-ui, sans-serif",
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 14px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    fontSize: '0.9rem',
    borderRadius: 8,
    boxSizing: 'border-box',
  };

  const errorStyle = {
    color: 'var(--red)',
    fontSize: '0.7rem',
    marginTop: 4,
  };

  const badgeStyle = {
    display: 'inline-block',
    marginLeft: 8,
    padding: '2px 8px',
    background: 'var(--accent-bg, var(--bg-pill))',
    color: 'var(--primary)',
    fontSize: '0.75rem',
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    borderRadius: 6,
  };

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
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 9, height: 9, background: 'var(--primary)',
          boxShadow: '0 0 8px #10b981',
        }} />
        <span style={{ fontWeight: 800, fontSize: '1.4rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Safe<span style={{ color: 'var(--primary)' }}>Yield</span>
        </span>
      </div>

      {/* Form card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        padding: isMobile ? '1.5rem' : '2rem 2.5rem',
        maxWidth: 480,
        width: '100%',
        borderRadius: 16,
      }}>
        <div style={{
          fontWeight: 700,
          fontSize: '1.1rem',
          color: 'var(--text-primary)',
          marginBottom: 4,
        }}>
          Retirement Details
        </div>
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '0.78rem',
          marginBottom: 24,
          lineHeight: 1.5,
        }}>
          We'll use this information to project whether your portfolio can sustain your retirement income.
        </p>

        <form onSubmit={handleSubmit}>
          {/* Date of birth */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>
              Date of Birth
              {currentAge !== null && <span style={badgeStyle}>Age {currentAge}</span>}
            </label>
            <input
              type="date"
              value={dob}
              onChange={e => setDob(e.target.value)}
              style={inputStyle}
            />
            {errors.dob && <div style={errorStyle}>{errors.dob}</div>}
          </div>

          {/* Retirement date */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>
              Planned Retirement Date
              {retirementAge !== null && <span style={badgeStyle}>Age {retirementAge}</span>}
            </label>
            <input
              type="date"
              value={retirementDate}
              onChange={e => setRetirementDate(e.target.value)}
              style={inputStyle}
            />
            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 4 }}>
              Pick a specific date — it helps our math.
            </div>
            {errors.retirementDate && <div style={errorStyle}>{errors.retirementDate}</div>}
          </div>

          {/* Life expectancy */}
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Age You Plan to Live To</label>
            <input
              type="number"
              value={lifeAge}
              onChange={e => setLifeAge(e.target.value)}
              placeholder="e.g., 90"
              min={retirementAge ? retirementAge + 1 : 50}
              max={120}
              style={{ ...inputStyle, fontFamily: "'JetBrains Mono', monospace" }}
            />
            {errors.lifeAge && <div style={errorStyle}>{errors.lifeAge}</div>}
          </div>

          {/* Monthly income */}
          <div style={{ marginBottom: 28 }}>
            <label style={labelStyle}>Monthly Income Needed (excluding Social Security)</label>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', fontSize: '0.9rem',
                fontFamily: "'JetBrains Mono', monospace",
              }}>$</span>
              <input
                type="number"
                value={monthlyIncome}
                onChange={e => setMonthlyIncome(e.target.value)}
                placeholder="3,000"
                min="1"
                step="100"
                style={{
                  ...inputStyle,
                  paddingLeft: 30,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              />
            </div>
            {errors.monthlyIncome && <div style={errorStyle}>{errors.monthlyIncome}</div>}
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: '12px',
                cursor: saving ? 'default' : 'pointer',
                background: saving ? 'var(--border)' : 'var(--primary)',
                color: 'white',
                border: 'none',
                fontSize: '0.95rem',
                fontWeight: 700,
                borderRadius: 10,
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}
            >
              {saving ? 'Saving...' : existingPlan ? 'Update Plan' : 'Continue'}
            </button>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                style={{
                  padding: '12px 20px',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  fontSize: '0.9rem',
                  borderRadius: 10,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >
                Back
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
