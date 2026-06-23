import { useState, useEffect } from 'react';
import { loadDbtModelIndex, getDbtModel } from './dbtModels.js';

export function useDbtModel(key) {
  const [state, setState] = useState({ model: null, loading: !!key, error: null });
  useEffect(() => {
    if (!key) { setState({ model: null, loading: false, error: null }); return; }
    let alive = true;
    setState({ model: null, loading: true, error: null });
    loadDbtModelIndex()
      .then(idx => { if (alive) setState({ model: getDbtModel(idx, key), loading: false, error: null }); })
      .catch(e => { if (alive) setState({ model: null, loading: false, error: e.message || 'load failed' }); });
    return () => { alive = false; };
  }, [key]);
  return state;
}
