import { useState, useEffect, useMemo } from 'react';
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

  // Add stock modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTicker, setAddTicker] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addShares, setAddShares] = useState("");
  const [addYield, setAddYield] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Pre-load prices for all template tickers on mount
  useEffect(() => {
    const allTickers = getAllTemplateTickers([REIT_TEMPLATE, VIG_TEMPLATE, HIGH_YIELD_TEMPLATE]);
    const chunks = [];
    for (let i = 0; i < allTickers.length; i += 50) chunks.push(allTickers.slice(i, i + 50));

    Promise.all(chunks.map(chunk => fetchBatchUpdate(chunk)))
      .then(results => {
        const merged = {};
        results.forEach(r => Object.assign(merged, r));
        setPrePrices(merged);
        setPricesLoading(false);
      })
      .catch(() => setPricesLoading(false));
  }, []);

  // Refresh prices + fundamentals when holdings change
  useEffect(() => {
    if (!holdings.length) return;
    const tickers = holdings.map(h => h.ticker);
    fetchBatchUpdate(tickers).then(data => setLiveData(prev => ({ ...prev, ...data })));
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

  // Typeahead search for add stock modal
  useEffect(() => {
    if (addTicker.length < 1) { setAddResults([]); return; }
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
  function handleLoad(newHoldings, strategyId) {
    setHoldings(newHoldings);
    setStrategy(strategyId);
    setIsOnboarding(false);
    if (strategyId === "nobl") setIsSample(true);
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
  }

  // Edit shares
  function editShares(ticker, newShares) {
    setHoldings(prev => prev.map(h => h.ticker === ticker ? { ...h, shares: newShares } : h));
  }

  // Select stock for detail view
  function selectStock(stock) {
    setDetailView(stock);
    refreshStock(stock.ticker);
    window.scrollTo(0, 0);
  }

  // Portfolio summary
  const summary = useMemo(() => {
    let pv = 0, annualIncome = 0, yieldSum = 0, growthSum = 0, count = 0;
    holdings.forEach(h => {
      const data = liveData[h.ticker] || h;
      const price = data.price || 0;
      const value = price * (h.shares || 0);
      const yld = data.divYield ?? h.yld ?? 0;
      const div = data.annualDiv ?? h.div ?? 0;
      const g5 = h.g5 ?? 5;
      pv += value;
      annualIncome += div * (h.shares || 0);
      if (yld > 0) { yieldSum += yld * value; growthSum += g5 * value; count++; }
    });
    return {
      portfolioValue: pv,
      annualIncome: Math.round(annualIncome),
      weightedYield: pv > 0 ? yieldSum / pv : 0,
      weightedGrowth: pv > 0 ? growthSum / pv : 0,
      monthlyAvg: Math.round(annualIncome / 12),
    };
  }, [holdings, liveData]);

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
    summary,
  };
}
