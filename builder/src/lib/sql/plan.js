import { buildSemanticSql, buildSemanticGroupedSql, buildViewAggSql } from './semantic.js';
import { wrapChartSql } from './builders.js';
import schemaCache from '../schemaCache.js';
import { isAdditiveMeasure } from '../sameWindow.js';

/**
 * Date-column resolver. Matches the existing hook's precedence:
 *   1. config.views[viewName].dateCol (explicit config override)
 *   2. First DATE/TIMESTAMP/DATETIME column in the shared schemaCache (browser-only)
 *   3. Fallback string ('SignupDate')
 */
export function resolveDateCol(config, viewName, fallback = 'SignupDate') {
  const fromConfig = config.views?.[viewName]?.dateCol;
  if (fromConfig) return fromConfig;
  const schema = schemaCache[viewName] || [];
  const fromSchema = schema.find(c => ['DATE', 'TIMESTAMP', 'DATETIME'].includes(c.type))?.name;
  return fromSchema || fallback;
}

/**
 * Matches the hook's current collector (builder/src/hooks/useScorecardData.js).
 * Does NOT iterate section.tables — preserving current behavior.
 */
export function collectMetricIds(config) {
  const ids = new Set();
  const customSqls = [];
  const weeklyMetrics = new Set();
  const groupedCharts = [];
  const yoyMetrics = new Set();
  const rawTableSections = [];

  for (const section of config.sections || []) {
    if (section.type === 'rawTable') {
      rawTableSections.push(section);
      if (typeof section.metricId === 'number') ids.add(section.metricId);
      continue;
    }
    if (section.type === 'channelTable') {
      // Fetch the base metrics grouped by the dimension; the table computes the
      // derived columns client-side and uses the derived ids only for drill-down.
      const dim = section.dimension || 'channel';
      for (const mid of section.baseMetrics || []) {
        if (typeof mid === 'number') {
          ids.add(mid);
          groupedCharts.push({ metricId: mid, dimension: dim, lastNMonths: section.lastNMonths ?? 25 });
        }
      }
      for (const col of section.columns || []) {
        if (typeof col.metricId === 'number') ids.add(col.metricId);
      }
      continue;
    }
    for (const kpi of section.kpis || []) {
      if (typeof kpi.metricId !== 'number') continue;
      ids.add(kpi.metricId);
      if (kpi.dimensionFilter && typeof kpi.dimensionFilter === 'object') {
        for (const dim of Object.keys(kpi.dimensionFilter)) {
          groupedCharts.push({
            metricId: kpi.metricId,
            dimension: dim,
            lastNMonths: section.lastNMonths ?? 13,
          });
        }
      }
    }
    for (const chart of section.charts || []) {
      for (const m of chart.metrics || []) {
        if (typeof m.id === 'number') ids.add(m.id);
        if (m.customSql) customSqls.push({ key: String(m.id), sql: m.customSql });
        if (m.dimensionFilter && typeof m.dimensionFilter === 'object' && typeof m.id === 'number') {
          for (const dim of Object.keys(m.dimensionFilter)) {
            groupedCharts.push({
              metricId: m.id,
              dimension: dim,
              lastNMonths: chart.lastNMonths ?? 13,
            });
          }
        }
      }
      if (chart.timeBucket === 'week') {
        for (const m of chart.metrics || []) {
          if (typeof m.id === 'number') weeklyMetrics.add(m.id);
        }
      }
      if (chart.groupByDimension) {
        for (const m of chart.metrics || []) {
          if (typeof m.id === 'number') {
            groupedCharts.push({
              metricId: m.id,
              dimension: chart.groupByDimension,
              lastNMonths: chart.lastNMonths ?? 13,
            });
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
  const seenGrouped = new Set();
  const dedupedGrouped = [];
  for (const g of groupedCharts) {
    const key = `${g.metricId}:${g.dimension}`;
    if (seenGrouped.has(key)) continue;
    seenGrouped.add(key);
    dedupedGrouped.push(g);
  }

  return {
    ids: [...ids],
    customSqls,
    weeklyMetrics: [...weeklyMetrics],
    groupedCharts: dedupedGrouped,
    yoyMetrics: [...yoyMetrics],
    rawTableSections,
  };
}

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

export function buildScorecardQueryPlan(config, metrics) {
  const metricsMap = new Map(metrics.map(m => [m.id, m]));
  const c = collectMetricIds(config);
  const allIds = addDerivedDeps(c.ids, metricsMap);

  // Scorecards can opt into a longer fetch window (or unlimited) by setting
  // `historyMonths` on the config. Default 13 keeps existing scorecards' fetch
  // size unchanged. `null` disables the date filter — fetch all available data.
  const historyMonths = config.historyMonths === undefined ? 13 : config.historyMonths;

  const primitives = [];
  const derived = [];
  for (const id of allIds) {
    const m = metricsMap.get(id);
    if (!m) continue;
    if (m.formula && m.depends_on?.length > 0 && !m.chart_sql && !m.view_name && !m.semantic_table) {
      derived.push({ id: m.id, formula: m.formula, depends_on: m.depends_on });
    } else {
      primitives.push(m);
    }
  }

  const queries = [];
  const expectedKeys = new Set();

  for (const metric of primitives) {
    expectedKeys.add(String(metric.id));
    if (metric.semantic_table && metric.semantic_measure && metric.semantic_date_col) {
      queries.push({
        data_key: String(metric.id),
        sql: buildSemanticSql(metric, 'month', historyMonths, null),
        kind: 'primary_month',
        meta: { metric_id: metric.id, mode: 'semantic' },
      });
    } else if (metric.chart_sql) {
      queries.push({
        data_key: String(metric.id),
        sql: wrapChartSql(metric.chart_sql, historyMonths),
        kind: 'primary_month',
        meta: { metric_id: metric.id, mode: 'chart_sql' },
      });
    } else if (metric.view_name) {
      const dateCol = resolveDateCol(config, metric.view_name);
      queries.push({
        data_key: String(metric.id),
        sql: buildViewAggSql(metric.view_name, dateCol, 'month', historyMonths),
        kind: 'primary_view',
        meta: { metric_id: metric.id, mode: 'view', view_name: metric.view_name, dateCol },
      });
    }
  }

  for (const cs of c.customSqls) {
    expectedKeys.add(cs.key);
    queries.push({
      data_key: cs.key,
      sql: wrapChartSql(cs.sql, historyMonths),
      kind: 'custom',
    });
  }

  for (const metricId of c.weeklyMetrics) {
    const metric = metricsMap.get(metricId);
    if (!metric) continue;
    const key = `${metricId}:week`;
    expectedKeys.add(key);
    if (metric.semantic_table && metric.semantic_measure && metric.semantic_date_col) {
      queries.push({
        data_key: key,
        sql: buildSemanticSql(metric, 'week', 3, null),
        kind: 'weekly',
        meta: { metric_id: metricId },
      });
    } else if (metric.view_name) {
      const dateCol = resolveDateCol(config, metric.view_name);
      queries.push({
        data_key: key,
        sql: buildViewAggSql(metric.view_name, dateCol, 'week', 3),
        kind: 'weekly',
        meta: { metric_id: metricId, view_name: metric.view_name, dateCol },
      });
    }
  }

  // Expand grouped requests: for derived metrics, fetch each dependency grouped.
  // The loader computes the derivative per (period, dim_value) from those grouped deps.
  const expandedGrouped = [];
  const seenExpanded = new Set();
  const derivedGroupedRequests = []; // for expectedKeys tracking
  for (const g of c.groupedCharts) {
    const metric = metricsMap.get(g.metricId);
    if (!metric) continue;
    const pushFetch = (id, dim, lastN) => {
      const k = `${id}:${dim}`;
      if (seenExpanded.has(k)) return;
      seenExpanded.add(k);
      expandedGrouped.push({ metricId: id, dimension: dim, lastNMonths: lastN });
    };
    if (metric.semantic_table) {
      pushFetch(g.metricId, g.dimension, g.lastNMonths);
    } else if (metric.formula && Array.isArray(metric.depends_on)) {
      // Derivative: register grouped fetches for each dependency.
      // The derivative's own grouped result is computed in load.js.
      derivedGroupedRequests.push({ metricId: g.metricId, dimension: g.dimension });
      expectedKeys.add(`${g.metricId}:grouped:${g.dimension}`);
      for (const depId of metric.depends_on) {
        pushFetch(depId, g.dimension, g.lastNMonths);
      }
    }
  }

  for (const g of expandedGrouped) {
    const metric = metricsMap.get(g.metricId);
    if (!metric?.semantic_table) continue;
    const key = `${g.metricId}:grouped:${g.dimension}`;
    expectedKeys.add(key);
    queries.push({
      data_key: key,
      sql: buildSemanticGroupedSql(metric, g.dimension, 'month', g.lastNMonths),
      kind: 'grouped',
      meta: { metric_id: g.metricId, dimension: g.dimension },
    });
  }

  // Day-grain fetch (last 3 months) for every semantic primitive. This series
  // already existed for other consumers; the same-window delta baseline reads
  // it too, which is why no extra query is needed. See lib/sameWindow.js.
  const sameWindowIds = [];
  for (const metric of primitives) {
    if (!metric.semantic_table || !metric.semantic_measure || !metric.semantic_date_col) continue;
    const key = `${metric.id}:day`;
    expectedKeys.add(key);
    queries.push({
      data_key: key,
      sql: buildSemanticSql(metric, 'day', 3, null),
      kind: 'daily_90d',
      meta: { metric_id: metric.id },
    });
    // Only additive measures can be re-summed over an arbitrary day window.
    if (isAdditiveMeasure(metric.semantic_measure)) sameWindowIds.push(metric.id);
  }

  for (const metricId of c.yoyMetrics) {
    const metric = metricsMap.get(metricId);
    if (!metric?.semantic_table) continue;
    const key = `${metricId}:yoy`;
    expectedKeys.add(key);
    queries.push({
      data_key: key,
      sql: buildSemanticSql(metric, 'month', 36, null),
      kind: 'yoy',
      meta: { metric_id: metricId },
    });
  }

  for (const section of c.rawTableSections) {
    let cols, table, orderCol;
    if (section.viewName) {
      // Escape hatch: point a rawTable straight at a BQ view (no registered
      // metric needed). Use a string metricId so collectMetricIds skips it.
      table = `\`project-for-method-dw.revenue.${section.viewName}\``;
      cols = (section.columns || ['*']).join(', ');
      orderCol = section.dateCol || 'month';
    } else {
      const metric = metricsMap.get(section.metricId);
      if (!metric?.semantic_table) continue;
      cols = (section.columns || [metric.semantic_date_col, 'CompanyAccount']).join(', ');
      table = `\`project-for-method-dw.revenue.${metric.semantic_table}\``;
      orderCol = metric.semantic_date_col;
    }
    const limit = section.limit || 100;
    const key = `${section.metricId}:raw`;
    expectedKeys.add(key);
    queries.push({
      data_key: key,
      sql: `SELECT ${cols} FROM ${table} ORDER BY ${orderCol} DESC LIMIT ${limit}`,
      kind: 'raw_table',
      meta: { metric_id: section.metricId, columns: section.columns },
    });
  }

  for (const d of derived) expectedKeys.add(String(d.id));

  return { queries, derived, expectedKeys: [...expectedKeys], derivedGroupedRequests, sameWindowIds };
}
