import React, { lazy, Suspense } from 'react';

const PortfolioSunburst = lazy(() => import('./PortfolioSunburst'));
const PortfolioMountains = lazy(() => import('./PortfolioMountains'));

export default function VisualizerToggle({ vizType, setVizType, holdings, liveData, portfolioValue, weightedYield, annualIncome, expanded, setExpanded, cashBalance = 0, cashApy = 0, cashCompounding = 'none' }) {
  if (vizType === 'none') {
    return (
      <div style={{ textAlign: "center", padding: "8px 0" }}>
        <button
          onClick={() => setVizType('sunburst')}
          style={{
            background: "var(--accent-bg)", border: "none",
            color: "var(--primary)", padding: "8px 20px", cursor: "pointer",
            fontSize: "0.75rem", fontFamily: "'DM Sans', system-ui, sans-serif",
            borderRadius: 8, fontWeight: 500,
          }}
        >
          Show Portfolio Visualizer
        </button>
      </div>
    );
  }

  const vizProps = { holdings, liveData, portfolioValue, weightedYield, annualIncome, cashBalance, cashApy, cashCompounding };

  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "20px 22px", overflow: "hidden",
    }}>
      {/* Header: expand/hide buttons */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        marginBottom: 16,
      }}>
        <div style={{ display: "flex", gap: 8 }}>
          {setExpanded && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: "var(--bg-pill)", border: "none", cursor: "pointer",
                color: "var(--text-muted)", fontSize: "0.65rem",
                fontFamily: "'DM Sans', system-ui, sans-serif",
                padding: "4px 10px", borderRadius: 6,
              }}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
          <button
            onClick={() => setVizType('none')}
            style={{
              background: "var(--bg-pill)", border: "none", cursor: "pointer",
              color: "var(--text-dim)", fontSize: "0.65rem",
              fontFamily: "'DM Sans', system-ui, sans-serif",
              padding: "4px 10px", borderRadius: 6,
            }}
          >
            Hide
          </button>
        </div>
      </div>

      {/* Content: both visualizations stacked */}
      <Suspense fallback={
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-dim)", fontSize: "0.85rem" }}>
          Loading visualizer...
        </div>
      }>
        <PortfolioSunburst {...vizProps} expanded={expanded} />
        <PortfolioMountains {...vizProps} expanded={expanded} />
      </Suspense>
    </div>
  );
}
