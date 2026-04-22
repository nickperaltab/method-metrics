import { buildScorecardQueryPlan } from './plan.js';
import { buildBatchSql, splitBatchResults } from './builders.js';
import { evaluateFormula } from '../sanitize.js';

const BATCH_CHUNK_SIZE = 6;
const BATCHABLE_KINDS = new Set(['primary_month', 'primary_view', 'custom', 'weekly', 'daily_90d', 'yoy']);

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function topoSortDerived(derived) {
  if (derived.length <= 1) return [...derived];
  const idSet = new Set(derived.map(d => d.id));
  const inDegree = new Map(derived.map(d => [d.id, 0]));
  const adj = new Map(derived.map(d => [d.id, []]));
  for (const d of derived) {
    for (const depId of d.depends_on || []) {
      if (idSet.has(depId)) {
        adj.get(depId).push(d.id);
        inDegree.set(d.id, inDegree.get(d.id) + 1);
      }
    }
  }
  const queue = derived.filter(d => inDegree.get(d.id) === 0).map(d => d.id);
  const byId = new Map(derived.map(d => [d.id, d]));
  const out = [];
  while (queue.length > 0) {
    const id = queue.shift();
    out.push(byId.get(id));
    for (const n of adj.get(id)) {
      inDegree.set(n, inDegree.get(n) - 1);
      if (inDegree.get(n) === 0) queue.push(n);
    }
  }
  return out;
}

/**
 * Execute a scorecard's query plan and return a populated dataMap.
 *
 * @param {Object} params
 * @param {Object} params.config - Scorecard config
 * @param {Object[]} params.metrics - All metrics (from Supabase)
 * @param {(sql: string) => Promise<{rows: Object[]}>} params.query
 * @param {(progress: {loaded, total}) => void} [params.onProgress]
 * @param {{aborted: boolean}} [params.signal]
 * @returns {Promise<{ dataMap: Map, errors: Array<{data_key, message}>, plan }>}
 */
export async function loadScorecardData({ config, metrics, query, onProgress, signal }) {
  const aborted = () => signal?.aborted === true;
  const dataMap = new Map();
  const errors = [];

  if (aborted()) return { dataMap, errors, plan: null };

  const plan = buildScorecardQueryPlan(config, metrics);

  const batchable = plan.queries.filter(q => BATCHABLE_KINDS.has(q.kind));
  const individual = plan.queries.filter(q => !BATCHABLE_KINDS.has(q.kind));
  const batches = chunk(batchable, BATCH_CHUNK_SIZE);

  const totalSteps = batches.length + individual.length;
  let loaded = 0;
  const bump = () => { loaded++; onProgress?.({ loaded, total: totalSteps }); };

  await Promise.all(batches.map(async (batch) => {
    if (aborted()) return;
    const sql = buildBatchSql(batch.map(q => ({ key: q.data_key, sql: q.sql })));
    const keyMap = new Map(batch.map(q => [q.data_key, q.data_key]));
    try {
      const res = await query(sql);
      const split = splitBatchResults(res.rows || [], keyMap);
      for (const [key, rows] of split) {
        storePrimary(dataMap, key, rows);
      }
      for (const q of batch) {
        if (!hasKey(dataMap, q.data_key)) storePrimary(dataMap, q.data_key, []);
      }
    } catch (_e) {
      for (const q of batch) {
        if (aborted()) return;
        try {
          const res = await query(q.sql);
          storePrimary(dataMap, q.data_key, res.rows || []);
        } catch (e2) {
          storePrimary(dataMap, q.data_key, []);
          errors.push({ data_key: q.data_key, message: e2.message });
        }
      }
    }
    bump();
  }));

  if (aborted()) return { dataMap, errors, plan };

  await Promise.all(individual.map(async (q) => {
    if (aborted()) return;
    try {
      const res = await query(q.sql);
      if (q.kind === 'grouped') {
        storeGrouped(dataMap, q.data_key, res.rows || []);
      } else if (q.kind === 'raw_table') {
        storeRaw(dataMap, q.data_key, res.rows || [], q.meta?.columns);
      } else {
        storePrimary(dataMap, q.data_key, res.rows || []);
      }
    } catch (e) {
      setKey(dataMap, q.data_key, null);
      errors.push({ data_key: q.data_key, message: e.message });
    }
    bump();
  }));

  if (aborted()) return { dataMap, errors, plan };

  for (const d of topoSortDerived(plan.derived)) {
    try {
      const depData = {};
      for (const depId of d.depends_on) {
        const entry = dataMap.get(depId);
        const counts = {};
        if (entry && Array.isArray(entry.labels)) {
          entry.labels.forEach((l, i) => { counts[l] = entry.data[i]; });
        }
        depData[depId] = counts;
      }
      const allLabels = new Set();
      for (const counts of Object.values(depData)) Object.keys(counts).forEach(k => allLabels.add(k));
      const sorted = [...allLabels].sort();
      const labels = [];
      const data = [];
      for (const lbl of sorted) {
        const vals = {};
        for (const depId of d.depends_on) vals[depId] = depData[depId]?.[lbl] || 0;
        data.push(Math.round(evaluateFormula(d.formula, vals) * 100) / 100);
        labels.push(lbl);
      }
      dataMap.set(d.id, labels.length > 0 ? { labels, data } : null);
    } catch (e) {
      dataMap.set(d.id, null);
      errors.push({ data_key: String(d.id), message: e.message });
    }
  }

  // Compute grouped derivatives: for each (derived metric × dimension) requested,
  // use the grouped payloads of its deps and evaluate the formula at (period × dim_value).
  const derivedById = new Map(plan.derived.map(d => [d.id, d]));
  for (const req of plan.derivedGroupedRequests || []) {
    const d = derivedById.get(req.metricId);
    if (!d) continue;
    try {
      const depGrouped = {};
      for (const depId of d.depends_on) {
        depGrouped[depId] = dataMap.get(`${depId}:grouped:${req.dimension}`);
      }
      const labelSet = new Set();
      const dimSet = new Set();
      for (const g of Object.values(depGrouped)) {
        if (!g?.seriesMap) continue;
        (g.labels || []).forEach(l => labelSet.add(l));
        Object.keys(g.seriesMap).forEach(d => dimSet.add(d));
      }
      if (labelSet.size === 0 || dimSet.size === 0) {
        setKey(dataMap, `${req.metricId}:grouped:${req.dimension}`, null);
        continue;
      }
      const labels = [...labelSet].sort();
      const seriesMap = {};
      for (const dimValue of dimSet) {
        const arr = [];
        for (const lbl of labels) {
          const vals = {};
          for (const depId of d.depends_on) {
            const g = depGrouped[depId];
            if (!g?.seriesMap?.[dimValue]) { vals[depId] = 0; continue; }
            const idx = (g.labels || []).indexOf(lbl);
            vals[depId] = idx >= 0 ? (g.seriesMap[dimValue][idx] || 0) : 0;
          }
          arr.push(Math.round(evaluateFormula(d.formula, vals) * 100) / 100);
        }
        seriesMap[dimValue] = arr;
      }
      setKey(dataMap, `${req.metricId}:grouped:${req.dimension}`, { labels, seriesMap });
    } catch (e) {
      setKey(dataMap, `${req.metricId}:grouped:${req.dimension}`, null);
      errors.push({ data_key: `${req.metricId}:grouped:${req.dimension}`, message: e.message });
    }
  }

  return { dataMap, errors, plan };
}

function keyOf(dataKey) {
  return /^\d+$/.test(dataKey) ? Number(dataKey) : dataKey;
}

function setKey(map, dataKey, value) {
  map.set(keyOf(dataKey), value);
}

function hasKey(map, dataKey) {
  return map.has(keyOf(dataKey));
}

function storePrimary(map, dataKey, rows) {
  if (!rows || rows.length === 0) {
    setKey(map, dataKey, null);
    return;
  }
  setKey(map, dataKey, {
    labels: rows.map(r => r.period),
    data: rows.map(r => Number(r.value) || 0),
  });
}

function storeGrouped(map, dataKey, rows) {
  if (!rows || rows.length === 0) {
    setKey(map, dataKey, null);
    return;
  }
  const labels = [...new Set(rows.map(r => r.period))].sort();
  const seriesMap = {};
  for (const row of rows) {
    if (!seriesMap[row.dimension]) seriesMap[row.dimension] = {};
    seriesMap[row.dimension][row.period] = Number(row.value) || 0;
  }
  const aligned = {};
  for (const [dim, byPeriod] of Object.entries(seriesMap)) {
    aligned[dim] = labels.map(l => byPeriod[l] ?? null);
  }
  setKey(map, dataKey, { labels, seriesMap: aligned });
}

function storeRaw(map, dataKey, rows, columns) {
  setKey(map, dataKey, { rows, columns });
}
