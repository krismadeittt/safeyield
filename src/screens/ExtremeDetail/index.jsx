import React, { useState } from 'react';
import { TABS } from './tabs';
import TaxProfileForm from './components/TaxProfileForm';
import CSVUpload from './components/CSVUpload';
import ReconciliationDashboard from './components/ReconciliationDashboard';
import useTaxProfile from '../../hooks/extreme/useTaxProfile';
import useCSVUpload from '../../hooks/extreme/useCSVUpload';
import useReconciliation from '../../hooks/extreme/useReconciliation';

function ComingSoon({ label }) {
  return (
    <div style={{
      textAlign: 'center', padding: '4rem 2rem',
      color: 'var(--text-dim)', fontSize: '0.9rem',
    }}>
      <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.3 }}>
        {label === 'Safety' ? '\u{1F6E1}' :
         label === 'FIRE' ? '\u{1F525}' :
         label === 'What-If' ? '\u{1F52E}' :
         label === 'TLH' ? '\u{1F4B0}' :
         label === 'International' ? '\u{1F30D}' :
         label === 'Inflation' ? '\u{1F4C8}' :
         label === 'REITs' ? '\u{1F3E2}' : '\u{2699}'}
      </div>
      <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{label}</div>
      <div>Coming in a future phase</div>
    </div>
  );
}

export default function ExtremeDetailPage({
  holdings, liveData, summary, getToken, theme, toggleTheme,
  isMobile, divScheduleMap, dripEnabled, cashBalance, cashApy, onBack,
}) {
  const [activeTab, setActiveTab] = useState('reconciliation');
  const taxProfile = useTaxProfile(getToken);
  const csvUpload = useCSVUpload(getToken);
  const reconciliation = useReconciliation(getToken, holdings, divScheduleMap);

  function renderTab() {
    switch (activeTab) {
      case 'reconciliation':
        return (
          <ReconciliationDashboard
            reconciliation={reconciliation}
            holdings={holdings}
            liveData={liveData}
            divScheduleMap={divScheduleMap}
            isMobile={isMobile}
          />
        );
      case 'tax':
        return (
          <TaxProfileForm
            taxProfile={taxProfile}
            holdings={holdings}
            liveData={liveData}
            isMobile={isMobile}
          />
        );
      case 'csv':
        return (
          <CSVUpload
            csvUpload={csvUpload}
            isMobile={isMobile}
          />
        );
      default: {
        var tab = TABS.find(function(t) { return t.id === activeTab; });
        return <ComingSoon label={tab ? tab.label : activeTab} />;
      }
    }
  }

  return (
    <div style={{
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: 'var(--bg)', minHeight: '100vh',
      color: 'var(--text-primary)',
    }}>
      {/* Header */}
      <nav style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: isMobile ? '0 0.75rem' : '0 1.5rem',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        height: 58, position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
              <span style={{ color: '#3CBFA3' }}>Safe</span>
              <span style={{ color: 'var(--text-primary)' }}>Yield</span>
            </span>
          </div>
          <button onClick={onBack} style={{
            background: 'var(--bg-pill)', border: 'none',
            color: 'var(--text-muted)', padding: '6px 14px',
            cursor: 'pointer', fontSize: '0.75rem',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            borderRadius: 8,
          }}>
            \u2190 Back
          </button>
          <span style={{
            fontSize: isMobile ? '0.7rem' : '0.8rem',
            fontWeight: 600,
            color: 'var(--primary)',
            background: 'var(--accent-bg)',
            padding: '4px 10px',
            borderRadius: 8,
          }}>
            Extreme Detail Mode
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button onClick={toggleTheme} aria-label="Toggle theme" style={{
            background: 'var(--bg-pill)', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', padding: '5px 10px', fontSize: '0.8rem',
            borderRadius: 8,
          }}>
            {theme === 'dark' ? '\u2600' : '\u263E'}
          </button>
        </div>
      </nav>

      {/* Tab Navigation */}
      <div style={{
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border)',
        padding: isMobile ? '0 0.5rem' : '0 1.5rem',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        <div style={{
          display: 'flex', gap: 2, minWidth: 'max-content',
          padding: '8px 0',
        }}>
          {TABS.map(function(tab) {
            var isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                background: isActive ? 'var(--accent-bg)' : 'transparent',
                border: 'none', cursor: 'pointer',
                color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: isMobile ? '0.7rem' : '0.78rem',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                fontWeight: isActive ? 600 : 500,
                padding: isMobile ? '5px 8px' : '6px 12px',
                borderRadius: 8,
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                opacity: tab.phase ? 0.5 : 1,
              }}>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        padding: isMobile ? '0.75rem' : '1.5rem',
      }}>
        {renderTab()}
      </div>
    </div>
  );
}
