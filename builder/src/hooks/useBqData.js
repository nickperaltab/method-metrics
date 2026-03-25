import { useState, useCallback } from 'react';
import { fetchViewData } from '../lib/bigquery';

export function useBqData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadView = useCallback(async (viewName) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchViewData(viewName);
      setData(result);
      return result;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, loadView };
}
