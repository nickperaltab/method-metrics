import { useState, useEffect, useRef } from 'react';
import { loadScorecardData } from '../lib/sql/load.js';
import { queryBqWithRetry } from '../lib/bigquery.js';
import { fetchSnapshot } from '../lib/snapshots.js';

// Phase 1: snapshot only wired up for marketing-scorecard.
const SNAPSHOT_ENABLED = new Set(['marketing-scorecard']);

const BQ_TOKEN_DELAY_MS = 500;

export default function useScorecardData(config, metrics, bqConnected) {
  const [dataMap, setDataMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [errors, setErrors] = useState([]);
  const [freshness, setFreshness] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [needsBq, setNeedsBq] = useState(false);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!config || !metrics?.length) {
      setLoading(false);
      return;
    }

    abortRef.current = false;
    setLoading(true);
    setProgress({ loaded: 0, total: 0 });
    setErrors([]);
    setDataMap(new Map());
    setFreshness(null);
    setRefreshedAt(null);
    setNeedsBq(false);

    let delayTimer = null;

    (async () => {
      if (SNAPSHOT_ENABLED.has(config.id)) {
        try {
          const snap = await fetchSnapshot(config.id);
          if (abortRef.current) return;
          if (snap && (snap.freshness === 'fresh' || snap.freshness === 'stale')) {
            setDataMap(snap.dataMap);
            setFreshness(snap.freshness);
            setRefreshedAt(snap.refreshedAt);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('[Scorecard] Snapshot read failed, falling back to live:', e);
        }
      }

      if (!bqConnected) {
        if (abortRef.current) return;
        setNeedsBq(true);
        setLoading(false);
        return;
      }

      delayTimer = setTimeout(async () => {
        if (abortRef.current) return;
        const signal = { get aborted() { return abortRef.current; } };
        try {
          const { dataMap: liveData, errors: liveErrors } = await loadScorecardData({
            config,
            metrics,
            query: queryBqWithRetry,
            onProgress: (p) => { if (!abortRef.current) setProgress(p); },
            signal,
          });
          if (abortRef.current) return;
          setDataMap(liveData);
          setErrors(liveErrors);
          setLoading(false);
        } catch (e) {
          if (abortRef.current) return;
          console.error('[Scorecard] Live load failed:', e);
          setErrors([{ data_key: null, message: e.message }]);
          setLoading(false);
        }
      }, BQ_TOKEN_DELAY_MS);
    })();

    return () => {
      abortRef.current = true;
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, [config, metrics, bqConnected]);

  return { dataMap, loading, progress, errors, freshness, refreshedAt, needsBq };
}

// Re-exports preserved for existing test imports
export { collectMetricIds } from '../lib/sql/plan.js';
export { topoSortDerived } from '../lib/sql/load.js';
