// Retention triangle by cohort month. Reads the dbt model revenue.int_customer_retention_triangle.
export const RETENTION_MAX_TENURE = 11;

export function buildRetentionTriangleSql() {
  return `
    SELECT cohort_month, tenure_k, n_start, n_active, mrr_start, mrr_active
    FROM \`project-for-method-dw.revenue.int_customer_retention_triangle\`
    WHERE tenure_k <= ${RETENTION_MAX_TENURE}
    ORDER BY cohort_month, tenure_k
  `;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

// rows: [{cohort_month, tenure_k, n_start, n_active, mrr_start, mrr_active}]
// measure: 'customers' | 'mrr'
// basis:   'from_start' | 'mom'
// Returns: { cohorts, tenures, cells, averages }
//   cohorts   — [{cohort_month, n_start}] sorted desc by month
//   tenures   — [0..RETENTION_MAX_TENURE]
//   cells     — cells[cohort_month][k] = rounded % or null
//   averages  — averages[k] = mean of non-null cells at that tenure
export function toTriangle(rows, measure, basis) {
  const tenures = Array.from({ length: RETENTION_MAX_TENURE + 1 }, (_, k) => k);
  const numKey = measure === 'mrr' ? 'mrr_active' : 'n_active';
  const startKey = measure === 'mrr' ? 'mrr_start' : 'n_start';

  // Index rows by cohort_month -> Map(k -> row)
  const byCohort = new Map();
  for (const r of rows) {
    const cm = String(r.cohort_month);
    if (!byCohort.has(cm)) byCohort.set(cm, new Map());
    byCohort.get(cm).set(Number(r.tenure_k), r);
  }

  // cohorts sorted descending (most recent first)
  const cohorts = [...byCohort.keys()].sort().reverse().map((cm) => ({
    cohort_month: cm,
    n_start: byCohort.get(cm).get(0)?.n_start ?? null,
  }));

  const cells = {};
  for (const cm of byCohort.keys()) {
    const k2row = byCohort.get(cm);
    cells[cm] = tenures.map((k) => {
      const cur = k2row.get(k);
      if (!cur) return null;
      if (basis === 'mom') {
        if (k === 0) return null;
        const prev = k2row.get(k - 1);
        const denom = prev ? prev[numKey] : 0;
        return denom > 0 ? round1((cur[numKey] / denom) * 100) : null;
      }
      // from_start
      const denom = cur[startKey];
      return denom > 0 ? round1((cur[numKey] / denom) * 100) : null;
    });
  }

  const averages = tenures.map((k) => {
    const vals = cohorts.map((c) => cells[c.cohort_month][k]).filter((v) => v != null);
    return vals.length ? round1(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  });

  return { cohorts, tenures, cells, averages };
}
