import React, { useRef, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import usePortfolio from './hooks/usePortfolio';
import useIsMobile from './hooks/useIsMobile';
import Onboarding from './screens/Onboarding';
import Dashboard from './screens/Dashboard';
import StockDetail from './screens/StockDetail';
import MarketBrowser from './screens/MarketBrowser';
import WatchlistScreen from './screens/WatchlistScreen';
import HoldingsTable from './components/HoldingsTable';
import UserMenu from './components/UserMenu';
import ConfirmModal from './components/ConfirmModal';
import { ToastProvider, useToast } from './components/Toast';
import Tour, { shouldShowTour, resetTour } from './components/Tour';
import MethodologyDisclosure from './components/MethodologyDisclosure';
import LegalFooter from './components/LegalFooter';
import useTheme from './hooks/useTheme';
import { formatCurrency } from './utils/format';

function relativeTime(date) {
  if (!date) return '';
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function shortMoney(val) {
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${Math.round(val / 1e3)}k`;
  return `$${Math.round(val)}`;
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const toast = useToast();
  const { getToken } = useAuth();
  const {
    isOnboarding, isLoadingSaved, activeTab, setActiveTab,
    holdings, prePrices, pricesLoading, preloadStrategyPrices, detailView, setDetailView,
    liveData, loadingStates, searchQuery, setSearchQuery,
    showAddModal, setShowAddModal,
    addTicker, setAddTicker, addResults, addShares, setAddShares,
    addYield, setAddYield, isAdding,
    handleLoad, addStock, removeStock, editShares, selectStock,
    pickTicker,
    summary, resetPortfolio,
    vizType, updateVizType,
    dripEnabled, toggleDrip, cashBalance,
    watchlist, addWatch, removeWatch, isWatched,
    lastUpdatedAt,
    mergeLiveData,
    refreshAll, refreshing,
  } = usePortfolio(getToken);

  const sharesInputRef = useRef(null);
  const isMobile = useIsMobile();
  const { theme, toggleTheme } = useTheme();
  const [showConfirm, setShowConfirm] = useState(false);
  const [showTour, setShowTour] = useState(() => shouldShowTour());
  const [, setTick] = useState(0);

  // Re-render every 30s to keep relative time fresh
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Loading saved data
  if (isLoadingSaved) {
    return (
      <div style={{
        fontFamily: "Georgia, serif", background: "var(--bg)", minHeight: "100vh",
        color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 9, height: 9, background: "var(--primary)",
            boxShadow: "0 0 8px #10b981", margin: "0 auto 16px",
          }} />
          <div style={{ color: "var(--text-dim)", fontSize: "0.9rem" }}>Loading your portfolio...</div>
        </div>
      </div>
    );
  }

  // Onboarding screen
  if (isOnboarding) {
    return <Onboarding onLoad={handleLoad} prePrices={prePrices} preLoading={pricesLoading} preloadPrices={preloadStrategyPrices} setVizType={updateVizType} />;
  }

  // Stock detail view
  if (detailView) {
    return (
      <div style={{ fontFamily: "Georgia, serif", background: "var(--bg)", minHeight: "100vh", color: "var(--text-primary)" }}>
        <nav style={{
          background: "var(--bg-overlay-nav)", borderBottom: "1px solid var(--border)",
          padding: isMobile ? "0 0.75rem" : "0 1.5rem", display: "flex", alignItems: "center",
          justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
            <Logo />
            <button onClick={() => setDetailView(null)} style={{
              background: "none", border: "1px solid var(--border-accent)", color: "var(--text-link)",
              padding: isMobile ? "6px 12px" : "4px 12px", cursor: "pointer", fontSize: "0.75rem",
              fontFamily: "'EB Garamond', Georgia, serif",
            }}>
              ← Back
            </button>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* Watch button in detail nav */}
            <button
              onClick={() => {
                if (isWatched(detailView.ticker)) {
                  removeWatch(detailView.ticker);
                  toast(`${detailView.ticker} removed from watchlist`, 'info');
                } else {
                  addWatch(detailView.ticker, detailView.name || detailView.ticker);
                  toast(`${detailView.ticker} added to watchlist`, 'success');
                }
              }}
              style={{
                background: "none", border: "1px solid var(--border-accent)",
                color: isWatched(detailView.ticker) ? "var(--primary)" : "var(--text-link)",
                padding: "4px 10px", cursor: "pointer", fontSize: "0.7rem",
                fontFamily: "'EB Garamond', Georgia, serif",
              }}
            >
              {isWatched(detailView.ticker) ? "\u2605 Watching" : "\u2606 Watch"}
            </button>
            <span style={{ color: "var(--text-link)", fontSize: "0.82rem" }}>
              {formatCurrency(summary.portfolioValue)}
            </span>
          </div>
        </nav>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "1rem 0.75rem" : "2rem 1.5rem" }}>
          <StockDetail
            stock={detailView}
            live={liveData[detailView.ticker]}
            loading={loadingStates[detailView.ticker]}
            onBack={() => setDetailView(null)}
            isWatched={isWatched(detailView.ticker)}
            onToggleWatch={() => isWatched(detailView.ticker)
              ? removeWatch(detailView.ticker)
              : addWatch(detailView.ticker, detailView.name || detailView.ticker)
            }
            onMergeLiveData={mergeLiveData}
          />
        </div>
      </div>
    );
  }

  // Main app
  return (
    <div style={{ fontFamily: "Georgia, serif", background: "var(--bg)", minHeight: "100vh", color: "var(--text-primary)" }}>
      {/* Navigation */}
      <nav style={{
        background: "var(--bg-overlay-nav)", borderBottom: "1px solid var(--border)",
        padding: isMobile ? "0 0.75rem" : "0 1.5rem", display: "flex", alignItems: "center",
        justifyContent: "space-between", height: 56, position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? "0.3rem" : "1.5rem" }}>
          <Logo />
          {["dashboard", "market", "watchlist"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              role="tab"
              aria-selected={activeTab === tab}
              aria-label={`${tab.charAt(0).toUpperCase() + tab.slice(1)} tab`}
              {...(tab === "market" ? { "data-tour": "market-tab" } : tab === "watchlist" ? { "data-tour": "watchlist-tab" } : {})}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: activeTab === tab ? "var(--primary)" : "var(--text-dim)",
                fontSize: isMobile ? "0.75rem" : "0.85rem", fontFamily: "'EB Garamond', Georgia, serif",
                fontWeight: activeTab === tab ? 700 : 400,
                transition: "color 0.2s",
              }}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          <button onClick={() => setShowConfirm(true)} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-dim)", fontSize: "0.75rem",
            fontFamily: "'EB Garamond', Georgia, serif",
          }} aria-label="Reset portfolio">
            Reset
          </button>
        </div>

        <div style={{ display: "flex", gap: isMobile ? 8 : 16, alignItems: "center" }}>
          <button onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} style={{
            background: "none", border: "1px solid var(--border-accent)", cursor: "pointer",
            color: "var(--text-link)", padding: "3px 8px", fontSize: "0.8rem",
          }}>
            {theme === 'dark' ? '\u2600' : '\u263E'}
          </button>
          <span style={{ color: "var(--text-link)", fontSize: "0.82rem" }}>
            {isMobile ? shortMoney(summary.portfolioValue) : formatCurrency(summary.portfolioValue)}
          </span>
          {!isMobile && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
              <span style={{
                fontSize: "0.6rem", color: "var(--primary)",
                fontFamily: "'EB Garamond', Georgia, serif",
                letterSpacing: "0.15em", textTransform: "uppercase",
                position: "relative", overflow: "hidden", display: "inline-block",
              }} className="delayed-badge">
                15-Min Delayed
              </span>
              {lastUpdatedAt && (
                <span style={{ fontSize: "0.55rem", color: "var(--text-sub)", fontFamily: "system-ui" }}>
                  {relativeTime(lastUpdatedAt)}
                </span>
              )}
            </div>
          )}
          <UserMenu getToken={getToken} dripEnabled={dripEnabled} toggleDrip={toggleDrip} onShowTour={() => { resetTour(); setShowTour(true); }} />
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: isMobile ? "0.75rem" : "1.5rem" }}>
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
              cashBalance={cashBalance}
              vizType={vizType}
              setVizType={updateVizType}
            />
            <div data-tour="holdings">
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
              dripEnabled={dripEnabled}
              toggleDrip={toggleDrip}
              onRefresh={refreshAll}
              lastUpdatedAt={lastUpdatedAt}
              refreshing={refreshing}
            />
            </div>
            <MethodologyDisclosure />
            <LegalFooter />
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
            onWatch={addWatch}
            onUnwatch={removeWatch}
            isWatched={isWatched}
          />
        )}

        {/* Watchlist tab */}
        {activeTab === "watchlist" && (
          <WatchlistScreen
            watchlist={watchlist}
            liveData={liveData}
            onSelect={selectStock}
            onRemove={removeWatch}
            onAdd={stock => {
              setAddTicker(stock.ticker);
              setShowAddModal(true);
            }}
            onWatch={addWatch}
            isWatched={isWatched}
          />
        )}
      </div>

      {/* Add Stock Modal */}
      {showAddModal && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 200,
          background: "var(--bg-overlay)", display: "flex",
          alignItems: "center", justifyContent: "center",
        }} onClick={() => setShowAddModal(false)}>
          <div style={{
            background: "var(--bg-card)", border: "1px solid var(--border-accent)",
            padding: isMobile ? "1.5rem" : "2rem",
            width: isMobile ? "calc(100vw - 2rem)" : 360,
            maxWidth: 360,
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              fontWeight: 600, letterSpacing: "0.12em", fontSize: "0.72rem",
              textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "1rem",
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
                aria-label="Ticker symbol"
                style={{
                  width: "100%", padding: "8px 12px",
                  background: "var(--bg-input-fill)", border: "1px solid var(--bg-input-border)",
                  color: "var(--text-primary)", fontFamily: "'EB Garamond', Georgia, serif",
                                 }}
                autoFocus
              />
              {addResults.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0,
                  background: "var(--bg-input)", border: "1px solid var(--border-accent)",
                  maxHeight: 150, overflowY: "auto", zIndex: 10,
                }}>
                  {addResults.map(r => (
                    <div key={r.ticker} onClick={() => {
                      pickTicker(r.ticker);
                      setTimeout(() => sharesInputRef.current?.focus(), 50);
                    }}
                      style={{
                        padding: "6px 12px", cursor: "pointer",
                        borderBottom: "1px solid var(--border-row)",
                        display: "flex", justifyContent: "space-between",
                      }}>
                      <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{r.ticker}</span>
                      <span style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>{r.name}</span>
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
              aria-label="Number of shares"
              style={{
                width: "100%", padding: "8px 12px", marginBottom: 12,
                background: "var(--bg-input-fill)", border: "1px solid var(--bg-input-border)",
                color: "var(--text-primary)", fontFamily: "'EB Garamond', Georgia, serif",              }}
            />

            {/* Yield override */}
            <input
              placeholder="Yield % override (optional)"
              value={addYield}
              onChange={e => setAddYield(e.target.value)}
              type="number"
              aria-label="Yield override percentage"
              step="0.1"
              style={{
                width: "100%", padding: "8px 12px", marginBottom: 16,
                background: "var(--bg-input-fill)", border: "1px solid var(--bg-input-border)",
                color: "var(--text-primary)", fontFamily: "'EB Garamond', Georgia, serif",              }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { const t = addTicker; addStock().then(() => toast(`${t} added to portfolio`, 'success')); }} disabled={!addTicker || isAdding} style={{
                flex: 1, padding: "10px", cursor: "pointer",
                background: !addTicker || isAdding ? "var(--border-accent)" : "var(--primary)",
                color: "white", border: "none", fontSize: "0.9rem",
                fontWeight: 700, boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              }}>
                {isAdding ? "Adding..." : "Add to Portfolio"}
              </button>
              <button onClick={() => setShowAddModal(false)} style={{
                padding: "10px 16px", cursor: "pointer",
                background: "transparent", border: "1px solid var(--border-accent)",
                color: "var(--text-link)", fontSize: "0.9rem",
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal (Reset) */}
      {showConfirm && (
        <ConfirmModal
          message="Reset portfolio and return to strategy selection?"
          onConfirm={() => {
            setShowConfirm(false);
            resetPortfolio();
            toast('Portfolio reset', 'info');
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {/* First-time user tour */}
      {showTour && (
        <Tour onComplete={() => setShowTour(false)} />
      )}
    </div>
  );
}

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
      <div style={{
        width: 7, height: 7, background: "var(--primary)",
        boxShadow: "0 0 8px #10b981",
      }} />
      <span style={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.02em", color: "var(--text-primary)" }}>
        Safe<span style={{ color: "var(--primary)" }}>Yield</span>
      </span>
    </div>
  );
}
