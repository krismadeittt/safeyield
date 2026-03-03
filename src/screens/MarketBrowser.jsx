import React, { useState, useEffect, useMemo } from 'react';
import { STOCK_UNIVERSE } from '../data/stocks';
import { fetchBatchPrices } from '../api/quotes';
import { fetchBatchFundamentals } from '../api/fundamentals';
import { searchTickers } from '../api/search';
import MiniProgressBar from '../components/MiniProgressBar';
import { formatCurrency } from '../utils/format';
import useIsMobile from '../hooks/useIsMobile';

const SECTORS = [
  "All", "Technology", "Healthcare", "Financials", "Consumer Staples",
  "Consumer Disc.", "Industrials", "Energy", "Utilities", "REITs",
  "Basic Materials", "Telecom", "Communication",
];

const PAGE_SIZE = 50;

export default function MarketBrowser({ onSelect, liveData, onAdd, holdings }) {
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
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [search, sector, sortKey, sortDir]);

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
    <div style={{ background: "#071525", border: "1px solid #0a1e30", padding: isMobile ? "0.8rem" : "1.2rem" }}>
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
              background: "#071020", border: "1px solid #0a1e30", color: "#c8dff0",
              fontFamily: "'EB Garamond', Georgia, serif",
            }}
          />
          {/* Typeahead dropdown */}
          {search && searchResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
              background: "#0a1628", border: "1px solid #0a1e30", maxHeight: 200, overflowY: "auto",
            }}>
              {searchResults.map(r => (
                <div key={r.ticker} onClick={() => {
                  const stock = STOCK_UNIVERSE.find(s => s.ticker === r.ticker) || r;
                  onSelect(stock);
                  setSearch("");
                }} style={{
                  padding: "8px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between",
                  borderBottom: "1px solid #071525",
                }}>
                  <span style={{ color: "#5aaff8", fontWeight: 600 }}>{r.ticker}</span>
                  <span style={{ color: "#7a9ab8", fontSize: "0.8rem" }}>{r.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <select
          value={sector}
          onChange={e => { setSector(e.target.value); setPage(0); }}
          style={{
            padding: "8px 12px", background: "#071020", border: "1px solid #0a1e30",
            color: "#c8dff0", fontFamily: "'EB Garamond', Georgia, serif",
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
                padding: "6px 10px", background: "#071020", border: "1px solid #0a1e30",
                color: "#c8dff0", fontSize: "0.75rem", fontFamily: "'EB Garamond', Georgia, serif",
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
                    padding: "0.8rem", borderBottom: "1px solid #0f2540",
                    cursor: "pointer",
                  }}
                >
                  {/* Ticker + Add button */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div>
                      <span style={{ fontWeight: 700, color: "#5aaff8", fontSize: "0.95rem" }}>{stock.ticker}</span>
                      <span style={{ color: "#7a9ab8", fontSize: "0.7rem", marginLeft: 8 }}>${stock.cap}B</span>
                    </div>
                    {inPortfolio ? (
                      <span style={{ color: "#00cc66", fontSize: "0.7rem" }}>In Portfolio</span>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); onAdd(stock); }} style={{
                        background: "none", border: "1px solid #0a1e30", color: "#5aaff8",
                        padding: "6px 14px", cursor: "pointer", fontSize: "0.75rem",
                        minHeight: 44,
                      }}>
                        + Add
                      </button>
                    )}
                  </div>
                  {/* Company name */}
                  <div style={{ fontSize: "0.7rem", color: "#7a9ab8", marginBottom: 8 }}>{stock.name}</div>
                  {/* Metrics row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.45rem", color: "#1a4060", textTransform: "uppercase", letterSpacing: "0.1em" }}>Yield</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#005EB8" }}>{stock.yld > 0 ? `${stock.yld.toFixed(2)}%` : "—"}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.45rem", color: "#1a4060", textTransform: "uppercase", letterSpacing: "0.1em" }}>Growth</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: stock.g5 > 0 ? "#00cc66" : "#7a9ab8" }}>{stock.g5 > 0 ? `${stock.g5}%` : "—"}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.45rem", color: "#1a4060", textTransform: "uppercase", letterSpacing: "0.1em" }}>Streak</div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#c8dff0" }}>{stock.streak > 0 ? `${stock.streak}yr` : "—"}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "0.45rem", color: "#1a4060", textTransform: "uppercase", letterSpacing: "0.1em" }}>Sector</div>
                      <div style={{ fontSize: "0.7rem", color: "#7a9ab8" }}>{stock.sector}</div>
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
                  const inPortfolio = holdingTickers.has(stock.ticker);
                  return (
                    <tr key={stock.ticker}
                      onClick={() => onSelect(stock)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <span style={{ fontWeight: 600, color: "#5aaff8" }}>{stock.ticker}</span>
                        <div style={{ fontSize: "0.7rem", color: "#7a9ab8" }}>{stock.name}</div>
                      </td>
                      <td>${stock.cap}B</td>
                      <td>
                        {stock.yld > 0 ? `${stock.yld.toFixed(2)}%` : "—"}
                        {stock.yld > 0 && <MiniProgressBar value={stock.yld} max={8} />}
                      </td>
                      <td>{stock.div > 0 ? `$${stock.div.toFixed(2)}` : "—"}</td>
                      <td style={{ color: stock.g5 > 0 ? "#00cc66" : "#7a9ab8" }}>
                        {stock.g5 > 0 ? `${stock.g5}%` : "—"}
                      </td>
                      <td>{stock.streak > 0 ? `${stock.streak}yr` : "—"}</td>
                      <td style={{ fontSize: "0.75rem", color: "#7a9ab8" }}>{stock.sector}</td>
                      <td>
                        {inPortfolio ? (
                          <span style={{ color: "#00cc66", fontSize: "0.7rem" }}>In Portfolio</span>
                        ) : (
                          <button onClick={e => { e.stopPropagation(); onAdd(stock); }} style={{
                            background: "none", border: "1px solid #0a1e30", color: "#5aaff8",
                            padding: "3px 10px", cursor: "pointer", fontSize: "0.7rem",
                          }}>
                            + Add
                          </button>
                        )}
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
            padding: isMobile ? "8px 16px" : "4px 12px", background: "transparent", border: "1px solid #0a1e30",
            color: page === 0 ? "#0a1e30" : "#5aaff8", cursor: page === 0 ? "default" : "pointer",
            minHeight: isMobile ? 44 : "auto",
          }}>
            Prev
          </button>
          <span style={{ padding: "4px 12px", color: "#7a9ab8", fontSize: "0.8rem", display: "flex", alignItems: "center" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} style={{
            padding: isMobile ? "8px 16px" : "4px 12px", background: "transparent", border: "1px solid #0a1e30",
            color: page >= totalPages - 1 ? "#0a1e30" : "#5aaff8", cursor: page >= totalPages - 1 ? "default" : "pointer",
            minHeight: isMobile ? 44 : "auto",
          }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
