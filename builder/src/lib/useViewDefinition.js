import { useState, useEffect } from 'react';
import { fetchViewDefinition, getBqToken } from './bigquery.js';

/**
 * Fetch a BQ view's DDL live and track loading/auth/error state.
 * Source of truth for the Registry/Inspector "Definition" panels —
 * replaces the cached `view_definition` column on metrics, which drifted
 * whenever someone updated a BQ view without re-syncing Supabase.
 */
export function useViewDefinition(viewName) {
  const [state, setState] = useState({
    sql: null, loading: false, error: null, needsAuth: false,
  });

  useEffect(() => {
    if (!viewName) {
      setState({ sql: null, loading: false, error: null, needsAuth: false });
      return;
    }
    if (!getBqToken()) {
      setState({ sql: null, loading: false, error: null, needsAuth: true });
      return;
    }
    let cancelled = false;
    setState({ sql: null, loading: true, error: null, needsAuth: false });
    fetchViewDefinition(viewName)
      .then(sql => {
        if (cancelled) return;
        setState({ sql, loading: false, error: null, needsAuth: false });
      })
      .catch(err => {
        if (cancelled) return;
        setState({ sql: null, loading: false, error: err.message || 'Fetch failed', needsAuth: false });
      });
    return () => { cancelled = true; };
  }, [viewName]);

  return state;
}
