import React, { useRef } from 'react';
import usePortfolio from './hooks/usePortfolio';
import Onboarding from './screens/Onboarding';
import Dashboard from './screens/Dashboard';
import StockDetail from './screens/StockDetail';
import MarketBrowser from './screens/MarketBrowser';
import HoldingsTable from './components/HoldingsTable';
import { formatCurrency } from './utils/format';

export default function App() {
  const {
    isOnboarding, activeTab, setActiveTab,
    holdings, prePrices, pricesLoading, detailView, setDetailView,
    liveData, loadingStates, searchQuery, setSearchQuery,
    showAddModal, setShowAddModal,
    addTicker, setAddTicker, addResults, addShares, setAddShares,
    addYield, setAddYield, isAdding,
    handleLoad, addStock, removeStock, editShares, selectStock,
    pickTicker,
    summary,
  } = usePortfolio();

  const sharesInputRef = useRef(null);

  // Onboarding screen
  if (isOnboarding) {
    return <Onboarding onLoad={handleLoad} prePrices={prePrices} preLoading={pricesLoading} />;
  }

  // Stock detail view
  if (detailView) {
    return (
      <div style={{ fontFamily: "Georgia, serif", background: "#050e1a", minHeight: "100vh", color: "#c8dff0" }}>
        <nav style={{
          background: "rgba(2,8,23,0.97)", borderBottom: "1px solid #1e293b",
          padding: "0 1.5rem", display: "flex", alignItems: "center",
          justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Logo />
            <button onClick={() => setDetailView(null)} style={{
              background: "none", border: "1px solid #1a3a5c", color: "#5a8ab0",
              padding: "4px 12px", cursor: "pointer", fontSize: "0.75rem",
              fontFamily: "'EB Garamond', Georgia, serif",
            }}>
              ← Back
            </button>
          </div>
          <span style={{ color: "#5a8ab0", fontSize: "0.82rem" }}>
            {formatCurrency(summary.portfolioValue)}
          </span>
        </nav>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem" }}>
          <StockDetail
            stock={detailView}
            live={liveData[detailView.ticker]}
            loading={loadingStates[detailView.ticker]}
            onBack={() => setDetailView(null)}
          />
        </div>
      </div>
    );
  }

  // Main app
  return (
    <div style={{ fontFamily: "Georgia, serif", background: "#020817", minHeight: "100vh", color: "#c8dff0" }}>
      {/* Navigation */}
      <nav style={{
        background: "rgba(2,8,23,0.97)", borderBottom: "1px solid #1e293b",
        padding: "0 1.5rem", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <Logo />
          {["dashboard", "market"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              background: "none", border: "none", cursor: "pointer",
              color: activeTab === tab ? "#005EB8" : "#2a4a6a",
              fontSize: "0.85rem", fontFamily: "'EB Garamond', Georgia, serif",
              fontWeight: activeTab === tab ? 700 : 400,
              transition: "color 0.2s",
            }}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ color: "#5a8ab0", fontSize: "0.82rem" }}>
            {formatCurrency(summary.portfolioValue)}
          </span>
          <span style={{
            fontSize: "0.6rem", color: "#3a7abd",
            fontFamily: "'EB Garamond', Georgia, serif",
            letterSpacing: "0.15em", textTransform: "uppercase",
            position: "relative", overflow: "hidden", display: "inline-block",
          }} className="live-sweep">
            Live Data
          </span>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
        {/* Dashboard tab */}
        {activeTab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <Dashboard
              totalIncome={summary.annualIncome}
              holdings={holdings}
              liveData={liveData}
              portfolioValue={summary.portfolioValue}
              weightedYield={summary.weightedYield}
              weightedGrowth={summary.weightedGrowth}
            />
            <HoldingsTable
              holdings={holdings}
              search={searchQuery}
              setSearch={setSearchQuery}
              onAdd={() => setShowAddModal(true)}
              onSelect={selectStock}
              liveData={liveData}
              loading={loadingStates}
              onRemove={removeStock}
              onEdit={editShares}
            />
          </div>
        )}

        {/* Market tab */}
        {activeTab === "market" && (
          <MarketBrowser
            onSelect={selectStock}
            liveData={liveData}
            onAdd={stock => {
              setAddTicker(stock.ticker);
              setShowAddModal(true);
            }}
            holdings={holdings}
          />
        )}
      </div>

      {/* Add Stock Modal */}
      {showAddModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "rgba(2,8,23,0.85)", display: "flex",
          alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowAddModal(false)}>
          <div style={{
            background: "#0a1628", border: "1px solid #1a3a5c",
            padding: "2rem", width: 360,
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              fontWeight: 600, letterSpacing: "0.12em", fontSize: "0.72rem",
              textTransform: "uppercase", color: "#7a9ab8", marginBottom: "1rem",
              fontFamily: "'EB Garamond', Georgia, serif",
            }}>
              Add Stock to Portfolio
            </div>

            {/* Ticker input */}
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                placeholder="Ticker symbol..."
                value={addTicker}
                onChange={e => setAddTicker(e.target.value.toUpperCase())}
                style={{
                  width: "100%", padding: "8px 12px",
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif",
                  outline: "none",
                }}
                autoFocus
              />
              {addResults.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0,
                  background: "#071020", border: "1px solid #1a3a5c",
                  maxHeight: 150, overflowY: "auto", zIndex: 10,
                }}>
                  {addResults.map(r => (
                    <div key={r.ticker} onClick={() => {
                      pickTicker(r.ticker);
                      setTimeout(() => sharesInputRef.current?.focus(), 50);
                    }}
                      style={{
                        padding: "6px 12px", cursor: "pointer",
                        borderBottom: "1px solid #0f2540",
                        display: "flex", justifyContent: "space-between",
                      }}>
                      <span style={{ color: "#ffffff", fontWeight: 700 }}>{r.ticker}</span>
                      <span style={{ color: "#2a4a6a", fontSize: "0.75rem" }}>{r.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Shares input */}
            <input
              ref={sharesInputRef}
              placeholder="Shares (default: 1)"
              value={addShares}
              onChange={e => setAddShares(e.target.value)}
              type="number"
              style={{
                width: "100%", padding: "8px 12px", marginBottom: 12,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif", outline: "none",
              }}
            />

            {/* Yield override */}
            <input
              placeholder="Yield % override (optional)"
              value={addYield}
              onChange={e => setAddYield(e.target.value)}
              type="number"
              step="0.1"
              style={{
                width: "100%", padding: "8px 12px", marginBottom: 16,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif", outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addStock} disabled={!addTicker || isAdding} style={{
                flex: 1, padding: "10px", cursor: "pointer",
                background: !addTicker || isAdding ? "#1a3a5c" : "#005EB8",
                color: "white", border: "none", fontSize: "0.9rem",
                fontWeight: 700, boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              }}>
                {isAdding ? "Adding..." : "Add to Portfolio"}
              </button>
              <button onClick={() => setShowAddModal(false)} style={{
                padding: "10px 16px", cursor: "pointer",
                background: "transparent", border: "1px solid #1a3a5c",
                color: "#5a8ab0", fontSize: "0.9rem",
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
      <div style={{
        width: 7, height: 7, background: "#005EB8",
        boxShadow: "0 0 8px #10b981",
      }} />
      <span style={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.02em", color: "#c8dff0" }}>
        Safe<span style={{ color: "#005EB8" }}>Yield</span>
      </span>
    </div>
  );
}
