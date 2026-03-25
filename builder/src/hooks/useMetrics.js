import { useState, useEffect } from 'react';
import { fetchMetrics, groupMetrics } from '../lib/supabase';

export function useMetrics() {
  const [metrics, setMetrics] = useState([]);
  const [grouped, setGrouped] = useState({ primitives: [], foundational: [], derived: [], dimensions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMetrics()
      .then(data => {
        setMetrics(data);
        setGrouped(groupMetrics(data));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return { metrics, grouped, loading, error };
}
