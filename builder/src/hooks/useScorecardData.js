import { useState, useEffect, useRef } from 'react';
import { fetchChartData, fetchAggregatedData, queryBq, buildSemanticSql, fetchGroupedData } from '../lib/bigquery';
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
  const groupedCharts = []; // { metricId, dimension, lastNMonths }
  const yoyMetrics = new Set(); // metric IDs needing 25-month fetch
  const rawTableSections = []; // sections with type: 'rawTable'

  for (const section of config.sections) {
    if (section.type === 'rawTable') {
      rawTableSections.push(section);
      if (section.metricId) ids.add(section.metricId);
      continue;
    }
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
      if (chart.groupByDimension) {
        for (const m of chart.metrics || []) {
          if (typeof m.id === 'number') {
            groupedCharts.push({ metricId: m.id, dimension: chart.groupByDimension, lastNMonths: chart.lastNMonths ?? 13 });
          }
        }
      }
      if (chart.yoy) {
        for (const m of chart.metrics || []) {
          if (typeof m.id === 'number') yoyMetrics.add(m.id);
        }
      }
    }
  }
  return { ids: [...ids], customSqls, weeklyMetrics, groupedCharts, yoyMetrics: [...yoyMetrics], rawTableSections };
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
 * Topologically sort derived metrics so dependencies are computed first.
 * If metric A depends on metric B (both in the list), B comes first.
 */
export function topoSortDerived(derivedMetrics) {
  if (derivedMetrics.length <= 1) return derivedMetrics;

  const idSet = new Set(derivedMetrics.map(m => m.id));
  const inDegree = new Map();
  const adj = new Map();

  for (const m of derivedMetrics) {
    inDegree.set(m.id, 0);
    adj.set(m.id, []);
  }

  for (const m of derivedMetrics) {
    for (const depId of (m.depends_on || [])) {
      if (idSet.has(depId)) {
        adj.get(depId).push(m.id);
        inDegree.set(m.id, inDegree.get(m.id) + 1);
      }
    }
  }

  const queue = [];
  for (const m of derivedMetrics) {
    if (inDegree.get(m.id) === 0) queue.push(m.id);
  }

  const sorted = [];
  const byId = new Map(derivedMetrics.map(m => [m.id, m]));
  while (queue.length > 0) {
    const id = queue.shift();
    sorted.push(byId.get(id));
    for (const neighbor of adj.get(id)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    }
  }

  if (sorted.length < derivedMetrics.length) {
    console.warn('[Scorecard] Cycle detected in derived metric dependencies — appending remaining');
    for (const m of derivedMetrics) {
      if (!sorted.includes(m)) sorted.push(m);
    }
  }

  return sorted;
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
  console.log(`[Scorecard] Batch raw: ${result.rows?.length} rows, keys in result:`, [...new Set(result.rows?.map(r => r._key))]);
  const split = splitBatchResults(result.rows, keyMap);
  console.log(`[Scorecard] Batch split: ${split.size} keys:`, [...split.keys()]);
  const map = new Map();
  for (const [key, rows] of split) {
    if (rows.length > 0) {
      map.set(key, {
        labels: rows.map(r => r.period),
        data: rows.map(r => Number(r.value) || 0),
      });
    }
  }
  console.log(`[Scorecard] Batch map: ${map.size} metrics with data, keys:`, [...map.keys()]);
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
    setLoading(true);

    // Small delay after BQ connects to ensure token is fully ready
    const delayTimer = setTimeout(startLoading, 500);
    return () => { abortRef.current = true; clearTimeout(delayTimer); };

    function startLoading() {
    const metricsMap = new Map(metrics.map(m => [m.id, m]));
    const { ids: directIds, customSqls, weeklyMetrics, groupedCharts, yoyMetrics, rawTableSections } = collectMetricIds(config);
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
      if (metric.semantic_table && metric.semantic_measure && metric.semantic_date_col) {
        // Semantic: generate SQL dynamically — do NOT wrap with wrapChartSql (has its own time filter)
        batchable.push({ key: metric.id, sql: buildSemanticSql(metric, 'month', 13, null) });
      } else if (metric.chart_sql) {
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
      if (!metric) continue;
      if (metric.semantic_table && metric.semantic_measure && metric.semantic_date_col) {
        weeklyTasks.push(metric);
      } else if (metric.view_name) {
        weeklyTasks.push(metric);
      }
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
            console.error(`[Scorecard] Batch failed (${batch.length} queries, keys: ${batch.map(q => q.key).join(',')}):`, e.message);
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
          let result;
          if (metric.semantic_table && metric.semantic_measure && metric.semantic_date_col) {
            const sql = buildSemanticSql(metric, 'week', 3, null);
            const raw = await queryBq(sql);
            result = {
              labels: raw.rows.map(r => r.period),
              data: raw.rows.map(r => Number(r.value) || 0),
            };
          } else {
            const dateCol = config.views?.[metric.view_name]?.dateCol
              || getDateCol(metric.view_name, 'SignupDate');
            result = await fetchAggregatedData(
              metric.view_name, dateCol, 'COUNT', 'week', null, 3
            );
          }
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

      // 4. Fetch grouped dimension data (for breakdown charts)
      if (groupedCharts.length > 0) {
        const groupedPromises = groupedCharts.map(async ({ metricId, dimension, lastNMonths: lnm }) => {
          const metric = metricsMap.get(metricId);
          if (!metric?.view_name) return { key: `${metricId}:grouped:${dimension}`, result: null };
          const dateCol = config.views?.[metric.view_name]?.dateCol || getDateCol(metric.view_name, 'SignupDate');
          try {
            const result = await fetchGroupedData(metric.view_name, dateCol, 'COUNT', 'month', dimension, null, lnm);
            return { key: `${metricId}:grouped:${dimension}`, result };
          } catch (e) {
            console.error(`[Scorecard] Grouped query failed for metric ${metricId} by ${dimension}:`, e.message);
            return { key: `${metricId}:grouped:${dimension}`, result: null };
          }
        });
        const groupedResults = await Promise.all(groupedPromises);
        for (const { key, result } of groupedResults) {
          map.set(key, result || null);
        }
        console.log(`[Scorecard] ${groupedCharts.length} grouped dimension queries complete`);
      }

      if (abortRef.current) return;

      // 4b. Daily data for semantic metrics (for grain switcher, last 90 days)
      const semanticPrimitives = primitives.filter(
        m => m.semantic_table && m.semantic_measure && m.semantic_date_col
      );
      if (semanticPrimitives.length > 0) {
        const dailyPromises = semanticPrimitives.map(async (metric) => {
          const sql = buildSemanticSql(metric, 'day', 3, null); // ~90 days
          try {
            const raw = await queryBq(sql);
            return {
              key: `${metric.id}:day`,
              result: raw.rows?.length > 0
                ? { labels: raw.rows.map(r => r.period), data: raw.rows.map(r => Number(r.value) || 0) }
                : null,
            };
          } catch (e) {
            return { key: `${metric.id}:day`, result: null };
          }
        });
        const dailyResults = await Promise.all(dailyPromises);
        for (const { key, result } of dailyResults) {
          map.set(key, result);
        }
      }

      if (abortRef.current) return;

      // 5. YoY data — 25-month fetch for charts with yoy: true
      if (yoyMetrics.length > 0) {
        const yoyPromises = yoyMetrics.map(async (metricId) => {
          const metric = metricsMap.get(metricId);
          if (!metric?.semantic_table || !metric?.semantic_measure || !metric?.semantic_date_col) {
            return { key: `${metricId}:yoy`, result: null };
          }
          try {
            const sql = buildSemanticSql(metric, 'month', 36, null);
            const raw = await queryBq(sql);
            return {
              key: `${metricId}:yoy`,
              result: {
                labels: raw.rows.map(r => r.period),
                data: raw.rows.map(r => Number(r.value) || 0),
              },
            };
          } catch (e) {
            console.error(`[Scorecard] YoY fetch failed for metric ${metricId}:`, e.message);
            return { key: `${metricId}:yoy`, result: null };
          }
        });
        const yoyResults = await Promise.all(yoyPromises);
        for (const { key, result } of yoyResults) {
          map.set(key, result);
        }
      }

      if (abortRef.current) return;

      // 5b. Raw table sections — SELECT raw rows (no aggregation)
      if (rawTableSections.length > 0) {
        const rawPromises = rawTableSections.map(async (section) => {
          const metric = metricsMap.get(section.metricId);
          if (!metric?.semantic_table) return { key: `${section.metricId}:raw`, result: null };
          const cols = (section.columns || [metric.semantic_date_col, 'CompanyAccount']).join(', ');
          const table = `\`project-for-method-dw.revenue.${metric.semantic_table}\``;
          const limit = section.limit || 100;
          const orderCol = metric.semantic_date_col;
          const sql = `SELECT ${cols} FROM ${table} ORDER BY ${orderCol} DESC LIMIT ${limit}`;
          try {
            const raw = await queryBq(sql);
            return { key: `${section.metricId}:raw`, result: { rows: raw.rows, columns: section.columns } };
          } catch (e) {
            console.error(`[Scorecard] Raw table fetch failed for metric ${section.metricId}:`, e.message);
            return { key: `${section.metricId}:raw`, result: null };
          }
        });
        const rawResults = await Promise.all(rawPromises);
        for (const { key, result } of rawResults) {
          map.set(key, result);
        }
      }

      if (abortRef.current) return;

      // 6. Compute derived metrics (instant, no BQ calls)
      for (const metric of topoSortDerived(derived)) {
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
    } // end startLoading
  }, [config, metrics, bqConnected]);

  return { dataMap, loading, progress, errors };
}
