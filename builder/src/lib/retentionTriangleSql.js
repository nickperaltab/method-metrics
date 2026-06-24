// Retention triangle by cohort month. Reads the dbt model revenue.int_customer_retention_triangle.
export const RETENTION_MAX_TENURE = 11;

export const FILTER_DIMS = [
  { key: 'l1',      label: 'Industry' },
  { key: 'segment', label: 'Customer type' },
  { key: 'country', label: 'Country' },
  { key: 'channel', label: 'Channel' },
];

export function buildRetentionTriangleSql() {
  return `
    SELECT cohort_month, tenure_k, l1, segment, country, channel, n_start, n_active, mrr_start, mrr_active
    FROM \`project-for-method-dw.revenue.int_customer_retention_triangle\`
    WHERE tenure_k <= ${RETENTION_MAX_TENURE}  /* display window; the model stores tenure 0–24 */
    ORDER BY cohort_month, tenure_k
  `;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

export function filterOptions(rows) {
  const out = { l1: new Set(), segment: new Set(), country: new Set(), channel: new Set() };
  for (const r of rows) for (const d of FILTER_DIMS) if (r[d.key] != null) out[d.key].add(r[d.key]);
  return Object.fromEntries(FILTER_DIMS.map((d) => [d.key, [...out[d.key]].sort()]));
}

function rowMatches(r, filters) {
  if (!filters) return true;
  for (const d of FILTER_DIMS) {
    const sel = filters[d.key];
    if (sel && sel.size > 0 && !sel.has(r[d.key])) return false;
  }
  return true;
}

// rows: [{cohort_month, tenure_k, l1, segment, country, channel, n_start, n_active, mrr_start, mrr_active}]
// measure: 'customers' | 'mrr'
// basis:   'from_start' | 'mom'
// filters: optional { l1?: Set, segment?: Set, country?: Set, channel?: Set }
// Returns: { cohorts, tenures, cells, averages }
//   cohorts   — [{cohort_month, n_start}] sorted desc by month
//   tenures   — [0..RETENTION_MAX_TENURE]
//   cells     — cells[cohort_month][k] = rounded % or null
//   averages  — averages[k] = mean of the 6 most-recent cohorts' cells at that tenure (rolling baseline)
export const ROLLING_COHORTS = 6;

export function toTriangle(rows, measure, basis, filters) {
  const tenures = Array.from({ length: RETENTION_MAX_TENURE + 1 }, (_, k) => k);
  const numKey = measure === 'mrr' ? 'mrr_active' : 'n_active';
  const startKey = measure === 'mrr' ? 'mrr_start' : 'n_start';

  // Aggregate matching rows into per-(cohort_month, tenure_k) totals.
  // agg: Map(cohort_month -> Map(k -> {n_start, n_active, mrr_start, mrr_active}))
  const agg = new Map();
  for (const r of rows) {
    if (!rowMatches(r, filters)) continue;
    const cm = String(r.cohort_month);
    const k  = Number(r.tenure_k);
    if (!agg.has(cm)) agg.set(cm, new Map());
    const k2cell = agg.get(cm);
    if (!k2cell.has(k)) {
      k2cell.set(k, { n_start: 0, n_active: 0, mrr_start: 0, mrr_active: 0 });
    }
    const cell = k2cell.get(k);
    cell.n_start    += Number(r.n_start)    || 0;
    cell.n_active   += Number(r.n_active)   || 0;
    cell.mrr_start  += Number(r.mrr_start)  || 0;
    cell.mrr_active += Number(r.mrr_active) || 0;
  }

  // cohorts sorted descending (most recent first); n_start = summed at k=0
  const cohorts = [...agg.keys()].sort().reverse().map((cm) => ({
    cohort_month: cm,
    n_start: agg.get(cm).get(0)?.n_start ?? null,
  }));

  const cells = {};
  for (const cm of agg.keys()) {
    const k2cell = agg.get(cm);
    cells[cm] = tenures.map((k) => {
      const cur = k2cell.get(k);
      if (!cur) return null;
      if (basis === 'mom') {
        if (k === 0) return null;
        const prev  = k2cell.get(k - 1);
        const denom = prev ? prev[numKey] : 0;
        return denom > 0 ? round1((cur[numKey] / denom) * 100) : null;
      }
      // from_start
      const denom = cur[startKey];
      return denom > 0 ? round1((cur[numKey] / denom) * 100) : null;
    });
  }

  // Rolling baseline: the 6 most-recent cohorts with data at each tenure.
  // `cohorts` is already sorted newest-first, so take the first ROLLING_COHORTS non-null.
  const averages = tenures.map((k) => {
    const vals = [];
    for (const c of cohorts) {
      const v = cells[c.cohort_month][k];
      if (v != null) vals.push(v);
      if (vals.length === ROLLING_COHORTS) break;
    }
    return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  return { cohorts, tenures, cells, averages };
}
