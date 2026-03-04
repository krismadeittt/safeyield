import React, { lazy, Suspense } from 'react';

const PortfolioSunburst = lazy(() => import('./PortfolioSunburst'));
const PortfolioMountains = lazy(() => import('./PortfolioMountains'));

const TABS = [
  { key: 'sunburst', label: 'Sunburst' },
  { key: 'mountain', label: 'Mountain' },
];

export default function VisualizerToggle({ vizType, setVizType, holdings, liveData, portfolioValue, weightedYield, annualIncome }) {
  if (vizType === 'none') {
    return (
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <button
          onClick={() => setVizType('sunburst')}
          style={{
            background: "none", border: "1px solid var(--border-accent)",
            color: "var(--text-link)", padding: "6px 16px", cursor: "pointer",
            fontSize: "0.75rem", fontFamily: "'EB Garamond', Georgia, serif",
            letterSpacing: "0.1em",
          }}
        >
          Show Portfolio Visualizer
        </button>
      </div>
    );
  }

  const vizProps = { holdings, liveData, portfolioValue, weightedYield, annualIncome };

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-accent)",
    }}>
      {/* Tab bar */}
      <div style={{
        display: "flex", alignItems: "center", borderBottom: "1px solid var(--border-dim)",
        padding: "0 16px",
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setVizType(tab.key)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "10px 16px",
              color: vizType === tab.key ? "var(--accent)" : "var(--text-dim)",
              fontSize: "0.72rem",
              fontFamily: "'EB Garamond', Georgia, serif",
              fontWeight: vizType === tab.key ? 700 : 400,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              borderBottom: vizType === tab.key ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "color 0.2s",
            }}
          >
            {tab.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setVizType('none')}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-sub)", fontSize: "0.65rem",
            fontFamily: "'EB Garamond', Georgia, serif",
            letterSpacing: "0.1em",
          }}
        >
          HIDE
        </button>
      </div>

      {/* Content */}
      <Suspense fallback={
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
          Loading visualizer...
        </div>
      }>
        {vizType === 'sunburst' && <PortfolioSunburst {...vizProps} />}
        {vizType === 'mountain' && <PortfolioMountains {...vizProps} />}
      </Suspense>
    </div>
  );
}
