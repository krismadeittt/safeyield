import React, { useState } from 'react';
import { TABS } from './tabs';
import TaxProfileForm from './components/TaxProfileForm';
import CSVUpload from './components/CSVUpload';
import ReconciliationDashboard from './components/ReconciliationDashboard';
import AfterTaxIncome from './components/AfterTaxIncome';
import SafetyDashboard from './components/SafetyDashboard';
import InflationDashboard from './components/InflationDashboard';
import FIREDashboard from './components/FIREDashboard';
import WhatIfBuilder from './components/WhatIfBuilder';
import TLHDashboard from './components/TLHDashboard';
import IntlTaxDashboard from './components/IntlTaxDashboard';
import REITDashboard from './components/REITDashboard';
import useTaxProfile from '../../hooks/extreme/useTaxProfile';
import useCSVUpload from '../../hooks/extreme/useCSVUpload';
import useReconciliation from '../../hooks/extreme/useReconciliation';

export default function ExtremeDetailPage({
  holdings, liveData, summary, getToken, theme, toggleTheme,
  isMobile, divScheduleMap, dripEnabled, cashBalance, cashApy, onBack,
}) {
  var [activeTab, setActiveTab] = useState('reconciliation');
  var taxProfile = useTaxProfile(getToken);
  var csvUpload = useCSVUpload(getToken);
  var reconciliation = useReconciliation(getToken, holdings, divScheduleMap);

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <TaxProfileForm
              taxProfile={taxProfile}
              holdings={holdings}
              liveData={liveData}
              isMobile={isMobile}
            />
            <AfterTaxIncome
              holdings={holdings}
              liveData={liveData}
              taxProfile={taxProfile.profile}
              isMobile={isMobile}
            />
          </div>
        );
      case 'csv':
        return (
          <CSVUpload
            csvUpload={csvUpload}
            isMobile={isMobile}
          />
        );
      case 'safety':
        return (
          <SafetyDashboard
            holdings={holdings}
            liveData={liveData}
            isMobile={isMobile}
          />
        );
      case 'inflation':
        return (
          <InflationDashboard
            holdings={holdings}
            liveData={liveData}
            summary={summary}
            isMobile={isMobile}
          />
        );
      case 'fire':
        return (
          <FIREDashboard
            holdings={holdings}
            liveData={liveData}
            summary={summary}
            isMobile={isMobile}
          />
        );
      case 'whatif':
        return (
          <WhatIfBuilder
            holdings={holdings}
            liveData={liveData}
            summary={summary}
            isMobile={isMobile}
          />
        );
      case 'tlh':
        return (
          <TLHDashboard
            holdings={holdings}
            liveData={liveData}
            taxProfile={taxProfile.profile}
            isMobile={isMobile}
          />
        );
      case 'international':
        return (
          <IntlTaxDashboard
            holdings={holdings}
            liveData={liveData}
            isMobile={isMobile}
          />
        );
      case 'reits':
        return (
          <REITDashboard
            holdings={holdings}
            liveData={liveData}
            isMobile={isMobile}
          />
        );
      default:
        return null;
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
            {'\u2190'} Back
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
              <button key={tab.id} onClick={function() { setActiveTab(tab.id); }} style={{
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
