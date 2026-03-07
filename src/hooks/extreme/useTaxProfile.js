import { useState, useEffect, useCallback } from 'react';
import { getTaxProfile, saveTaxProfile, deleteTaxProfile } from '../../api/extreme';

export default function useTaxProfile(getToken) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    var cancelled = false;
    async function load() {
      try {
        var data = await getTaxProfile(getToken);
        if (!cancelled) setProfile(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [getToken]);

  const save = useCallback(async (data) => {
    setSaving(true);
    setError(null);
    try {
      var saved = await saveTaxProfile(getToken, data);
      setProfile(saved);
      return saved;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [getToken]);

  const remove = useCallback(async () => {
    try {
      await deleteTaxProfile(getToken);
      setProfile(null);
    } catch (e) {
      setError(e.message);
    }
  }, [getToken]);

  return { profile, loading, saving, error, save, remove };
}
