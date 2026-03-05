import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../utils/format';
import useIsMobile from '../hooks/useIsMobile';

const COMPOUND_OPTIONS = [
  { key: 'none', label: 'Just Cash' },
  { key: 'daily', label: 'Daily' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'quarterly', label: 'Quarterly' },
];

export default function CashSection({
  cashBalance, onEditCash, cashApy, onEditApy,
  cashCompounding, onChangeCompounding, cashYield, portfolioValue,
}) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const [showMonthly, setShowMonthly] = useState(true);
  const editRef = useRef(null);

  const weightPct = portfolioValue > 0 ? (cashBalance / portfolioValue) * 100 : 0;
  const hasYield = cashCompounding !== 'none' && cashApy > 0;

  useEffect(() => {
    if (!editing) return;
    function handleClick(e) {
      if (editRef.current && !editRef.current.contains(e.target)) {
        saveCash();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [editing, editVal]);

  function saveCash() {
    const val = parseFloat(editVal);
    if (!isNaN(val) && val >= 0) onEditCash(val);
    setEditing(false);
  }

  function startEdit() {
    setEditVal(String(cashBalance));
    setEditing(true);
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderLeft: '3px solid var(--primary)',
      borderRadius: 14,
      padding: isMobile ? '0.8rem' : '1rem 1.4rem',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: isMobile ? 10 : 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            Cash Position
          </span>
          <span style={{
            fontSize: '0.6rem', color: 'var(--text-dim)', background: 'var(--bg-pill)',
            padding: '2px 7px', borderRadius: 6, fontFamily: "'JetBrains Mono', monospace",
          }}>
            {weightPct.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Main content grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr auto',
        gap: isMobile ? 12 : 20,
        alignItems: 'start',
      }}>
        {/* Balance */}
        <div>
          <div style={{
            fontSize: '0.6rem', color: 'var(--text-label)', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: 4,
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            Balance
          </div>
          {editing ? (
            <div ref={editRef} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>$</span>
              <input
                type="number"
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveCash();
                  if (e.key === 'Escape') setEditing(false);
                }}
                min="0"
                step="0.01"
                autoFocus
                style={{
                  width: 120, padding: '4px 8px',
                  background: 'var(--bg-pill)', border: '1px solid var(--primary)',
                  color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '1rem', borderRadius: 6,
                }}
              />
              <button onClick={saveCash} style={{
                background: 'var(--primary)', border: 'none', color: 'white',
                padding: '4px 10px', cursor: 'pointer', fontSize: '0.7rem',
                fontWeight: 600, borderRadius: 6,
              }}>Save</button>
              <button onClick={() => setEditing(false)} style={{
                background: 'var(--bg-pill)', border: 'none', color: 'var(--text-muted)',
                padding: '4px 8px', cursor: 'pointer', fontSize: '0.7rem', borderRadius: 6,
              }}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: isMobile ? '1.1rem' : '1.3rem', fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {formatCurrency(cashBalance)}
              </span>
              <button onClick={startEdit} title="Edit cash amount" style={{
                background: 'none', border: 'none', color: 'var(--text-dim)',
                cursor: 'pointer', fontSize: '0.8rem', padding: '2px 4px',
              }}>
                ✎
              </button>
            </div>
          )}
        </div>

        {/* Compounding + APY */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div style={{
              fontSize: '0.6rem', color: 'var(--text-label)', textTransform: 'uppercase',
              letterSpacing: '0.1em', marginBottom: 4,
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}>
              Compounding
            </div>
            <div style={{
              display: 'flex', gap: 2, background: 'var(--bg-pill)',
              borderRadius: 8, padding: 2, width: 'fit-content',
            }}>
              {COMPOUND_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => onChangeCompounding(opt.key)}
                  style={{
                    padding: '4px 10px', border: 'none', cursor: 'pointer',
                    background: cashCompounding === opt.key ? 'var(--primary)' : 'transparent',
                    color: cashCompounding === opt.key ? 'white' : 'var(--text-muted)',
                    fontSize: '0.68rem', fontWeight: 600, borderRadius: 6,
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {cashCompounding !== 'none' && (
            <div>
              <div style={{
                fontSize: '0.6rem', color: 'var(--text-label)', textTransform: 'uppercase',
                letterSpacing: '0.1em', marginBottom: 4,
                fontFamily: "'DM Sans', system-ui, sans-serif",
              }}>
                APY Rate
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  value={cashApy || ''}
                  onChange={e => onEditApy(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  min="0"
                  max="20"
                  step="0.01"
                  style={{
                    width: 80, padding: '4px 8px',
                    background: 'var(--bg-pill)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.85rem', borderRadius: 6,
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>%</span>
              </div>
            </div>
          )}
        </div>

        {/* Income display */}
        <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <div style={{
            fontSize: '0.6rem', color: 'var(--text-label)', textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: 4,
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            {hasYield ? 'Income' : 'Yield'}
          </div>
          {hasYield ? (
            <div>
              <div style={{
                fontSize: isMobile ? '1rem' : '1.1rem', fontWeight: 700,
                color: 'var(--primary)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {showMonthly
                  ? `${formatCurrency(cashYield.monthlyIncome)}/mo`
                  : `${formatCurrency(cashYield.annualIncome)}/yr`
                }
              </div>
              <button
                onClick={() => setShowMonthly(v => !v)}
                style={{
                  background: 'var(--bg-pill)', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', fontSize: '0.58rem', padding: '2px 6px',
                  borderRadius: 4, marginTop: 4,
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              >
                {showMonthly ? 'Show Yearly' : 'Show Monthly'}
              </button>
            </div>
          ) : (
            <div style={{
              fontSize: isMobile ? '1rem' : '1.1rem', fontWeight: 700,
              color: 'var(--text-dim)',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              0.00%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
