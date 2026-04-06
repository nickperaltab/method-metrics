import { useState, useEffect, useRef } from 'react';
import { fetchChartData, fetchAggregatedData, queryBq } from '../lib/bigquery';
import { buildBatchSql, splitBatchResults, wrapChartSql } from '../lib/bigquery';
import { getDateCol } from '../lib/chartDataBuilder';
import { evaluateFormula } from '../lib/sanitize';

/**
 * Collect all metric IDs referenced in a scorecard config, including derived deps.
 */
function collectMetricIds(config) {
  const ids = new Set();
  const customSqls = [];
  const weeklyMetrics = new Map();

  for (const section of config.sections) {
    for (const kpi of section.kpis || []) {
      ids.add(kpi.metricId);
    }
    for (const chart of section.charts || []) {
      for (const m of chart.metrics || []) {
        if (typeof m.id === 'number') ids.add(m.id);
        if (m.customSql) customSqls.push({ key: m.id, sql: m.customSql });
      }
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
 * Split an array into chunks of size n.
 */
function chunk(arr, n) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += n) {
    chunks.push(arr.slice(i, i + n));
  }
  return chunks;
}

/**
 * Run a batch of chart_sql queries as a single UNION ALL request.
 * Returns Map<key, { labels, data }>.
 */
async function runBatch(queries) {
  const batchSql = buildBatchSql(queries);
  const keyMap = new Map(queries.map(q => [String(q.key), q.key]));
  const result = await queryBq(batchSql);
  const split = splitBatchResults(result.rows, keyMap);
  const map = new Map();
  for (const [key, rows] of split) {
    map.set(key, {
      labels: rows.map(r => r.period),
      data: rows.map(r => Number(r.value) || 0),
    });
  }
  return map;
}

/**
 * Hook to load all data for a scorecard config.
 * Batches chart_sql metrics into UNION ALL queries (6 per batch),
 * runs view-based metrics individually, then computes derived metrics.
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

    // Split primitives: chart_sql → batchable, view_name → individual
    const batchable = [];
    const individual = [];

    for (const metric of primitives) {
      if (metric.chart_sql) {
        batchable.push({ key: metric.id, sql: wrapChartSql(metric.chart_sql, 13) });
      } else if (metric.view_name) {
        individual.push(metric);
      }
    }

    // Add custom SQL to batchable
    for (const { key, sql } of customSqls) {
      batchable.push({ key, sql });
    }

    // Chunk batchable into groups of 6
    const batches = chunk(batchable, 6);

    // Weekly tasks
    const weeklyTasks = [];
    for (const [metricId] of weeklyMetrics) {
      const metric = metricsMap.get(metricId);
      if (!metric || !metric.view_name) continue;
      weeklyTasks.push(metric);
    }

    const totalSteps = batches.length + individual.length + weeklyTasks.length;
    setProgress({ loaded: 0, total: totalSteps });
    setLoading(true);

    (async () => {
      const map = new Map();
      const errs = new Map();
      let loaded = 0;

      // 1. Run batched UNION ALL queries (6 per batch, all batches in parallel)
      if (batches.length > 0) {
        const batchPromises = batches.map(async (batch) => {
          try {
            const results = await runBatch(batch);
            return { results, error: null };
          } catch (e) {
            console.error(`[Scorecard] Batch failed (${batch.length} queries):`, e.message);
            // Fallback: run individually
            const results = new Map();
            for (const q of batch) {
              try {
                const result = await queryBq(q.sql);
                if (result.rows?.length > 0) {
                  results.set(q.key, {
                    labels: result.rows.map(r => r.period),
                    data: result.rows.map(r => Number(r.value) || 0),
                  });
                } else {
                  results.set(q.key, null);
                }
              } catch (e2) {
                results.set(q.key, null);
                errs.set(q.key, e2.message);
              }
            }
            return { results, error: e.message };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        for (const { results } of batchResults) {
          for (const [key, value] of results) {
            map.set(key, value);
          }
          loaded++;
          if (!abortRef.current) setProgress({ loaded, total: totalSteps });
        }

        // Fill in any missing keys
        for (const q of batchable) {
          if (!map.has(q.key)) map.set(q.key, null);
        }

        console.log(`[Scorecard] ${batchable.length} chart_sql metrics in ${batches.length} batch(es)`);
      }

      if (abortRef.current) return;

      // 2. Run individual view-based queries in parallel (concurrency 5)
      const indPromises = individual.map(async (metric) => {
        try {
          const dateCol = config.views?.[metric.view_name]?.dateCol
            || getDateCol(metric.view_name, 'SignupDate');
          const result = await fetchAggregatedData(
            metric.view_name, dateCol, 'COUNT', 'month', null, 13
          );
          return { key: metric.id, result };
        } catch (e) {
          return { key: metric.id, result: null, error: e.message };
        }
      });

      const indResults = await Promise.all(indPromises);
      for (const { key, result, error } of indResults) {
        if (result && result.labels?.length > 0) {
          map.set(key, { labels: result.labels, data: result.data });
        } else {
          map.set(key, null);
        }
        if (error) errs.set(key, error);
        loaded++;
        if (!abortRef.current) setProgress({ loaded, total: totalSteps });
      }

      if (abortRef.current) return;

      // 3. Run weekly tasks in parallel
      const weeklyPromises = weeklyTasks.map(async (metric) => {
        try {
          const dateCol = config.views?.[metric.view_name]?.dateCol
            || getDateCol(metric.view_name, 'SignupDate');
          const result = await fetchAggregatedData(
            metric.view_name, dateCol, 'COUNT', 'week', null, 3
          );
          return { key: `${metric.id}:week`, result };
        } catch (e) {
          return { key: `${metric.id}:week`, result: null, error: e.message };
        }
      });

      const weeklyResults = await Promise.all(weeklyPromises);
      for (const { key, result, error } of weeklyResults) {
        if (result && result.labels?.length > 0) {
          map.set(key, { labels: result.labels, data: result.data });
        } else {
          map.set(key, null);
        }
        if (error) errs.set(key, error);
        loaded++;
        if (!abortRef.current) setProgress({ loaded, total: totalSteps });
      }

      if (abortRef.current) return;

      // 4. Compute derived metrics (instant, no BQ calls)
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
