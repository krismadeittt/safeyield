import { useState, useEffect, useMemo, useRef } from 'react';
import { fetchBatchUpdate, fetchEnrichedQuote } from '../api/quotes';
import { fetchBatchFundamentals } from '../api/fundamentals';
import { searchTickers } from '../api/search';
import { REIT_TEMPLATE, VIG_TEMPLATE, HIGH_YIELD_TEMPLATE } from '../data/portfolioTemplates';
import { getAllTemplateTickers } from '../utils/portfolio';

const POLL_INTERVAL = 5 * 60000; // 5 minutes

export default function usePortfolio() {
  const [isOnboarding, setIsOnboarding] = useState(true);
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

  // Add stock modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTicker, setAddTicker] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addShares, setAddShares] = useState("");
  const [addYield, setAddYield] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Pre-load prices for all template tickers on mount (sequential to avoid rate limits)
  useEffect(() => {
    async function loadPrices() {
      const allTickers = getAllTemplateTickers([REIT_TEMPLATE, VIG_TEMPLATE, HIGH_YIELD_TEMPLATE]);
      const chunks = [];
      for (let i = 0; i < allTickers.length; i += 50) chunks.push(allTickers.slice(i, i + 50));

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
    }
    loadPrices();
  }, []);

  // Refresh prices + fundamentals when holdings change
  useEffect(() => {
    if (!holdings.length) return;
    const tickers = holdings.map(h => h.ticker);
    // Only fetch prices for tickers not already in liveData
    const missing = tickers.filter(t => !liveData[t]);
    if (missing.length > 0) {
      fetchBatchUpdate(missing).then(data => setLiveData(prev => ({ ...prev, ...data })));
    }
    fetchBatchFundamentals(tickers);
  }, [holdings.length]);

  // Poll prices every 5 minutes
  useEffect(() => {
    if (!holdings.length) return;
    const id = setInterval(() => {
      fetchBatchUpdate(holdings.map(h => h.ticker))
        .then(data => setLiveData(prev => ({ ...prev, ...data })));
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [holdings]);

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

  // Refresh single stock
  async function refreshStock(ticker) {
    setLoadingStates(prev => ({ ...prev, [ticker]: true }));
    try {
      const data = await fetchEnrichedQuote(ticker);
      if (data) {
        setLiveData(prev => ({ ...prev, [ticker]: data }));
        // Update holding data if it has enriched info
        setHoldings(prev => prev.map(h => {
          if (h.ticker !== ticker) return h;
          return {
            ...h,
            name: data.name || h.name,
            sector: data.sector || h.sector,
            price: data.price || h.price,
          };
        }));
      }
    } finally {
      setLoadingStates(prev => ({ ...prev, [ticker]: false }));
    }
  }

  // Handle onboarding complete
  function handleLoad(newHoldings, strategyId, balance) {
    setHoldings(newHoldings);
    setStrategy(strategyId);
    setIsOnboarding(false);
    setIsSample(strategyId !== "custom");
    setTargetBalance(balance || 0);
    // Seed liveData with pre-loaded prices so portfolio has values immediately
    if (Object.keys(prePrices).length > 0) {
      setLiveData(prev => ({ ...prev, ...prePrices }));
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
        shares,
        yld: yldOverride || data?.divYield || 0,
        div: data?.annualDiv || 0,
        payout: data?.payout || null,
        g5: 5,
        streak: 0,
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

  // Select stock for detail view
  function selectStock(stock) {
    setDetailView(stock);
    refreshStock(stock.ticker);
    window.scrollTo(0, 0);
  }

  // Portfolio summary — uses best available price for each holding
  const summary = useMemo(() => {
    let pv = 0, annualIncome = 0, yieldSum = 0, growthSum = 0;
    holdings.forEach(h => {
      const live = liveData[h.ticker];
      // Use live price if available and > 0, otherwise fall back to holding's stored price
      const price = (live?.price > 0 ? live.price : null) || h.price || 0;
      const value = price * (h.shares || 0);
      const yld = live?.divYield ?? h.yld ?? 0;
      const div = live?.annualDiv ?? h.div ?? 0;
      const g5 = h.g5 ?? 5;
      pv += value;
      annualIncome += div * (h.shares || 0);
      if (yld > 0) { yieldSum += yld * value; growthSum += g5 * value; }
    });

    // If we have a target balance from onboarding and the calculated value is
    // within 2% (meaning same prices, just floating-point drift), anchor to target
    let portfolioValue = pv;
    if (targetBalance > 0 && pv > 0) {
      const drift = Math.abs(pv - targetBalance) / targetBalance;
      if (drift < 0.02) {
        portfolioValue = targetBalance;
      }
    }

    return {
      portfolioValue,
      annualIncome: Math.round(annualIncome),
      weightedYield: pv > 0 ? yieldSum / pv : 0,
      weightedGrowth: pv > 0 ? growthSum / pv : 0,
      monthlyAvg: Math.round(annualIncome / 12),
    };
  }, [holdings, liveData, targetBalance]);

  // Select a ticker from search results — clears dropdown, won't re-search
  function pickTicker(ticker) {
    pickedTickerRef.current = ticker;
    setAddTicker(ticker);
    setAddResults([]);
  }

  return {
    isOnboarding, activeTab, setActiveTab,
    holdings, prePrices, pricesLoading, isSample, strategy,
    searchQuery, setSearchQuery,
    detailView, setDetailView,
    liveData, loadingStates,
    showAddModal, setShowAddModal,
    addTicker, setAddTicker, addResults, addShares, setAddShares,
    addYield, setAddYield, isAdding,
    handleLoad, addStock, removeStock, editShares, selectStock, refreshStock,
    pickTicker,
    summary,
  };
}
