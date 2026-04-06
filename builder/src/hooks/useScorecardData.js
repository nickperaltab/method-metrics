import { useState, useEffect, useRef } from 'react';
import {
  fetchChartData, fetchAggregatedData, queryBqWithRetry,
  buildBatchSql, splitBatchResults, wrapChartSql,
} from '../lib/bigquery';
import { getDateCol } from '../lib/chartDataBuilder';
import { evaluateFormula, validateInt } from '../lib/sanitize';

/**
 * Collect all metric IDs referenced in a scorecard config, including derived deps.
 */
function collectMetricIds(config) {
  const ids = new Set();
  const customSqls = [];
  const weeklyMetrics = new Map(); // metricId → { viewName, dateCol } for weekly fetching

  for (const section of config.sections) {
    for (const kpi of section.kpis || []) {
      ids.add(kpi.metricId);
    }
    for (const chart of section.charts || []) {
      for (const m of chart.metrics || []) {
        if (typeof m.id === 'number') ids.add(m.id);
        if (m.customSql) customSqls.push({ key: m.id, sql: m.customSql });
      }
      // Collect metrics that need weekly bucketing
      if (chart.timeBucket === 'week') {
        for (const m of chart.metrics || []) {
          if (typeof m.id === 'number') weeklyMetrics.set(m.id, true);
        }
      }
    }
  }
  return { ids: [...ids], customSqls, weeklyMetrics };
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
      let result = null;
      let lastErr = null;
      for (let attempt = 0; attempt <= 1; attempt++) {
        try {
          result = await task.fn();
          if (result && (result.labels?.length > 0 || result.multiSeries)) break;
          if (attempt < 1) {
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
        } catch (e) {
          lastErr = e;
          if (e.message?.includes('session expired')) break; // don't retry auth
          if (attempt < 1) {
            await new Promise(r => setTimeout(r, 500));
            continue;
          }
        }
      }
      if (result) {
        console.log(`[Scorecard] Fetched ${task.key}:`, result.labels?.length ?? 'non-standard', 'periods');
        results.set(task.key, result);
      } else {
        console.error(`[Scorecard] FAILED ${task.key}:`, lastErr?.message || 'empty result');
        results.set(task.key, lastErr ? { error: lastErr.message } : null);
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
 * Separate scorecard metrics into batchable (UNION ALL) and individual tasks.
 * Batchable: chart_sql metrics (single-series {period,value}) and custom SQL.
 * Individual: view_name metrics (need fetchAggregatedData with dynamic params).
 * chart_sql takes precedence over view_name (matching fetchChartData behavior).
 */
export function groupScorecardTasks(primitives, customSqls, views, lastNMonths) {
  const batchable = [];
  const individual = [];

  for (const metric of primitives) {
    if (metric.chart_sql) {
      const sql = wrapChartSql(metric.chart_sql, lastNMonths);
      batchable.push({ key: metric.id, sql }); // keep numeric ID
    } else if (metric.view_name) {
      individual.push({
        key: metric.id,
        fn: async () => {
          const dateCol = views?.[metric.view_name]?.dateCol
            || getDateCol(metric.view_name, 'SignupDate');
          return await fetchAggregatedData(
            metric.view_name, dateCol, 'COUNT', 'month', null, lastNMonths
          );
        },
      });
    }
  }

  for (const { key, sql } of customSqls) {
    batchable.push({ key, sql }); // string key like '__weekly_conv_rate'
  }

  return { batchable, individual };
}

/**
 * Hook to load all data for a scorecard config.
 * Fetches primitives via batch UNION ALL where possible, individual queries otherwise.
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
    const { ids: directIds, customSqls, weeklyMetrics } = collectMetricIds(config);
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

    const { batchable, individual } = groupScorecardTasks(
      primitives, customSqls, config.views, 13
    );

    // Add weekly fetch tasks to individual
    for (const [metricId] of weeklyMetrics) {
      const metric = metricsMap.get(metricId);
      if (!metric || !metric.view_name) continue;
      individual.push({
        key: `${metricId}:week`,
        fn: async () => {
          const dateCol = config.views?.[metric.view_name]?.dateCol
            || getDateCol(metric.view_name, 'SignupDate');
          return await fetchAggregatedData(
            metric.view_name, dateCol, 'COUNT', 'week', null, 3
          );
        },
      });
    }

    const totalTasks = (batchable.length > 0 ? 1 : 0) + individual.length;
    setProgress({ loaded: 0, total: totalTasks });
    setLoading(true);

    (async () => {
      // 1. Batched UNION ALL (one BQ request for all chart_sql + customSql)
      const rawResults = new Map();
      if (batchable.length > 0) {
        try {
          const batchSql = buildBatchSql(batchable);
          const keyMap = new Map(batchable.map(q => [String(q.key), q.key]));
          const batchResult = await queryBqWithRetry(batchSql, { maxRetries: 2, retryOnEmpty: true });
          const split = splitBatchResults(batchResult.rows, keyMap);
          for (const [key, rows] of split) {
            rawResults.set(key, {
              labels: rows.map(r => r.period),
              data: rows.map(r => Number(r.value) || 0),
            });
          }
          for (const q of batchable) {
            if (!rawResults.has(q.key)) rawResults.set(q.key, null);
          }
          console.log(`[Scorecard] Batch query: ${batchable.length} metrics in 1 request`);
        } catch (e) {
          console.error('[Scorecard] Batch query failed, falling back to individual:', e);
          for (const q of batchable) {
            try {
              const result = await queryBqWithRetry(q.sql, { maxRetries: 1 });
              rawResults.set(q.key, {
                labels: result.rows.map(r => r.period),
                data: result.rows.map(r => Number(r.value) || 0),
              });
            } catch (e2) {
              rawResults.set(q.key, { error: e2.message });
            }
          }
        }
        if (!abortRef.current) setProgress(p => ({ ...p, loaded: 1 }));
      }

      if (abortRef.current) return;

      // 2. Individual tasks in parallel (concurrency 5, with task-level retry)
      const indResults = await parallelLimit(individual, 5, (loaded) => {
        if (!abortRef.current) {
          setProgress(p => ({ ...p, loaded: (batchable.length > 0 ? 1 : 0) + loaded }));
        }
      });
      for (const [key, result] of indResults) {
        rawResults.set(key, result);
      }

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
