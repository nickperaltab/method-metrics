import { useState, useEffect } from 'react';
import { fetchMetrics, groupMetrics } from '../lib/supabase';

/**
 * Fetches metrics. Re-fetches when `identityKey` changes — pass the user's
 * email so the admin RLS header (x-method-email) is in place before we ask.
 * Without this, initial mount fetches anonymously and RLS hides non-live
 * metrics from everyone.
 */
export function useMetrics(identityKey) {
  const [metrics, setMetrics] = useState([]);
  const [grouped, setGrouped] = useState({ primitives: [], derived: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!identityKey) { setLoading(false); return; }
    setLoading(true);
    fetchMetrics()
      .then(data => {
        setMetrics(data);
        setGrouped(groupMetrics(data));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [identityKey]);

  return { metrics, grouped, loading, error };
}
