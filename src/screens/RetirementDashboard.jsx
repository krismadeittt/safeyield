import React, { useEffect, useState, useMemo, useCallback } from 'react';
import useRetirementMC from '../hooks/useRetirementMC';
import RetirementFanChart from '../components/charts/RetirementFanChart';
import RetirementSummary from '../components/RetirementSummary';
import { getMCCache, saveMCCache } from '../api/retirement';
import { formatCurrency } from '../utils/format';

/**
 * Hash plan + holdings into a short string for cache invalidation.
 */
function hashInputs(plan, holdings, cashBalance) {
  const parts = [
    plan.date_of_birth,
    plan.retirement_date,
    plan.life_expectancy_age,
    plan.monthly_income_needed,
    cashBalance,
    ...holdings.map(h => `${h.ticker}:${h.shares}`).sort(),
  ];
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function calcAgeAtDate(dobStr, targetStr) {
  const dob = new Date(dobStr + 'T00:00:00');
  const target = new Date(targetStr + 'T00:00:00');
  let age = target.getFullYear() - dob.getFullYear();
  const m = target.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && target.getDate() < dob.getDate())) age--;
  return age;
}

export default function RetirementDashboard({
  retirementPlan, holdings, liveData, cashBalance, cashApy, cashCompounding,
  dripEnabled, summary, getToken, onEditPlan, onExitRetirement,
  theme, toggleTheme, isMobile,
}) {
  const { result: mcResult, progress, running, run: runMC } = useRetirementMC();
  const [cachedResult, setCachedResult] = useState(null);
  const [cacheChecked, setCacheChecked] = useState(false);

  const plan = retirementPlan;
  const now = new Date();
  const retDate = new Date(plan.retirement_date + 'T00:00:00');
  const retirementAge = calcAgeAtDate(plan.date_of_birth, plan.retirement_date);

  // Growth months: from today to retirement date
  const growthMonths = useMemo(() => {
    const diffMs = retDate.getTime() - now.getTime();
    return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
  }, [plan.retirement_date]);

  // Withdrawal months: from retirement to end of life
  const withdrawalMonths = useMemo(() => {
    return Math.max(1, (plan.life_expectancy_age - retirementAge) * 12);
  }, [plan.life_expectancy_age, retirementAge]);

  const monthlyWithdrawal = plan.monthly_income_needed / 100; // cents to dollars
  const inputHash = useMemo(() => hashInputs(plan, holdings, cashBalance), [plan, holdings, cashBalance]);
  const startYear = now.getFullYear();

  // Build serializable params for the worker
  const buildMCParams = useCallback(() => ({
    growthMonths,
    withdrawalMonths,
    holdings: holdings.map(h => ({
      ticker: h.ticker, shares: h.shares, price: h.price,
      yld: h.yld, div: h.div, g5: h.g5,
    })),
    liveData: Object.fromEntries(
      Object.entries(liveData).map(([k, v]) => [k, {
        price: v?.price, divYield: v?.divYield, annualDiv: v?.annualDiv, beta: v?.beta,
      }])
    ),
    monthlyWithdrawal,
    cashBalance,
    numSims: 10000,
  }), [growthMonths, withdrawalMonths, holdings, liveData, monthlyWithdrawal, cashBalance]);

  // Check KV cache on mount
  useEffect(() => {
    let cancelled = false;
    getMCCache(getToken).then(cached => {
      if (cancelled) return;
      if (cached && cached.planHash === inputHash) {
        setCachedResult(cached);
      }
      setCacheChecked(true);
    }).catch(() => {
      if (!cancelled) setCacheChecked(true);
    });
    return () => { cancelled = true; };
  }, [getToken, inputHash]);

  // Run simulation if no valid cache
  useEffect(() => {
    if (!cacheChecked) return;
    if (cachedResult) return; // have valid cache
    if (running) return;
    if (mcResult) return; // already finished
    if (!holdings.length) return;
    runMC(buildMCParams());
  }, [cacheChecked, cachedResult, running, mcResult, holdings.length, buildMCParams, runMC]);

  // Cache results after MC completes
  useEffect(() => {
    if (!mcResult) return;
    const toCache = { ...mcResult, planHash: inputHash, cachedAt: new Date().toISOString() };
    saveMCCache(getToken, toCache).catch(() => {});
  }, [mcResult, inputHash, getToken]);

  const displayResult = mcResult || cachedResult;

  return (
    <div style={{
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: 'var(--bg)',
      minHeight: '100vh',
      color: 'var(--text-primary)',
    }}>
      {/* Nav bar */}
      <nav style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: isMobile ? '0 0.75rem' : '0 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 58,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
              <span style={{ color: '#3CBFA3' }}>Safe</span>
              <span style={{ color: 'var(--text-primary)' }}>Yield</span>
            </span>
          </div>
          <span style={{
            fontSize: '0.72rem',
            color: 'var(--primary)',
            fontWeight: 600,
            background: 'var(--bg-pill, var(--bg-dark))',
            padding: '4px 10px',
            borderRadius: 8,
          }}>
            Retirement
          </span>
        </div>

        <div style={{ display: 'flex', gap: isMobile ? 6 : 12, alignItems: 'center' }}>
          <button onClick={onEditPlan} style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', padding: '6px 12px', cursor: 'pointer',
            fontSize: '0.72rem', fontFamily: "'DM Sans', system-ui, sans-serif", borderRadius: 8,
          }}>
            Edit Plan
          </button>
          <button onClick={onExitRetirement} style={{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', padding: '6px 12px', cursor: 'pointer',
            fontSize: '0.72rem', fontFamily: "'DM Sans', system-ui, sans-serif", borderRadius: 8,
          }}>
            Exit Retirement Mode
          </button>
          <button onClick={toggleTheme} aria-label="Toggle theme" style={{
            background: 'var(--bg-pill, var(--bg-dark))', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: '5px 10px', fontSize: '0.8rem', borderRadius: 8,
          }}>
            {theme === 'dark' ? '\u2600' : '\u263E'}
          </button>
          <span style={{
            color: 'var(--text-primary)', fontSize: '0.82rem',
            fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
            background: 'var(--bg-pill, var(--bg-dark))', padding: '4px 10px', borderRadius: 8,
          }}>
            {formatCurrency(summary.portfolioValue)}
          </span>
        </div>
      </nav>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '0.75rem' : '1.5rem' }}>
        {/* Plan summary bar */}
        <div style={{
          display: 'flex', gap: isMobile ? 8 : 24, flexWrap: 'wrap',
          marginBottom: '1rem', padding: '0.8rem 1rem',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <PlanStat label="Retirement Age" value={retirementAge} />
          <PlanStat label="Plan To Age" value={plan.life_expectancy_age} />
          <PlanStat label="Monthly Need" value={formatCurrency(monthlyWithdrawal)} mono />
          <PlanStat label="Years to Retirement" value={Math.round(growthMonths / 12)} />
          <PlanStat label="Withdrawal Years" value={plan.life_expectancy_age - retirementAge} />
        </div>

        {/* Progress bar while running */}
        {running && (
          <div style={{
            marginBottom: '1rem', padding: '1rem 1.2rem',
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              Running 10,000 simulations...
            </div>
            <div style={{
              width: '100%', height: 6, background: 'var(--bg-dark, var(--bg-input))',
              borderRadius: 3, overflow: 'hidden',
            }}>
              <div style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                background: 'var(--primary)',
                transition: 'width 0.3s',
                borderRadius: 3,
              }} />
            </div>
            <div style={{
              fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 6,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {Math.round(progress * 100)}%
            </div>
          </div>
        )}

        {/* Chart + Summary */}
        {displayResult && (
          <>
            <RetirementFanChart
              mcResult={displayResult}
              startYear={startYear}
            />
            <RetirementSummary
              successRate={displayResult.successRate}
              medianAtRetirement={displayResult.medianAtRetirement}
              medianAtEnd={displayResult.medianAtEnd}
              monthlyIncome={monthlyWithdrawal}
              retirementAge={retirementAge}
              endAge={plan.life_expectancy_age}
              numSims={displayResult.numSims}
            />
          </>
        )}

        {/* Empty state */}
        {!running && !displayResult && (
          <div style={{
            textAlign: 'center', padding: '4rem 2rem',
            color: 'var(--text-dim)', fontSize: '0.9rem',
          }}>
            {holdings.length === 0
              ? 'Add holdings to your portfolio to run retirement simulations.'
              : 'Unable to run simulation. Please try again.'}
          </div>
        )}
      </div>
    </div>
  );
}

function PlanStat({ label, value, mono }) {
  return (
    <div>
      <div style={{
        fontSize: '0.5rem', color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.1em', fontFamily: 'system-ui',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)',
        fontFamily: mono ? "'JetBrains Mono', monospace" : "'DM Sans', system-ui, sans-serif",
      }}>
        {value}
      </div>
    </div>
  );
}
