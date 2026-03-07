import { useState, useEffect, useCallback } from 'react';
import { getReconciliation, generateReconciliation, confirmReconciliation as confirmAPI } from '../../api/extreme';

export default function useReconciliation(getToken, holdings, divScheduleMap) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ status: null, from: null, to: null });

  const load = useCallback(async (f) => {
    setLoading(true);
    try {
      var data = await getReconciliation(getToken, f || filters);
      setRecords(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken, filters]);

  useEffect(() => { load(); }, [load]);

  const updateFilters = useCallback((newFilters) => {
    var merged = { ...filters, ...newFilters };
    setFilters(merged);
    load(merged);
  }, [filters, load]);

  const generate = useCallback(async (dividendData) => {
    if (!holdings || holdings.length === 0) return;
    setGenerating(true);
    try {
      var holdingsPayload = holdings.map(function(h) {
        return { ticker: h.ticker, shares: h.shares, holding_id: h.ticker };
      });
      var result = await generateReconciliation(getToken, holdingsPayload, dividendData);
      await load();
      return result;
    } catch (e) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }, [getToken, holdings, load]);

  const confirm = useCallback(async (id, actualAmount, actualTotal, notes) => {
    try {
      var updated = await confirmAPI(getToken, id, actualAmount, actualTotal, notes);
      setRecords(function(prev) {
        return prev.map(function(r) { return r.id === id ? updated : r; });
      });
      return updated;
    } catch (e) {
      setError(e.message);
    }
  }, [getToken]);

  // Summary stats
  var summary = {
    total: records.length,
    pending: records.filter(function(r) { return r.status === 'pending'; }).length,
    confirmed: records.filter(function(r) { return r.status === 'confirmed'; }).length,
    variance: records.filter(function(r) { return r.status === 'variance'; }).length,
    missed: records.filter(function(r) { return r.status === 'missed'; }).length,
    expectedTotal: records.reduce(function(s, r) { return s + (r.expected_total || 0); }, 0),
    actualTotal: records.reduce(function(s, r) { return s + (r.actual_total || 0); }, 0),
  };

  return {
    records, loading, generating, error, summary,
    filters, updateFilters, generate, confirm, reload: load,
  };
}
