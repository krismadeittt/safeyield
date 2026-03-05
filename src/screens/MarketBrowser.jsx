import React, { useState, useEffect, useMemo } from 'react';
import { STOCK_UNIVERSE } from '../data/stocks';
import { fetchBatchPrices } from '../api/quotes';
import { fetchBatchFundamentals } from '../api/fundamentals';
import { searchTickers } from '../api/search';
import MiniProgressBar from '../components/MiniProgressBar';
import { formatCurrency } from '../utils/format';
import { extractTickerMetrics } from '../utils/tickerData';
import useIsMobile from '../hooks/useIsMobile';

function fmtCap(b) {
  if (b == null) return '—';
  if (b >= 1000) return `$${(b / 1000).toFixed(1)}T`;
  if (b >= 1) return `$${Math.round(b)}B`;
  return `$${Math.round(b * 1000)}M`;
}

const SECTORS = [
  "All", "Technology", "Healthcare", "Financials", "Consumer Staples",
  "Consumer Disc.", "Industrials", "Energy", "Utilities", "REITs",
  "Basic Materials", "Telecom", "Communication",
];

const PAGE_SIZE = 50;

export default function MarketBrowser({ onSelect, liveData, onAdd, holdings, onWatch, onUnwatch, isWatched }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("All");
  const [sortKey, setSortKey] = useState("cap");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const [prices, setPrices] = useState({});
  const [searchResults, setSearchResults] = useState([]);

  // Search with debounced API typeahead
  useEffect(() => {
    if (search.length < 1) { setSearchResults([]); return; }
    const local = STOCK_UNIVERSE
      .filter(s => s.ticker.includes(search.toUpperCase()) || s.name.toUpperCase().includes(search.toUpperCase()))
      .slice(0, 5);
    setSearchResults(local);

    const timer = setTimeout(async () => {
      try {
        const results = await searchTickers(search);
        if (results.length > 0) setSearchResults(results);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Filter & sort
  const filtered = useMemo(() => {
    let list = STOCK_UNIVERSE.filter(s => {
      const matchSearch = !search || s.ticker.includes(search.toUpperCase()) || s.name.toLowerCase().includes(search.toLowerCase());
      const matchSector = sector === "All" || s.sector === sector;
      return matchSearch && matchSector;
    });
    list.sort((a, b) => {
      const getVal = (s) => {
        const em = extractTickerMetrics(liveData?.[s.ticker], s);
        if (sortKey === "yld") return em.divYield;
        if (sortKey === "div") return em.annualDiv;
        if (sortKey === "g5") return em.g5;
        if (sortKey === "streak") return em.streak;
        return s[sortKey] ?? 0;
      };
      const av = getVal(a);
      const bv = getVal(b);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [search, sector, sortKey, sortDir, liveData]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Load prices for visible page
  useEffect(() => {
    const tickers = pageItems.map(s => s.ticker).filter(t => !prices[t] && !liveData?.[t]);
    if (!tickers.length) return;
    fetchBatchPrices(tickers).then(data => {
      setPrices(prev => ({ ...prev, ...data }));
    }).catch(() => {});
  }, [page, filtered.length]);

  const holdingTickers = new Set((holdings || []).map(h => h.ticker));

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  const columns = [
    { key: "ticker", label: "Symbol" },
    { key: "cap", label: "Mkt Cap" },
    { key: "yld", label: "Yield" },
    { key: "div", label: "Annual Div" },
    { key: "g5", label: "5Y Growth" },
    { key: "streak", label: "Streak" },
    { key: "sector", label: "Sector" },
  ];

  return (
    <div style={{ background: "var(--bg-input)", border: "1px solid var(--border-dim)", padding: isMobile ? "0.8rem" : "1.2rem" }}>
      {/* Search & filter bar */}
      <div style={{
        display: "flex", flexDirection: isMobile ? "column" : "row",
        flexWrap: "wrap", gap: 8, marginBottom: "1rem", alignItems: isMobile ? "stretch" : "center",
      }}>
        <div style={{ position: "relative", flex: 1, minWidth: isMobile ? "auto" : 200 }}>
          <input
            placeholder="Search ticker or company..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            style={{
              width: "100%", padding: "8px 12px", fontSize: "0.85rem",
              background: "var(--bg-input)", border: "1px solid var(--border-dim)", color: "var(--text-primary)",
              fontFamily: "'DM Sans', system-ui, sans-serif",
            }}
          />
          {/* Typeahead dropdown */}
          {search && searchResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
              background: "var(--bg-card)", border: "1px solid var(--border-dim)", maxHeight: 200, overflowY: "auto",
            }}>
              {searchResults.map(r => (
                <div key={r.ticker} onClick={() => {
                  const stock = STOCK_UNIVERSE.find(s => s.ticker === r.ticker) || r;
                  onSelect(stock);
                  setSearch("");
                }} style={{
                  padding: "8px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between",
                  borderBottom: "1px solid var(--bg-input)",
                }}>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>{r.ticker}</span>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{r.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <select
          value={sector}
          onChange={e => { setSector(e.target.value); setPage(0); }}
          style={{
            padding: "8px 12px", background: "var(--bg-input)", border: "1px solid var(--border-dim)",
            color: "var(--text-primary)", fontFamily: "'DM Sans', system-ui, sans-serif",
            width: isMobile ? "100%" : "auto",
          }}
        >
          {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {isMobile ? (
        <>
          {/* Mobile: sort dropdown */}
          <div style={{ marginBottom: "0.8rem" }}>
            <select
              value={sortKey}
              onChange={e => handleSort(e.target.value)}
              style={{
                padding: "6px 10px", background: "var(--bg-input)", border: "1px solid var(--border-dim)",
                color: "var(--text-primary)", fontSize: "0.75rem", fontFamily: "'DM Sans', system-ui, sans-serif",
                width: "100%",
              }}
            >
              {columns.map(c => (
                <option key={c.key} value={c.key}>
                  Sort: {c.label} {sortKey === c.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </option>
              ))}
            </select>
          </div>
          {/* Mobile card layout */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {pageItems.map(stock => {
              const inPortfolio = holdingTickers.has(stock.ticker);
              return (
                <div key={stock.ticker}
                  onClick={() => onSelect(stock)}
                  style={{
                    padding: "0.8rem", borderBottom: "1px solid var(--border-row)",
                    cursor: "pointer",
                  }}
                >
                  {/* Ticker + Add button */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div>
                      <span style={{ fontWeight: 700, color: "var(--accent)", fontSize: "0.95rem" }}>{stock.ticker}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.7rem", marginLeft: 8 }}>{fmtCap(stock.cap)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {inPortfolio ? (
                        <span style={{ color: "var(--green)", fontSize: "0.7rem" }}>In Portfolio</span>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); onAdd(stock); }} style={{
                          background: "none", border: "1px solid var(--border-dim)", color: "var(--accent)",
                          padding: "6px 14px", cursor: "pointer", fontSize: "0.75rem",
                          minHeight: 44,
                        }}>
                          + Add
                        </button>
                      )}
                      {isWatched && (
                        <button onClick={e => {
                          e.stopPropagation();
                          isWatched(stock.ticker) ? onUnwatch?.(stock.ticker) : onWatch?.(stock.ticker, stock.name);
                        }} style={{
                          background: "none", border: "1px solid var(--border-dim)",
                          color: isWatched(stock.ticker) ? "var(--primary)" : "var(--text-link)",
                          padding: "6px 10px", cursor: "pointer", fontSize: "0.7rem",
                          minHeight: 44,
                        }}>
                          {isWatched(stock.ticker) ? "\u2605 Watching" : "\u2606 Watch"}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Company name */}
                  <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: 8 }}>{stock.name}</div>
                  {/* Metrics row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                    {(() => {
                      const em = extractTickerMetrics(liveData?.[stock.ticker], stock);
                      return (<>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Yield</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)" }}>{em.divYield > 0 ? `${em.divYield.toFixed(2)}%` : "—"}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Growth</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: em.g5 > 0 ? "var(--green)" : "var(--text-muted)" }}>{em.g5 > 0 ? `${em.g5}%` : "—"}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Streak</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>{em.streak > 0 ? `${em.streak}yr` : "—"}</div>
                    </div>
                      </>);
                    })()}
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.45rem", color: "var(--text-label)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Sector</div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{stock.sector}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          {/* Desktop Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {columns.map(c => (
                    <th key={c.key} onClick={() => handleSort(c.key)} style={{ cursor: "pointer" }}>
                      {c.label} {sortKey === c.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(stock => {
                  const p = prices[stock.ticker] || liveData?.[stock.ticker];
                  const em = extractTickerMetrics(liveData?.[stock.ticker], stock);
                  const inPortfolio = holdingTickers.has(stock.ticker);
                  return (
                    <tr key={stock.ticker}
                      onClick={() => onSelect(stock)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--accent)" }}>{stock.ticker}</span>
                        <div style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{stock.name}</div>
                      </td>
                      <td>{fmtCap(stock.cap)}</td>
                      <td>
                        {em.divYield > 0 ? `${em.divYield.toFixed(2)}%` : "—"}
                        {em.divYield > 0 && <MiniProgressBar value={em.divYield} max={8} />}
                      </td>
                      <td>{em.annualDiv > 0 ? `$${em.annualDiv.toFixed(2)}` : "—"}</td>
                      <td style={{ color: em.g5 > 0 ? "var(--green)" : "var(--text-muted)" }}>
                        {em.g5 > 0 ? `${em.g5}%` : "—"}
                      </td>
                      <td>{em.streak > 0 ? `${em.streak}yr` : "—"}</td>
                      <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{stock.sector}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {inPortfolio ? (
                            <span style={{ color: "var(--green)", fontSize: "0.7rem" }}>In Portfolio</span>
                          ) : (
                            <button onClick={e => { e.stopPropagation(); onAdd(stock); }} style={{
                              background: "none", border: "1px solid var(--border-dim)", color: "var(--accent)",
                              padding: "3px 10px", cursor: "pointer", fontSize: "0.7rem",
                            }}>
                              + Add
                            </button>
                          )}
                          {isWatched && (
                            <button onClick={e => {
                              e.stopPropagation();
                              isWatched(stock.ticker) ? onUnwatch?.(stock.ticker) : onWatch?.(stock.ticker, stock.name);
                            }} style={{
                              background: "none", border: "1px solid var(--border-dim)",
                              color: isWatched(stock.ticker) ? "var(--primary)" : "var(--text-link)",
                              padding: "3px 8px", cursor: "pointer", fontSize: "0.65rem",
                            }}>
                              {isWatched(stock.ticker) ? "\u2605 Watching" : "\u2606 Watch"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex", justifyContent: "center", gap: 4, marginTop: "1rem",
        }}>
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0} style={{
            padding: isMobile ? "8px 16px" : "4px 12px", background: "transparent", border: "1px solid var(--border-dim)",
            color: page === 0 ? "var(--border-dim)" : "var(--accent)", cursor: page === 0 ? "default" : "pointer",
            minHeight: isMobile ? 44 : "auto",
          }}>
            Prev
          </button>
          <span style={{ padding: "4px 12px", color: "var(--text-muted)", fontSize: "0.8rem", display: "flex", alignItems: "center" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{
            padding: isMobile ? "8px 16px" : "4px 12px", background: "transparent", border: "1px solid var(--border-dim)",
            color: page >= totalPages - 1 ? "var(--border-dim)" : "var(--accent)", cursor: page >= totalPages - 1 ? "default" : "pointer",
            minHeight: isMobile ? 44 : "auto",
          }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
