import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { fetchBatchUpdate, fetchEnrichedQuote, fetchPriceOnly } from '../api/quotes';
import { fetchBatchFundamentals } from '../api/fundamentals';
import { getCachedFundamentals } from '../api/cache';
import { searchTickers } from '../api/search';
import { REIT_TEMPLATE, VIG_TEMPLATE, HIGH_YIELD_TEMPLATE } from '../data/portfolioTemplates';
import { NOBL_HOLDINGS } from '../data/aristocrats';
import { getUserHoldings, saveUserHoldings, getUserProfile, updateUserProfile, getUserWatchlist, addToUserWatchlist, removeFromUserWatchlist, saveProcessedState } from '../api/user';
import { fetchBatchHistory } from '../api/history';
import { processCatchUp } from '../utils/catchUp';
import { calcMonthlyIncome } from '../utils/dividends';

const POLL_INTERVAL = 5 * 60000; // 5 minutes
const SAVE_DEBOUNCE = 2000; // 2 seconds

/** Check if US stock market is currently open (Mon-Fri 9:30am-4:00pm ET) */
function isMarketOpen() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false; // weekend
  const mins = et.getHours() * 60 + et.getMinutes();
  return mins >= 570 && mins < 960; // 9:30am = 570, 4:00pm = 960
}

/** Get tickers for a specific strategy */
function getStrategyTickers(strategyId) {
  switch (strategyId) {
    case 'nobl': return NOBL_HOLDINGS.map(s => s.ticker);
    case 'vig':  return VIG_TEMPLATE.map(s => s.ticker);
    case 'reit': return REIT_TEMPLATE.map(s => s.ticker);
    case 'voo':  return HIGH_YIELD_TEMPLATE.map(s => s.ticker);
    default:     return [];
  }
}

export default function usePortfolio(getToken) {
  const [isOnboarding, setIsOnboarding] = useState(true);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [holdings, setHoldings] = useState([]);
  const [prePrices, setPrePrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(true);
  const [isSample, setIsSample] = useState(false);
  const [strategy, setStrategy] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailView, setDetailView] = useState(null);
  const [liveData, setLiveData] = useState({});
  const [loadingStates, setLoadingStates] = useState({});
  const [targetBalance, setTargetBalance] = useState(0);
  const [cashBalance, setCashBalance] = useState(0);
  const [cashApy, setCashApy] = useState(0);
  const [cashCompounding, setCashCompounding] = useState('none');
  const [dripEnabled, setDripEnabled] = useState(true);

  // Visualizer type state
  const [vizType, setVizType] = useState('sunburst');

  // Watchlist state
  const [watchlist, setWatchlist] = useState([]);

  // Last updated timestamp
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Refresh all prices state
  const [refreshing, setRefreshing] = useState(false);

  // Add stock modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTicker, setAddTicker] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addShares, setAddShares] = useState("");
  const [addYield, setAddYield] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Ref for debounced save
  const holdingsRef = useRef(holdings);
  holdingsRef.current = holdings;
  const saveTimerRef = useRef(null);
  const hasLoadedRef = useRef(false);

  // Load saved holdings on mount
  useEffect(() => {
    if (!getToken) {
      setIsLoadingSaved(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [saved, wl, profile] = await Promise.all([
          getUserHoldings(getToken).catch(() => []),
          getUserWatchlist(getToken).catch(() => []),
          getUserProfile(getToken).catch(() => null),
        ]);
        if (cancelled) return;
        setWatchlist(wl || []);
        if (profile?.target_balance > 0) {
          setTargetBalance(profile.target_balance);
        }
        if (profile?.viz_type) {
          setVizType(profile.viz_type);
        }
        // Restore portfolio-level state from profile
        const profileCash = profile?.cash_balance || 0;
        const profileDrip = profile?.drip_enabled !== undefined ? !!profile.drip_enabled : true;
        const profileLastProcessed = profile?.last_processed_at || null;
        setCashBalance(profileCash);
        setCashApy(profile?.cash_apy || 0);
        setCashCompounding(profile?.cash_compounding || 'none');
        setDripEnabled(profileDrip);

        if (saved && saved.length > 0) {
          // Convert D1 format to app format
          let restored = saved.map(h => ({
            ticker: h.ticker,
            name: h.name || h.ticker,
            sector: h.sector || null,
            shares: h.shares || 0,
            price: h.cost_basis || 0,
            costBasis: h.cost_basis || 0,
            yld: h.yield_override || 0,
            div: 0,
            g5: 0,
            streak: 0,
            score: 50,
          }));

          // Catch-up processing: apply dividends/splits since last update
          const today = new Date().toISOString().substring(0, 10);
          let updatedCash = profileCash;
          if (profileLastProcessed && profileLastProcessed < today) {
            try {
              const tickers = restored.map(h => h.ticker);
              const historyMap = await fetchBatchHistory(tickers);
              if (!cancelled && historyMap && Object.keys(historyMap).length > 0) {
                const result = processCatchUp({
                  holdings: restored,
                  cashBalance: profileCash,
                  dripEnabled: profileDrip,
                  lastProcessedAt: profileLastProcessed,
                }, historyMap);
                restored = result.holdings;
                updatedCash = result.cashBalance;
                setCashBalance(updatedCash);
                // Save processed state back to D1
                const toSaveState = result.holdings.map(h => ({
                  ticker: h.ticker,
                  shares: h.shares,
                  cost_basis: h.price || 0,
                }));
                saveProcessedState(getToken, toSaveState, updatedCash, result.lastProcessedAt).catch(e =>
                  console.warn('Failed to save processed state:', e.message)
                );
                if (result.events.length > 0) {
                  console.log('Catch-up events:', result.events);
                }
              }
            } catch (e) {
              console.warn('Catch-up processing failed:', e.message);
            }
          } else if (!profileLastProcessed) {
            // First time — set lastProcessedAt to today (no retroactive processing)
            updateUserProfile(getToken, { lastProcessedAt: today }).catch(() => {});
          }
          if (cancelled) return;

          // Fetch live prices + fundamentals before showing dashboard
          const tickers = restored.map(h => h.ticker);
          const [priceData, fdMap] = await Promise.all([
            fetchBatchUpdate(tickers).catch(() => ({})),
            fetchBatchFundamentals(tickers).catch(() => ({})),
          ]);
          if (cancelled) return;

          // Merge live data into liveData state
          const merged = { ...priceData };
          if (fdMap) {
            for (const [ticker, fd] of Object.entries(fdMap)) {
              if (!fd || fd.error) continue;
              const rawPayout = fd.payout ?? null;
              const fcfPayout = fd.fcfPayout ?? null;
              const payout = (rawPayout != null && rawPayout <= 100) ? rawPayout
                : (fcfPayout != null) ? fcfPayout : rawPayout;
              merged[ticker] = {
                ...merged[ticker],
                divYield: fd.divYield ?? merged[ticker]?.divYield ?? null,
                annualDiv: fd.annualDiv ?? merged[ticker]?.annualDiv ?? null,
                payout,
                fcfPayout,
                g5: fd.g5 ?? merged[ticker]?.g5 ?? null,
                streak: fd.streak ?? merged[ticker]?.streak ?? null,
                beta: fd.beta ?? merged[ticker]?.beta ?? null,
              };
            }
          }
          setLiveData(merged);
          setLastUpdatedAt(new Date());

          // Update holdings with fetched data so h.div, h.price, h.g5 etc. are populated
          const hydrated = restored.map(h => {
            const live = merged[h.ticker];
            if (!live) return h;
            return {
              ...h,
              name: live.name || h.name,
              sector: live.sector || h.sector,
              price: live.price || h.price,
              costBasis: h.costBasis || h.price,
              yld: live.divYield ?? h.yld,
              div: live.annualDiv ?? h.div,
              g5: live.g5 ?? h.g5,
              streak: live.streak ?? h.streak,
              payout: live.payout ?? h.payout,
            };
          });

          setHoldings(hydrated);
          setIsOnboarding(false);
          hasLoadedRef.current = true;
        }
      } catch (e) {
        console.warn('Failed to load saved data:', e.message);
      } finally {
        if (!cancelled) setIsLoadingSaved(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  // Debounced save to D1 when holdings change
  const targetBalanceRef = useRef(targetBalance);
  targetBalanceRef.current = targetBalance;
  const liveDataRef = useRef(liveData);
  liveDataRef.current = liveData;
  useEffect(() => {
    if (!getToken || !hasLoadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const toSave = holdingsRef.current.map(h => ({
        ticker: h.ticker,
        name: h.name || '',
        sector: h.sector || '',
        shares: h.shares || 0,
        cost_basis: h.costBasis || h.price || 0,
        yield_override: h.yld || null,
      }));
      saveUserHoldings(getToken, toSave).catch(e =>
        console.warn('Auto-save failed:', e.message)
      );
      // Also sync targetBalance to profile (0 means user manually changed portfolio)
      updateUserProfile(getToken, { targetBalance: targetBalanceRef.current }).catch(() => {});
    }, SAVE_DEBOUNCE);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [holdings, getToken]);

  // Lazy pre-load: only fetch prices for the chosen strategy (not all templates)
  const preloadStrategyPrices = useCallback(async (strategyId) => {
    setPricesLoading(true);
    const tickers = getStrategyTickers(strategyId);
    if (!tickers.length) { setPricesLoading(false); return; }

    const chunks = [];
    for (let i = 0; i < tickers.length; i += 50) chunks.push(tickers.slice(i, i + 50));

    const merged = {};
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, 500));
      try {
        const data = await fetchBatchUpdate(chunks[i]);
        Object.assign(merged, data);
      } catch (err) {
        console.warn("Pre-price chunk failed:", err.message);
      }
    }
    setPrePrices(merged);
    setPricesLoading(false);
  }, []);

  // Track previous ticker set for incremental fundamentals fetching
  const prevTickersRef = useRef([]);

  // Refresh prices + fundamentals when holdings change
  useEffect(() => {
    if (!holdings.length) return;
    const tickers = holdings.map(h => h.ticker);
    // Only fetch prices for tickers not already in liveData
    const missing = tickers.filter(t => !liveData[t]);
    if (missing.length > 0) {
      fetchBatchUpdate(missing).then(data => { setLiveData(prev => ({ ...prev, ...data })); setLastUpdatedAt(new Date()); });
    }
    // Only fetch fundamentals for newly added tickers (not already fetched)
    const prevSet = new Set(prevTickersRef.current);
    const newTickers = tickers.filter(t => !prevSet.has(t) && !getCachedFundamentals(t));
    const tickersToFetch = newTickers.length > 0 ? newTickers : (prevTickersRef.current.length === 0 ? tickers : []);
    prevTickersRef.current = tickers;

    if (tickersToFetch.length === 0) return;

    fetchBatchFundamentals(tickersToFetch).then(fdMap => {
      if (!fdMap || !Object.keys(fdMap).length) return;
      setLiveData(prev => {
        const merged = { ...prev };
        for (const [ticker, fd] of Object.entries(fdMap)) {
          if (!fd || fd.error) continue;
          // Prefer FCF payout when GAAP payout is extreme (>100%)
          const rawPayout = fd.payout ?? merged[ticker]?.payout ?? null;
          const fcfPayout = fd.fcfPayout ?? merged[ticker]?.fcfPayout ?? null;
          const payout = (rawPayout != null && rawPayout <= 100) ? rawPayout
            : (fcfPayout != null) ? fcfPayout : rawPayout;
          merged[ticker] = {
            ...merged[ticker],
            divYield: fd.divYield ?? merged[ticker]?.divYield ?? null,
            annualDiv: fd.annualDiv ?? merged[ticker]?.annualDiv ?? null,
            payout,
            fcfPayout,
            g5: fd.g5 ?? merged[ticker]?.g5 ?? null,
            streak: fd.streak ?? merged[ticker]?.streak ?? null,
            beta: fd.beta ?? merged[ticker]?.beta ?? null,
          };
        }
        return merged;
      });
    });
  }, [holdings.length]);

  // Poll prices every 5 minutes (skip outside market hours)
  useEffect(() => {
    if (!holdings.length) return;
    const id = setInterval(() => {
      if (!isMarketOpen()) return; // prices can't change when market is closed
      const tickers = holdingsRef.current.map(h => h.ticker);
      fetchBatchUpdate(tickers)
        .then(data => { setLiveData(prev => ({ ...prev, ...data })); setLastUpdatedAt(new Date()); });
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [holdings.length > 0]);

  // Track when user picks a result so we don't re-search that exact ticker
  const pickedTickerRef = useRef("");

  // Typeahead search for add stock modal
  useEffect(() => {
    if (addTicker.length < 1) { setAddResults([]); return; }
    // Skip search if user just selected this ticker from dropdown
    if (addTicker === pickedTickerRef.current) return;
    const timer = setTimeout(async () => {
      try {
        const results = await searchTickers(addTicker);
        setAddResults(results);
      } catch {}
    }, 250);
    return () => clearTimeout(timer);
  }, [addTicker]);

  // Refresh all holdings — re-fetch prices + fundamentals for entire portfolio
  async function refreshAll() {
    if (refreshing || !holdings.length) return;
    setRefreshing(true);
    try {
      const tickers = holdings.map(h => h.ticker);
      const [priceData, fdMap] = await Promise.all([
        fetchBatchUpdate(tickers).catch(() => ({})),
        fetchBatchFundamentals(tickers).catch(() => ({})),
      ]);
      const merged = { ...liveData, ...priceData };
      if (fdMap) {
        for (const [ticker, fd] of Object.entries(fdMap)) {
          if (!fd || fd.error) continue;
          const rawPayout = fd.payout ?? null;
          const fcfPayout = fd.fcfPayout ?? null;
          const payout = (rawPayout != null && rawPayout <= 100) ? rawPayout
            : (fcfPayout != null) ? fcfPayout : rawPayout;
          merged[ticker] = {
            ...merged[ticker],
            divYield: fd.divYield ?? merged[ticker]?.divYield ?? null,
            annualDiv: fd.annualDiv ?? merged[ticker]?.annualDiv ?? null,
            payout,
            fcfPayout,
            g5: fd.g5 ?? merged[ticker]?.g5 ?? null,
            streak: fd.streak ?? merged[ticker]?.streak ?? null,
            beta: fd.beta ?? merged[ticker]?.beta ?? null,
          };
        }
      }
      setLiveData(merged);
      setLastUpdatedAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }

  // Refresh single stock — use price-only when fundamentals are already cached
  async function refreshStock(ticker) {
    setLoadingStates(prev => ({ ...prev, [ticker]: true }));
    try {
      const hasFundamentals = !!getCachedFundamentals(ticker);
      if (hasFundamentals) {
        // Price-only fetch — saves 1 EODHD call
        const priceData = await fetchPriceOnly(ticker);
        if (priceData) {
          setLiveData(prev => ({
            ...prev,
            [ticker]: { ...prev[ticker], price: priceData.price, change: priceData.change },
          }));
          setHoldings(prev => prev.map(h =>
            h.ticker === ticker ? { ...h, price: priceData.price || h.price } : h
          ));
        }
      } else {
        const data = await fetchEnrichedQuote(ticker);
        if (data) {
          setLiveData(prev => ({ ...prev, [ticker]: { ...prev[ticker], ...data } }));
          setHoldings(prev => prev.map(h => {
            if (h.ticker !== ticker) return h;
            return {
              ...h,
              name: data.name || h.name,
              sector: data.sector || h.sector,
              price: data.price || h.price,
              g5: data.g5 ?? h.g5,
              streak: data.streak ?? h.streak,
            };
          }));
        }
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, [ticker]: false }));
    }
  }

  // Handle onboarding complete
  function handleLoad(newHoldings, strategyId, balance, initialCash = 0) {
    setHoldings(newHoldings);
    setStrategy(strategyId);
    setIsOnboarding(false);
    setIsSample(strategyId !== "custom");
    setTargetBalance(balance || 0);
    hasLoadedRef.current = true;
    // Seed liveData with pre-loaded prices so portfolio has values immediately
    if (Object.keys(prePrices).length > 0) {
      setLiveData(prev => ({ ...prev, ...prePrices }));
    }
    // Reset DRIP and cash state for new portfolio
    const cashVal = Math.max(0, initialCash || 0);
    setCashBalance(cashVal);
    setCashApy(0);
    setCashCompounding('none');
    setDripEnabled(true);
    const today = new Date().toISOString().substring(0, 10);
    // Save to D1
    if (getToken) {
      const toSave = newHoldings.map(h => ({
        ticker: h.ticker,
        name: h.name || '',
        sector: h.sector || '',
        shares: h.shares || 0,
        cost_basis: h.price || 0,
        yield_override: h.yld || null,
      }));
      saveUserHoldings(getToken, toSave).catch(e =>
        console.warn('Save on load failed:', e.message)
      );
      // Save strategy + target balance + lastProcessedAt to profile
      updateUserProfile(getToken, { displayName: '', defaultStrategy: strategyId || '', targetBalance: balance || 0, dripEnabled: true, cashBalance: cashVal, lastProcessedAt: today, cashApy: 0, cashCompounding: 'none' }).catch(() => {});
    }
  }

  // Add stock to portfolio
  async function addStock() {
    if (!addTicker || isAdding) return;
    setIsAdding(true);
    try {
      const ticker = addTicker.toUpperCase();
      const data = await fetchEnrichedQuote(ticker);
      const shares = parseFloat(addShares) || 1;
      const yldOverride = parseFloat(addYield);

      const newHolding = {
        ticker,
        name: data?.name || ticker,
        sector: data?.sector || null,
        price: data?.price || 0,
        costBasis: data?.price || 0,
        shares,
        yld: yldOverride || data?.divYield || 0,
        div: data?.annualDiv || 0,
        payout: data?.payout || null,
        g5: data?.g5 ?? 5,
        streak: data?.streak ?? 0,
        score: 50,
      };

      if (data) setLiveData(prev => ({ ...prev, [ticker]: data }));
      setHoldings(prev => [...prev.filter(h => h.ticker !== ticker), newHolding]);
      setTargetBalance(0); // clear anchor since portfolio was manually modified
      setShowAddModal(false);
      setAddTicker("");
      setAddShares("");
      setAddYield("");
      setAddResults([]);
    } finally {
      setIsAdding(false);
    }
  }

  // Remove stock
  function removeStock(ticker) {
    setHoldings(prev => prev.filter(h => h.ticker !== ticker));
    setTargetBalance(0); // clear anchor since portfolio was manually modified
  }

  // Edit shares
  function editShares(ticker, newShares) {
    setHoldings(prev => prev.map(h => h.ticker === ticker ? { ...h, shares: newShares } : h));
    setTargetBalance(0); // clear anchor since portfolio was manually modified
  }

  // Merge fundamentals from StockDetail back into shared liveData
  function mergeLiveData(ticker, data) {
    setLiveData(prev => ({ ...prev, [ticker]: { ...prev[ticker], ...data } }));
  }

  // Select stock for detail view
  function selectStock(stock) {
    setDetailView(stock);
    refreshStock(stock.ticker);
    window.scrollTo(0, 0);
  }

  // Reset portfolio — clear holdings and return to onboarding
  function resetPortfolio() {
    setHoldings([]);
    setLiveData({});
    setIsOnboarding(true);
    setStrategy(null);
    setIsSample(false);
    setTargetBalance(0);
    setDetailView(null);
    setActiveTab("dashboard");
    setCashBalance(0);
    setCashApy(0);
    setCashCompounding('none');
    hasLoadedRef.current = false;
    if (getToken) {
      saveUserHoldings(getToken, []).catch(e =>
        console.warn('Reset save failed:', e.message)
      );
    }
  }

  // Watchlist functions
  async function addWatch(ticker, name) {
    setWatchlist(prev => {
      if (prev.some(w => w.ticker === ticker)) return prev;
      return [{ ticker, name: name || ticker, added_at: new Date().toISOString() }, ...prev];
    });
    if (getToken) {
      addToUserWatchlist(getToken, ticker, name).catch(e =>
        console.warn('Watch add failed:', e.message)
      );
    }
  }

  async function removeWatch(ticker) {
    setWatchlist(prev => prev.filter(w => w.ticker !== ticker));
    if (getToken) {
      removeFromUserWatchlist(getToken, ticker).catch(e =>
        console.warn('Watch remove failed:', e.message)
      );
    }
  }

  function isWatched(ticker) {
    return watchlist.some(w => w.ticker === ticker);
  }

  // Derived cash yield from APY and compounding settings
  const cashYield = useMemo(() => {
    if (cashCompounding === 'none' || cashApy <= 0 || cashBalance <= 0) {
      return { annualRate: 0, annualIncome: 0, monthlyIncome: 0 };
    }
    const rate = cashApy / 100;
    const annualIncome = cashBalance * rate;
    return { annualRate: rate, annualIncome, monthlyIncome: annualIncome / 12 };
  }, [cashBalance, cashApy, cashCompounding]);

  // Portfolio summary — uses best available price for each holding
  const summary = useMemo(() => {
    let pv = 0, yieldSum = 0, growthSum = 0;
    holdings.forEach(h => {
      const live = liveData[h.ticker];
      const price = (live?.price > 0 ? live.price : null) || h.price || 0;
      const value = price * (h.shares || 0);
      const yld = live?.divYield ?? h.yld ?? 0;
      const g5 = live?.g5 ?? h.g5 ?? 0;
      pv += value;
      yieldSum += yld * value;
      if (g5 > 0) { growthSum += g5 * value; }
    });

    // Include cash yield in weighted average
    const effectiveCashApy = (cashCompounding !== 'none' && cashApy > 0) ? cashApy : 0;
    yieldSum += effectiveCashApy * cashBalance;

    // Derive stock income from calcMonthlyIncome
    const monthlyArr = calcMonthlyIncome(holdings, liveData);
    const stockAnnualIncome = Math.round(monthlyArr.reduce((a, b) => a + b, 0));
    // Total income includes cash interest
    const annualIncome = stockAnnualIncome + Math.round(cashYield.annualIncome);

    const holdingsValue = pv;
    pv += cashBalance;

    return {
      portfolioValue: pv,
      holdingsValue,
      cashBalance,
      annualIncome,
      weightedYield: pv > 0 ? yieldSum / pv : 0,
      weightedGrowth: pv > 0 ? growthSum / pv : 0,
      monthlyAvg: Math.round(annualIncome / 12),
    };
  }, [holdings, liveData, cashBalance, cashApy, cashCompounding, cashYield]);

  // Update visualizer type
  function updateVizType(type) {
    setVizType(type);
    if (getToken) {
      updateUserProfile(getToken, { vizType: type }).catch(() => {});
    }
  }

  // Update cash balance — persists to DB
  function updateCashBalance(amount) {
    const val = Math.max(0, Number(amount) || 0);
    setCashBalance(val);
    if (getToken) {
      updateUserProfile(getToken, { cashBalance: val }).catch(() => {});
    }
  }

  // Update cash APY — persists to DB
  function updateCashApy(apy) {
    const val = Math.max(0, Math.min(20, Number(apy) || 0));
    setCashApy(val);
    if (getToken) {
      updateUserProfile(getToken, { cashApy: val }).catch(() => {});
    }
  }

  // Update cash compounding frequency — persists to DB
  function updateCashCompounding(freq) {
    const valid = ['none', 'daily', 'monthly', 'quarterly'];
    const val = valid.includes(freq) ? freq : 'none';
    setCashCompounding(val);
    if (val === 'none') {
      setCashApy(0);
      if (getToken) {
        updateUserProfile(getToken, { cashCompounding: val, cashApy: 0 }).catch(() => {});
      }
    } else {
      if (getToken) {
        updateUserProfile(getToken, { cashCompounding: val }).catch(() => {});
      }
    }
  }

  // Toggle DRIP setting
  function toggleDrip() {
    const newVal = !dripEnabled;
    setDripEnabled(newVal);
    if (getToken) {
      updateUserProfile(getToken, { dripEnabled: newVal }).catch(() => {});
    }
  }

  // Select a ticker from search results — clears dropdown, won't re-search
  function pickTicker(ticker) {
    pickedTickerRef.current = ticker;
    setAddTicker(ticker);
    setAddResults([]);
  }

  return {
    isOnboarding, isLoadingSaved, activeTab, setActiveTab,
    holdings, prePrices, pricesLoading, isSample, strategy,
    searchQuery, setSearchQuery,
    detailView, setDetailView,
    liveData, loadingStates,
    showAddModal, setShowAddModal,
    addTicker, setAddTicker, addResults, addShares, setAddShares,
    addYield, setAddYield, isAdding,
    handleLoad, addStock, removeStock, editShares, selectStock, refreshStock, refreshAll, refreshing,
    pickTicker, preloadStrategyPrices,
    summary, resetPortfolio,
    // Visualizer
    vizType, updateVizType,
    // DRIP & cash
    dripEnabled, toggleDrip, cashBalance, updateCashBalance,
    cashApy, updateCashApy, cashCompounding, updateCashCompounding, cashYield,
    // Watchlist
    watchlist, addWatch, removeWatch, isWatched,
    // Timestamp
    lastUpdatedAt,
    // Merge fundamentals from detail view
    mergeLiveData,
  };
}
