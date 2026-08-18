import { useState, useEffect } from 'react';
import { fetchMethodMondayWindow, getBqToken } from '../lib/bigquery.js';

/**
 * Fetch the Method Monday queried window (period / elapsed_days /
 * days_in_month) live from `int_method_monday`, mirroring
 * useViewDefinition.js's fetch/loading/error pattern. `enabled` gates the
 * fetch so this only runs on the Method Monday scorecard, and only once
 * BigQuery is connected — without a token there is nothing to fetch, and
 * the header renders nothing rather than a guessed range.
 */
export function useMethodMondayWindow(enabled) {
  const [state, setState] = useState({ window: null, loading: false, error: null });

  useEffect(() => {
    if (!enabled || !getBqToken()) {
      setState({ window: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ window: null, loading: true, error: null });
    fetchMethodMondayWindow()
      .then((window) => {
        if (cancelled) return;
        setState({ window, loading: false, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ window: null, loading: false, error: err.message || 'Fetch failed' });
      });
    return () => { cancelled = true; };
  }, [enabled]);

  return state;
}
