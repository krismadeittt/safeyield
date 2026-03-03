import React from 'react';
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
    summary,
  } = usePortfolio();

  // Onboarding screen
  if (isOnboarding) {
    return <Onboarding onLoad={handleLoad} prePrices={prePrices} preLoading={pricesLoading} />;
  }

  // Stock detail view
  if (detailView) {
    return (
      <div>
        <nav style={{
          position: "sticky", top: 0, zIndex: 100,
          background: "#020817", borderBottom: "1px solid #0a1e30",
          padding: "0.6rem 1.5rem", display: "flex", alignItems: "center", gap: 16,
        }}>
          <span style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700, fontStyle: "italic", color: "#005EB8", fontSize: "1.1rem",
          }}>
            S
          </span>
          <span style={{ color: "#7a9ab8", fontSize: "0.8rem" }}>
            {formatCurrency(summary.portfolioValue)}
          </span>
        </nav>
        <StockDetail
          stock={detailView}
          live={liveData[detailView.ticker]}
          loading={loadingStates[detailView.ticker]}
          onBack={() => setDetailView(null)}
        />
      </div>
    );
  }

  // Main app
  return (
    <div>
      {/* Navigation */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "#020817", borderBottom: "1px solid #0a1e30",
        padding: "0.6rem 1.5rem", display: "flex", alignItems: "center", gap: 20,
      }}>
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontWeight: 700, fontStyle: "italic", color: "#005EB8", fontSize: "1.1rem",
          marginRight: 8,
        }}>
          SafeYield
        </span>

        {["dashboard", "market"].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: activeTab === tab ? "#c8dff0" : "#2a4a6a",
            fontSize: "0.85rem", fontFamily: "'EB Garamond', Georgia, serif",
            borderBottom: activeTab === tab ? "2px solid #005EB8" : "2px solid transparent",
            paddingBottom: 4,
          }}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ color: "#7a9ab8", fontSize: "0.8rem" }}>
            {formatCurrency(summary.portfolioValue)}
          </span>
          <div style={{
            position: "relative", overflow: "hidden",
            padding: "2px 10px", fontSize: "0.6rem", color: "#5aaff8",
            border: "1px solid rgba(90,175,248,0.3)",
          }} className="live-sweep">
            Live Data
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem" }}>
        {/* Dashboard tab */}
        {activeTab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.2rem" }}>
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
            background: "#0a1628", border: "1px solid #0a1e30",
            padding: "2rem", width: 360,
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              fontSize: "0.6rem", color: "#1a4060", letterSpacing: "0.2em",
              textTransform: "uppercase", marginBottom: "1rem",
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
                  background: "#071020", border: "1px solid #1e293b",
                  color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif",
                }}
                autoFocus
              />
              {addResults.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0,
                  background: "#071020", border: "1px solid #0a1e30",
                  maxHeight: 150, overflowY: "auto", zIndex: 10,
                }}>
                  {addResults.map(r => (
                    <div key={r.ticker} onClick={() => { setAddTicker(r.ticker); setAddResults([]); }}
                      style={{
                        padding: "6px 12px", cursor: "pointer",
                        borderBottom: "1px solid #071525",
                        display: "flex", justifyContent: "space-between",
                      }}>
                      <span style={{ color: "#5aaff8" }}>{r.ticker}</span>
                      <span style={{ color: "#7a9ab8", fontSize: "0.75rem" }}>{r.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Shares input */}
            <input
              placeholder="Shares (default: 1)"
              value={addShares}
              onChange={e => setAddShares(e.target.value)}
              type="number"
              style={{
                width: "100%", padding: "8px 12px", marginBottom: 12,
                background: "#071020", border: "1px solid #1e293b",
                color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif",
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
                background: "#071020", border: "1px solid #1e293b",
                color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif",
              }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={addStock} disabled={!addTicker || isAdding} style={{
                flex: 1, padding: "10px", cursor: "pointer",
                background: !addTicker || isAdding ? "#1a3a5c" : "#005EB8",
                color: "#c8dff0", border: "none", fontSize: "0.9rem",
              }}>
                {isAdding ? "Adding..." : "Add to Portfolio"}
              </button>
              <button onClick={() => setShowAddModal(false)} style={{
                padding: "10px 16px", cursor: "pointer",
                background: "transparent", border: "1px solid #0a1e30",
                color: "#7a9ab8", fontSize: "0.9rem",
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
