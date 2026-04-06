import { fetchAggregatedData, fetchChartData, fetchGroupedData, fetchDimensionSnapshot } from './bigquery';
import { applyLastNMonths } from './chartUtils';
import { evaluateFormula } from './sanitize.js';
import schemaCache from './schemaCache';

/**
 * Get the date column for a view from schema cache.
 */
export function getDateCol(viewName, fallback) {
  const schema = schemaCache[viewName] || [];
  return schema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name || fallback;
}

/**
 * Fetch and align chart data for a set of metrics.
 * Handles derived (formula), grouped (dimension), and normal (primitive/chart_sql) metrics.
 * Returns { labels, datasets, queryDetails } or null if no data.
 */
export async function fetchChartDatasets({
  metricIds,
  metrics,
  dataConfig,
  lastNMonthsOverride,
}) {
  const { xField, yFields, timeBucket, channelFilter, groupByDimension, endDateRule } = dataConfig;
  const lastNMonths = lastNMonthsOverride !== undefined ? lastNMonthsOverride : dataConfig.lastNMonths;

  const rawDatasets = [];
  const queryDetails = [];

  for (let i = 0; i < metricIds.length; i++) {
    const metric = metrics.find(m => m.id === metricIds[i]);
    if (!metric) continue;
    let yField = yFields?.[i] || yFields?.[0] || 'COUNT';
    // For regular view metrics (no chart_sql), validate yField against schema — fall back to COUNT
    if (!metric.chart_sql && yField !== 'COUNT') {
      const schema = schemaCache[metric.view_name] || [];
      if (!schema.some(c => c.name === yField)) yField = 'COUNT';
    }
    const label = dataConfig.labels?.[i] || metric.name;

    if (metric.formula && metric.depends_on && !metric.view_name) {
      // Derived metric — fetch each dependency, apply formula per period
      const depAggregated = {};
      for (const depId of metric.depends_on) {
        const dep = metrics.find(m => m.id === depId);
        if (!dep) continue;
        try {
          if (dep.chart_sql || dep.view_name) {
            const dateCol = getDateCol(dep.view_name, xField);
            const agg = await fetchChartData(dep, dateCol, 'COUNT', timeBucket, channelFilter, lastNMonths, endDateRule);
            const counts = {};
            agg.labels.forEach((l, idx) => { counts[l] = agg.data[idx]; });
            depAggregated[depId] = counts;
          } else if (dep.formula && dep.depends_on) {
            // Derived dep — recursively fetch its deps and compute its formula
            const subDepData = {};
            for (const subDepId of dep.depends_on) {
              const subDep = metrics.find(m => m.id === subDepId);
              if (!subDep) continue;
              try {
                if (subDep.chart_sql || subDep.view_name) {
                  const sDateCol = getDateCol(subDep.view_name, xField);
                  const sAgg = await fetchChartData(subDep, sDateCol, 'COUNT', timeBucket, channelFilter, lastNMonths, endDateRule);
                  const sCounts = {};
                  sAgg.labels.forEach((l, idx) => { sCounts[l] = sAgg.data[idx]; });
                  subDepData[subDepId] = sCounts;
                }
              } catch { subDepData[subDepId] = {}; }
            }
            const subLabels = new Set();
            for (const c of Object.values(subDepData)) Object.keys(c).forEach(k => subLabels.add(k));
            const counts = {};
            for (const lbl of subLabels) {
              const vals = {};
              for (const sid of dep.depends_on) vals[sid] = subDepData[sid]?.[lbl] || 0;
              counts[lbl] = Math.round(evaluateFormula(dep.formula, vals) * 100) / 100;
            }
            depAggregated[depId] = counts;
          }
        } catch { depAggregated[depId] = {}; }
      }

      const allLabels = new Set();
      for (const counts of Object.values(depAggregated)) Object.keys(counts).forEach(k => allLabels.add(k));
      const sorted = [...allLabels].sort();
      const computedLabels = [], computedData = [];

      for (const lbl of sorted) {
        const depValues = {};
        for (const depId of metric.depends_on) {
          depValues[depId] = depAggregated[depId]?.[lbl] || 0;
        }
        const value = Math.round(evaluateFormula(metric.formula, depValues) * 100) / 100;
        computedLabels.push(lbl);
        computedData.push(value);
      }

      rawDatasets.push({ label, labels: computedLabels, data: computedData });
      queryDetails.push({ metricName: label, metricId: metric.id, sql: `Derived: ${metric.formula}`, dateColumn: 'N/A', labels: computedLabels, data: computedData });

    } else if (groupByDimension && metric.view_name) {
      // Grouped dimension — one series per dimension value
      const dateCol = getDateCol(metric.view_name, xField);
      try {
        const grouped = await fetchGroupedData(metric.view_name, dateCol, yField, timeBucket, groupByDimension, channelFilter, lastNMonths, endDateRule);
        Object.entries(grouped.seriesMap).forEach(([dimValue, data]) => {
          rawDatasets.push({ label: dimValue, labels: grouped.labels, data });
        });
        queryDetails.push({ metricName: label, metricId: metric.id, sql: grouped.sql, dateColumn: dateCol, labels: grouped.labels, data: [], groupedBy: groupByDimension });
      } catch (e) {
        console.error(`fetchGroupedData failed for ${metric.view_name} grouped by ${groupByDimension}:`, e);
        queryDetails.push({ metricName: label, metricId: metric.id, sql: `ERROR: ${e.message}`, dateColumn: dateCol, labels: [], data: [] });
        // Fallback: fetch un-grouped data so the chart still renders
        try {
          const agg = await fetchChartData(metric, dateCol, yField, timeBucket, channelFilter, lastNMonths, endDateRule);
          rawDatasets.push({ label, ...agg });
        } catch { /* give up */ }
      }

    } else if (metric.view_name || metric.chart_sql) {
      // Normal metric — primitive view or pre-aggregated chart_sql
      const dateCol = getDateCol(metric.view_name, xField);
      try {
        const agg = await fetchChartData(metric, dateCol, yField, timeBucket, channelFilter, lastNMonths, endDateRule);
        if (agg.multiSeries) {
          for (const [seriesName, seriesData] of Object.entries(agg.series)) {
            rawDatasets.push({ label: seriesName, ...seriesData });
          }
        } else {
          rawDatasets.push({ label, ...agg });
        }
        queryDetails.push({ metricName: label, metricId: metric.id, sql: agg.sql, dateColumn: dateCol, labels: agg.multiSeries ? [] : agg.labels, data: agg.multiSeries ? [] : agg.data });
      } catch (e) {
        queryDetails.push({ metricName: label, metricId: metric.id, sql: `ERROR: ${e.message}`, dateColumn: dateCol, labels: [], data: [] });
      }
    }
  }

  if (rawDatasets.length === 0) return { empty: true, labels: [], datasets: [], queryDetails };

  // Merge labels (union) and align datasets
  const allLabelsSet = new Set();
  for (const ds of rawDatasets) ds.labels.forEach(l => allLabelsSet.add(l));
  const allLabels = [...allLabelsSet].sort();

  // Detect if the x-axis is weekly (YYYY-MM-DD). If so, monthly series (YYYY-MM keys from
  // chart_sql metrics) are normalized: each weekly tick looks up its month prefix in the map.
  // This lets budget/forecast lines (monthly-only data) appear as flat reference lines on WoW charts.
  const axisIsWeekly = allLabels.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(allLabels[0]);

  const alignedDatasets = rawDatasets.map(ds => {
    const map = {};
    ds.labels.forEach((l, idx) => { map[l] = ds.data[idx]; });
    const isMonthly = ds.labels.length > 0 && /^\d{4}-\d{2}$/.test(ds.labels[0]);
    const normalize = axisIsWeekly && isMonthly;
    return {
      label: ds.label,
      data: allLabels.map(l => {
        if (map[l] !== undefined) return map[l];
        if (normalize) return map[l.slice(0, 7)] ?? 0;
        return 0;
      }),
    };
  });

  // Apply lastNMonths for derived metrics only
  const hasDerived = metricIds.some(mid => {
    const m = metrics.find(mm => mm.id === mid);
    return m?.formula && m?.depends_on && !m?.view_name;
  });
  let finalLabels = allLabels, finalDatasets = alignedDatasets;
  if (hasDerived && lastNMonths != null && lastNMonths >= 0) {
    const applied = applyLastNMonths(allLabels, alignedDatasets, lastNMonths, timeBucket);
    finalLabels = applied.labels;
    finalDatasets = applied.datasets;
  }

  return { labels: finalLabels, datasets: finalDatasets, queryDetails };
}

/**
 * Fetch pivot table data: dimension rows × metric columns.
 * Used when echartsType === 'table' AND groupByDimension is set.
 *
 * Returns:
 *   pivotData: [{ dim: "SEO", "Trials": 108, "Syncs": 62, ... }]
 *   columns: [{ key: "dim", label: "Channel", type: "string" }, { key: "Trials", label: "Trials", type: "number" }, ...]
 *   queryDetails: [...]
 */
export async function fetchPivotData({ metricIds, metrics, dataConfig }) {
  const { xField, yFields, groupByDimension, channelFilter, lastNMonths } = dataConfig;

  const snapshots = {}; // metricLabel → { snapshot: {dimValue: number}, sql, metricId }
  const queryDetails = [];
  const metricLabels = []; // ordered list of metric labels

  for (let i = 0; i < metricIds.length; i++) {
    const metric = metrics.find(m => m.id === metricIds[i]);
    if (!metric) continue;
    let yField = yFields?.[i] || yFields?.[0] || 'COUNT';
    if (!metric.chart_sql && yField !== 'COUNT') {
      const schema = schemaCache[metric.view_name] || [];
      if (!schema.some(c => c.name === yField)) yField = 'COUNT';
    }
    const label = dataConfig.labels?.[i] || metric.name;

    if (metric.formula && metric.depends_on && !metric.view_name) {
      // Derived metric — compute per row after all snapshots are fetched
      metricLabels.push({ label, metric, derived: true });
      continue;
    }

    if (!metric.view_name) continue;

    const dateCol = getDateCol(metric.view_name, xField);
    try {
      const { snapshot, sql } = await fetchDimensionSnapshot(
        metric.view_name, dateCol, yField, groupByDimension, channelFilter, lastNMonths
      );
      snapshots[label] = { snapshot, sql, metricId: metric.id };
      metricLabels.push({ label, metric, derived: false });
      queryDetails.push({ metricName: label, metricId: metric.id, sql, dateColumn: dateCol, labels: [], data: [] });
    } catch (e) {
      queryDetails.push({ metricName: label, metricId: metric.id, sql: `ERROR: ${e.message}`, dateColumn: dateCol, labels: [], data: [] });
    }
  }

  // Build union of all dimension values
  const allDims = new Set();
  for (const { snapshot } of Object.values(snapshots)) {
    Object.keys(snapshot).forEach(d => allDims.add(d));
  }
  const dims = [...allDims].sort((a, b) => {
    // Sort by first metric's value descending
    const firstLabel = metricLabels.find(m => !m.derived)?.label;
    if (!firstLabel) return 0;
    return (snapshots[firstLabel]?.snapshot[b] || 0) - (snapshots[firstLabel]?.snapshot[a] || 0);
  });

  if (dims.length === 0) return { empty: true, pivotData: [], columns: [], queryDetails };

  // Resolve derived metrics per dimension row
  for (const { label, metric, derived } of metricLabels) {
    if (!derived) continue;

    // Auto-fetch any dependency snapshots not already in the map
    for (const depId of metric.depends_on) {
      const dep = metrics.find(m => m.id === depId);
      if (!dep?.view_name) continue; // derived dep — handled by ordering
      const depLabel = dataConfig.labels?.[metricIds.indexOf(depId)] || dep.name;
      if (snapshots[depLabel]) continue; // already fetched
      const dateCol = getDateCol(dep.view_name, xField);
      const depYField = (() => {
        const schema = schemaCache[dep.view_name] || [];
        const numeric = schema.find(c => !['DATE','TIMESTAMP','DATETIME','STRING'].includes(c.type));
        return numeric?.name || 'COUNT';
      })();
      try {
        const { snapshot, sql } = await fetchDimensionSnapshot(
          dep.view_name, dateCol, depYField, groupByDimension, channelFilter, lastNMonths
        );
        snapshots[depLabel] = { snapshot, sql, metricId: dep.id };
      } catch { snapshots[depLabel] = { snapshot: {}, sql: 'ERROR', metricId: dep.id }; }
    }

    const rowSnapshot = {};
    for (const dim of dims) {
      const depValues = {};
      for (const depId of metric.depends_on) {
        const dep = metrics.find(m => m.id === depId);
        if (!dep) continue;
        const depLabel = dataConfig.labels?.[metricIds.indexOf(depId)] || dep?.name;
        depValues[depId] = snapshots[depLabel]?.snapshot[dim] || 0;
      }
      rowSnapshot[dim] = Math.round(evaluateFormula(metric.formula, depValues) * 100) / 100;
    }
    snapshots[label] = { snapshot: rowSnapshot, sql: `Derived: ${metric.formula}`, metricId: metric.id };
    queryDetails.push({ metricName: label, metricId: metric.id, sql: `Derived: ${metric.formula}`, dateColumn: 'N/A', labels: [], data: [] });
  }

  const rawLabels = metricLabels.map(m => m.label);

  // Build pivot rows — only the metrics the user explicitly requested, nothing auto-added
  const pivotData = dims.map(dim => {
    const row = { dim };
    for (const lbl of rawLabels) {
      row[lbl] = snapshots[lbl]?.snapshot[dim] ?? null;
    }
    return row;
  });

  // Grand total row
  const totalRow = { dim: 'Grand Total' };
  for (const lbl of rawLabels) {
    const vals = pivotData.map(r => r[lbl]).filter(v => v != null);
    totalRow[lbl] = Math.round(vals.reduce((s, v) => s + v, 0) * 100) / 100;
  }

  // Build columns definition — one column per requested metric
  const columns = [{ key: 'dim', label: groupByDimension || 'Dimension', type: 'string' }];
  for (const lbl of rawLabels) {
    columns.push({ key: lbl, label: lbl, type: 'number' });
  }

  pivotData.push(totalRow);
  return { pivotData, columns, queryDetails, empty: false };
}
