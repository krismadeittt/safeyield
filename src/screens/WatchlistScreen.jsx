import React, { useState, useEffect } from 'react';
import { fetchBatchUpdate } from '../api/quotes';
import { searchTickers } from '../api/search';
import MiniProgressBar from '../components/MiniProgressBar';
import useIsMobile from '../hooks/useIsMobile';

export default function WatchlistScreen({ watchlist, liveData, onSelect, onRemove, onAdd, onWatch, isWatched }) {
  const isMobile = useIsMobile();
  const [prices, setPrices] = useState({});
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // Fetch prices for watchlist items
  useEffect(() => {
    const tickers = watchlist.map(w => w.ticker).filter(t => !liveData?.[t] && !prices[t]);
    if (!tickers.length) return;
    fetchBatchUpdate(tickers).then(data => {
      setPrices(prev => ({ ...prev, ...data }));
    }).catch(() => {});
  }, [watchlist, liveData]);

  // Search typeahead
  useEffect(() => {
    if (search.length < 1) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await searchTickers(search);
        setSearchResults(results);
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  function getPrice(ticker) {
    return liveData?.[ticker] || prices[ticker] || null;
  }

  return (
    <div style={{ background: '#071525', border: '1px solid #0a1e30', padding: isMobile ? '0.8rem' : '1.2rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        gap: 8, marginBottom: '1rem', alignItems: isMobile ? 'stretch' : 'center',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? 'auto' : 200 }}>
          <input
            placeholder="Search to add to watchlist..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', fontSize: '0.85rem',
              background: '#071020', border: '1px solid #0a1e30', color: '#c8dff0',
              fontFamily: "'EB Garamond', Georgia, serif",
            }}
          />
          {search && searchResults.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: '#0a1628', border: '1px solid #0a1e30', maxHeight: 200, overflowY: 'auto',
            }}>
              {searchResults.map(r => (
                <div key={r.ticker} onClick={() => {
                  onWatch(r.ticker, r.name);
                  setSearch('');
                  setSearchResults([]);
                }} style={{
                  padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                  borderBottom: '1px solid #071525',
                }}>
                  <span style={{ color: '#5aaff8', fontWeight: 600 }}>{r.ticker}</span>
                  <span style={{ color: '#7a9ab8', fontSize: '0.8rem' }}>{r.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <span style={{
          fontWeight: 600, letterSpacing: '0.12em', fontSize: '0.72rem',
          textTransform: 'uppercase', color: '#7a9ab8',
          fontFamily: "'EB Garamond', Georgia, serif",
          whiteSpace: 'nowrap',
        }}>
          Watchlist ({watchlist.length})
        </span>
      </div>

      {watchlist.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#2a4a6a' }}>
          <div style={{ fontSize: '0.9rem', marginBottom: 8 }}>Your watchlist is empty</div>
          <div style={{ fontSize: '0.75rem' }}>Search above or use the "Watch" button on any stock to add it here.</div>
        </div>
      ) : isMobile ? (
        /* Mobile card layout */
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {watchlist.map(item => {
            const p = getPrice(item.ticker);
            return (
              <div key={item.ticker}
                onClick={() => onSelect?.({ ticker: item.ticker, name: item.name })}
                style={{ padding: '0.8rem', borderBottom: '1px solid #0f2540', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div>
                    <span style={{ fontWeight: 700, color: '#5aaff8', fontSize: '0.95rem' }}>{item.ticker}</span>
                    {p?.price > 0 && (
                      <span style={{ color: '#c8dff0', marginLeft: 8, fontSize: '0.85rem' }}>
                        ${p.price.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={e => { e.stopPropagation(); onAdd?.({ ticker: item.ticker, name: item.name }); }} style={{
                      background: 'none', border: '1px solid #0a1e30', color: '#5aaff8',
                      padding: '6px 12px', cursor: 'pointer', fontSize: '0.7rem', minHeight: 44,
                    }}>
                      + Add
                    </button>
                    <button onClick={e => { e.stopPropagation(); onRemove(item.ticker); }} style={{
                      background: 'none', border: '1px solid #1a3a5c', color: '#3a7abd',
                      padding: '6px 12px', cursor: 'pointer', fontSize: '0.7rem', minHeight: 44,
                    }}>
                      Remove
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#7a9ab8', marginBottom: 8 }}>{item.name || item.ticker}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  <MetricCell label="Change" value={p?.change != null ? `${p.change > 0 ? '+' : ''}${p.change.toFixed(2)}%` : '—'} color={p?.change > 0 ? '#00cc66' : '#c85a5a'} />
                  <MetricCell label="Yield" value={p?.divYield > 0 ? `${p.divYield.toFixed(2)}%` : '—'} color="#005EB8" />
                  <MetricCell label="Div" value={p?.annualDiv > 0 ? `$${p.annualDiv.toFixed(2)}` : '—'} />
                  <MetricCell label="Growth" value={p?.g5 != null ? `${p.g5}%` : '—'} color="#005EB8" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Desktop table */
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Symbol', 'Price', 'Change', 'Yield', 'Annual Div', '5Y Growth', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {watchlist.map(item => {
                const p = getPrice(item.ticker);
                return (
                  <tr key={item.ticker}
                    onClick={() => onSelect?.({ ticker: item.ticker, name: item.name })}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span style={{ fontWeight: 600, color: '#5aaff8' }}>{item.ticker}</span>
                      <div style={{ fontSize: '0.7rem', color: '#7a9ab8' }}>{item.name}</div>
                    </td>
                    <td style={{ color: '#c8dff0' }}>
                      {p?.price > 0 ? `$${p.price.toFixed(2)}` : '—'}
                    </td>
                    <td style={{ color: p?.change > 0 ? '#00cc66' : p?.change < 0 ? '#c85a5a' : '#7a9ab8' }}>
                      {p?.change != null ? `${p.change > 0 ? '+' : ''}${p.change.toFixed(2)}%` : '—'}
                    </td>
                    <td>
                      {p?.divYield > 0 ? `${p.divYield.toFixed(2)}%` : '—'}
                      {p?.divYield > 0 && <MiniProgressBar value={p.divYield} max={8} />}
                    </td>
                    <td>{p?.annualDiv > 0 ? `$${p.annualDiv.toFixed(2)}` : '—'}</td>
                    <td style={{ color: p?.g5 > 0 ? '#00cc66' : '#7a9ab8' }}>
                      {p?.g5 != null ? `${p.g5}%` : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={e => { e.stopPropagation(); onAdd?.({ ticker: item.ticker, name: item.name }); }} style={{
                          background: 'none', border: '1px solid #0a1e30', color: '#5aaff8',
                          padding: '3px 10px', cursor: 'pointer', fontSize: '0.7rem',
                        }}>
                          + Add
                        </button>
                        <button onClick={e => { e.stopPropagation(); onRemove(item.ticker); }} style={{
                          background: 'none', border: '1px solid #1a3a5c', color: '#3a7abd',
                          padding: '3px 10px', cursor: 'pointer', fontSize: '0.7rem',
                        }}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricCell({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '0.45rem', color: '#1a4060', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: color || '#c8dff0' }}>
        {value}
      </div>
    </div>
  );
}
