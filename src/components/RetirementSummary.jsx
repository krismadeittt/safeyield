import React from 'react';
import { formatCurrency } from '../utils/format';
import useIsMobile from '../hooks/useIsMobile';

export default function RetirementSummary({ successRate, medianAtRetirement, medianAtEnd, monthlyIncome, retirementAge, endAge, numSims }) {
  const isMobile = useIsMobile();

  const rate = successRate ?? 0;
  const rateColor = rate >= 90 ? 'var(--green)'
    : rate >= 70 ? 'var(--warning)'
    : 'var(--red)';

  const interpretation = rate >= 90
    ? 'Your plan looks strong.'
    : rate >= 70
    ? 'Your plan is reasonable but has some risk. Consider adjusting.'
    : 'Your plan has significant risk of running out of money. Consider increasing savings or reducing withdrawal.';

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 14,
      padding: isMobile ? '1.2rem 1rem' : '1.5rem 1.8rem',
      marginTop: '1rem',
    }}>
      {/* Success rate — large and prominent */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{
          fontSize: '0.65rem',
          color: 'var(--text-dim)',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          marginBottom: 8,
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          Probability of Success
        </div>
        <div style={{
          fontSize: isMobile ? '2.4rem' : '3.2rem',
          fontWeight: 800,
          color: rateColor,
          fontFamily: "'JetBrains Mono', monospace",
          lineHeight: 1,
        }}>
          {(successRate ?? 0).toFixed(1)}%
        </div>
        <div style={{
          fontSize: '0.72rem',
          color: 'var(--text-secondary)',
          marginTop: 8,
          fontFamily: "'DM Sans', system-ui, sans-serif",
          lineHeight: 1.5,
          maxWidth: 400,
          margin: '8px auto 0',
        }}>
          {interpretation}
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
        gap: 0,
        borderTop: '1px solid var(--border)',
      }}>
        <StatCard
          label="Projected at Retirement"
          value={formatCurrency(medianAtRetirement)}
          sublabel={`Median (P50) at age ${retirementAge}`}
        />
        <StatCard
          label={`Median at Age ${endAge}`}
          value={formatCurrency(medianAtEnd)}
          sublabel="50th percentile at end of life"
          borderLeft={!isMobile}
        />
        <StatCard
          label="Monthly Withdrawal"
          value={formatCurrency(monthlyIncome)}
          sublabel="Excluding Social Security"
          borderLeft={!isMobile}
        />
      </div>

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        paddingTop: 12,
        borderTop: '1px solid var(--border)',
        marginTop: 0,
      }}>
        <span style={{
          fontSize: '0.58rem',
          color: 'var(--text-dim)',
          fontStyle: 'italic',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          Based on {(numSims ?? 0).toLocaleString()} Monte Carlo simulations · GBM with correlated returns · DRIP during growth phase
        </span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sublabel, borderLeft }) {
  return (
    <div style={{
      padding: '1rem 0.8rem',
      borderLeft: borderLeft ? '1px solid var(--border)' : 'none',
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: '0.5rem',
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        marginBottom: 6,
        fontFamily: 'system-ui',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '1.3rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        fontFamily: "'JetBrains Mono', monospace",
        lineHeight: 1,
      }}>
        {value}
      </div>
      {sublabel && (
        <div style={{
          fontSize: '0.6rem',
          color: 'var(--text-dim)',
          marginTop: 4,
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}
