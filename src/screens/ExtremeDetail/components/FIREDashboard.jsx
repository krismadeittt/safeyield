import React from 'react';
import useFIRE from '../../../hooks/extreme/useFIRE';
import FIREChart from '../charts/FIREChart';
import FIRESensitivity from './FIRESensitivity';
import { formatCurrency } from '../../../utils/format';

export default function FIREDashboard({ holdings, liveData, summary, isMobile }) {
  var totalAnnualDividendIncome = (summary && summary.totalAnnualIncome) || 0;

  var fire = useFIRE(totalAnnualDividendIncome, holdings, liveData);

  var annualExpenses = fire.monthlyExpenses * 12;
  var incomeGap = annualExpenses - totalAnnualDividendIncome;
  var yearsToFIRE = fire.crossoverYear !== null ? fire.crossoverYear : 'N/A';

  // Milestone badges
  var milestones = [25, 50, 75, 100];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>FIRE Dashboard</h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-dim)' }}>
          Financial Independence / Retire Early — track when dividends cover expenses.
        </p>
      </div>

      {/* Progress circle + milestones */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: isMobile ? '1.25rem' : '1.5rem',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        {/* Progress circle */}
        <div style={{ position: 'relative', width: 140, height: 140 }}>
          <svg width={140} height={140} viewBox="0 0 140 140">
            <circle cx={70} cy={70} r={60} fill="none" stroke="var(--border)" strokeWidth={8} />
            <circle
              cx={70} cy={70} r={60}
              fill="none" stroke="var(--green)" strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 60}
              strokeDashoffset={2 * Math.PI * 60 * (1 - Math.min(fire.progressPct, 100) / 100)}
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
              {isFinite(fire.progressPct) ? fire.progressPct : 100}%
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>to FIRE</span>
          </div>
        </div>

        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', textAlign: 'center' }}>
          FIRE Number: <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{formatCurrency(fire.fireNumber)}</span>
        </div>

        {/* Milestone badges */}
        <div style={{ display: 'flex', gap: 8 }}>
          {milestones.map(function(m) {
            var reached = fire.progressPct >= m;
            return (
              <div key={m} style={{
                padding: '4px 10px', borderRadius: 6,
                background: reached ? 'rgba(60,191,163,0.15)' : 'var(--bg-pill)',
                border: '1px solid ' + (reached ? 'rgba(60,191,163,0.4)' : 'var(--border)'),
                color: reached ? '#3CBFA3' : 'var(--text-muted)',
                fontSize: '0.65rem', fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {m}%
              </div>
            );
          })}
        </div>
      </div>

      {/* Input controls */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Parameters</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <InputField
            label="Monthly Expenses"
            value={fire.monthlyExpenses}
            onChange={function(v) { fire.setMonthlyExpenses(Number(v) || 0); }}
            prefix="$"
            isMobile={isMobile}
          />
          <InputField
            label="Monthly Contribution"
            value={fire.monthlyContribution}
            onChange={function(v) { fire.setMonthlyContribution(Number(v) || 0); }}
            prefix="$"
            isMobile={isMobile}
          />
          <InputField
            label="Target Yield %"
            value={fire.targetYield}
            onChange={function(v) { fire.setTargetYield(Number(v) || 0); }}
            suffix="%"
            isMobile={isMobile}
          />
        </div>
      </div>

      {/* Key stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard label="Years to FIRE" value={yearsToFIRE} color={fire.crossoverYear !== null ? '#3CBFA3' : 'var(--text-muted)'} />
        <StatCard label="Portfolio Needed" value={formatCurrency(fire.fireNumber)} />
        <StatCard label="Current Div Income" value={formatCurrency(totalAnnualDividendIncome)} />
        <StatCard label="Annual Income Gap" value={incomeGap > 0 ? formatCurrency(incomeGap) : 'Covered!'} color={incomeGap > 0 ? '#ef4444' : '#3CBFA3'} />
      </div>

      {/* Crossover date display */}
      {fire.crossoverYear !== null && (
        <div style={{
          background: 'rgba(60,191,163,0.08)', border: '1px solid rgba(60,191,163,0.3)',
          borderRadius: 10, padding: '12px 16px', textAlign: 'center',
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Projected FIRE date: </span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#3CBFA3', fontFamily: "'JetBrains Mono', monospace" }}>
            ~{new Date().getFullYear() + fire.crossoverYear}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}> ({fire.crossoverYear} years from now)</span>
        </div>
      )}

      {/* Chart */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: isMobile ? '1rem' : '1.25rem',
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>Income vs Expenses Projection</div>
        <FIREChart projections={fire.projections} crossoverYear={fire.crossoverYear} isMobile={isMobile} />
      </div>

      {/* Sensitivity */}
      <FIRESensitivity
        baseProjections={fire.projections}
        crossoverYear={fire.crossoverYear}
        isMobile={isMobile}
      />
    </div>
  );
}

function InputField({ label, value, onChange, prefix, suffix, isMobile }) {
  return (
    <div style={{ flex: '1 1 140px', minWidth: 120 }}>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {prefix && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={function(e) { onChange(e.target.value); }}
          style={{
            width: '100%', padding: '6px 8px',
            background: 'var(--bg-input)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--text-primary)',
            fontSize: '0.78rem', fontFamily: "'JetBrains Mono', monospace",
            outline: 'none',
          }}
        />
        {suffix && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{suffix}</span>}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '12px 16px', flex: '1 1 120px', minWidth: 100,
    }}>
      <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
    </div>
  );
}
