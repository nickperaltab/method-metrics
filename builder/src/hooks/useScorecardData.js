import { useState, useEffect, useRef } from 'react';
import { fetchChartData, fetchAggregatedData, queryBq } from '../lib/bigquery';
import { getDateCol } from '../lib/chartDataBuilder';
import { evaluateFormula } from '../lib/sanitize';

/**
 * Collect all metric IDs referenced in a scorecard config, including derived deps.
 */
function collectMetricIds(config) {
  const ids = new Set();
  const customSqls = [];

  for (const section of config.sections) {
    for (const kpi of section.kpis || []) {
      ids.add(kpi.metricId);
    }
    for (const chart of section.charts || []) {
      for (const m of chart.metrics || []) {
        if (typeof m.id === 'number') ids.add(m.id);
        if (m.customSql) customSqls.push({ key: m.id, sql: m.customSql });
      }
    }
  }
  return { ids: [...ids], customSqls };
}

/**
 * Walk derived dependency chains and add all transitive deps.
 */
function addDerivedDeps(ids, metricsMap) {
  const allIds = new Set(ids);
  const queue = [...ids];
  while (queue.length > 0) {
    const id = queue.pop();
    const m = metricsMap.get(id);
    if (m?.depends_on) {
      for (const depId of m.depends_on) {
        if (!allIds.has(depId)) {
          allIds.add(depId);
          queue.push(depId);
        }
      }
    }
  }
  return [...allIds];
}

/**
 * Run async tasks with a concurrency limit.
 */
async function parallelLimit(tasks, limit, onProgress) {
  const results = new Map();
  let completed = 0;
  let index = 0;

  async function runNext() {
    while (index < tasks.length) {
      const task = tasks[index++];
      try {
        const result = await task.fn();
        results.set(task.key, result);
      } catch (e) {
        console.error(`Scorecard fetch failed for ${task.key}:`, e);
        results.set(task.key, { error: e.message });
      }
      completed++;
      onProgress?.(completed, tasks.length);
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

/**
 * Hook to load all data for a scorecard config.
 * Fetches primitives in parallel (3 at a time), then computes derived metrics.
 */
export default function useScorecardData(config, metrics, bqConnected) {
  const [dataMap, setDataMap] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [errors, setErrors] = useState(new Map());
  const abortRef = useRef(false);

  useEffect(() => {
    if (!config || !metrics?.length || !bqConnected) {
      setLoading(false);
      return;
    }

    abortRef.current = false;

    const metricsMap = new Map(metrics.map(m => [m.id, m]));
    const { ids: directIds, customSqls } = collectMetricIds(config);
    const allIds = addDerivedDeps(directIds, metricsMap);

    // Split into primitives (fetchable) and derived (computed)
    const primitives = [];
    const derived = [];
    for (const id of allIds) {
      const m = metricsMap.get(id);
      if (!m) continue;
      if (m.formula && m.depends_on?.length > 0 && !m.chart_sql && !m.view_name) {
        derived.push(m);
      } else {
        primitives.push(m);
      }
    }

    // Build task list for parallel execution
    const tasks = [];

    for (const metric of primitives) {
      tasks.push({
        key: metric.id,
        fn: async () => {
          if (metric.chart_sql) {
            return await fetchChartData(metric, null, 'COUNT', 'month', null, 13);
          } else if (metric.view_name) {
            const dateCol = config.views?.[metric.view_name]?.dateCol
              || getDateCol(metric.view_name, 'SignupDate');
            return await fetchAggregatedData(
              metric.view_name, dateCol, 'COUNT', 'month', null, 13
            );
          }
          return null;
        },
      });
    }

    for (const { key, sql } of customSqls) {
      tasks.push({
        key,
        fn: async () => {
          const result = await queryBq(sql);
          if (result.rows?.length > 0) {
            return {
              labels: result.rows.map(r => r.period),
              data: result.rows.map(r => Number(r.value) || 0),
            };
          }
          return null;
        },
      });
    }

    setProgress({ loaded: 0, total: tasks.length });
    setLoading(true);

    (async () => {
      // Fetch all primitives + custom SQL in parallel, 3 at a time
      const rawResults = await parallelLimit(tasks, 3, (loaded, total) => {
        if (!abortRef.current) setProgress({ loaded, total });
      });

      if (abortRef.current) return;

      // Normalize results into dataMap
      const map = new Map();
      const errs = new Map();

      for (const [key, result] of rawResults) {
        if (!result || result.error) {
          map.set(key, null);
          if (result?.error) errs.set(key, result.error);
          continue;
        }
        // Handle multi-series: flatten primary series
        if (result.multiSeries) {
          const keys = Object.keys(result.series);
          if (keys.length > 0) {
            const first = result.series[keys[0]];
            map.set(key, { labels: first.labels, data: first.data });
          } else {
            map.set(key, null);
          }
        } else if (result.labels?.length > 0) {
          map.set(key, { labels: result.labels, data: result.data });
        } else {
          map.set(key, null);
        }
      }

      // Compute derived metrics (instant, no BQ calls)
      for (const metric of derived) {
        if (abortRef.current) return;
        try {
          const depData = {};
          for (const depId of metric.depends_on) {
            const d = map.get(depId);
            if (d) {
              const counts = {};
              d.labels.forEach((l, i) => { counts[l] = d.data[i]; });
              depData[depId] = counts;
            } else {
              depData[depId] = {};
            }
          }

          const allLabels = new Set();
          for (const counts of Object.values(depData)) {
            Object.keys(counts).forEach(k => allLabels.add(k));
          }
          const sorted = [...allLabels].sort();

          const computedLabels = [];
          const computedData = [];
          for (const lbl of sorted) {
            const depValues = {};
            for (const depId of metric.depends_on) {
              depValues[depId] = depData[depId]?.[lbl] || 0;
            }
            const value = Math.round(evaluateFormula(metric.formula, depValues) * 100) / 100;
            computedLabels.push(lbl);
            computedData.push(value);
          }

          if (computedLabels.length > 0) {
            map.set(metric.id, { labels: computedLabels, data: computedData });
          } else {
            map.set(metric.id, null);
          }
        } catch (e) {
          console.error(`Scorecard derived failed for metric ${metric.id}:`, e);
          map.set(metric.id, null);
          errs.set(metric.id, e.message);
        }
      }

      if (!abortRef.current) {
        setDataMap(map);
        setErrors(errs);
        setLoading(false);
      }
    })();

    return () => { abortRef.current = true; };
  }, [config, metrics, bqConnected]);

  return { dataMap, loading, progress, errors };
}
