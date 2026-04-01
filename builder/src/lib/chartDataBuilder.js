import { fetchAggregatedData, fetchChartData, fetchGroupedData } from './bigquery';
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
        if (!dep?.view_name) continue;
        const dateCol = getDateCol(dep.view_name, xField);
        try {
          const agg = await fetchAggregatedData(dep.view_name, dateCol, 'COUNT', timeBucket, channelFilter, lastNMonths, endDateRule);
          const counts = {};
          agg.labels.forEach((l, idx) => { counts[l] = agg.data[idx]; });
          depAggregated[depId] = counts;
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

  if (rawDatasets.length === 0) return null;

  // Merge labels (union) and align datasets
  const allLabelsSet = new Set();
  for (const ds of rawDatasets) ds.labels.forEach(l => allLabelsSet.add(l));
  const allLabels = [...allLabelsSet].sort();
  const alignedDatasets = rawDatasets.map(ds => {
    const map = {};
    ds.labels.forEach((l, idx) => { map[l] = ds.data[idx]; });
    return { label: ds.label, data: allLabels.map(l => map[l] || 0) };
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
