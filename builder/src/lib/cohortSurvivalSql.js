// Cohort survival by first-pay vintage. Reads the dbt model revenue.int_customer_survival.
export const SURVIVAL_CHECKPOINTS = [3, 6, 9, 12, 15, 18, 21, 24];

export function buildCohortSurvivalSql() {
  return `
    SELECT vintage, tenure_k, n_start, n_alive, base_mrr, retained_mrr, net_mrr
    FROM \`project-for-method-dw.revenue.int_customer_survival\`
    ORDER BY vintage, tenure_k
  `;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

// rows: [{vintage, tenure_k, n_start, n_alive, base_mrr, retained_mrr, net_mrr}]
// measure: 'grr' | 'logo'
export function toSurvivalSeries(rows, measure) {
  const ks = SURVIVAL_CHECKPOINTS;
  const byKey = new Map(); // `${vintage}|${k}` -> row
  const vintageSet = new Set();
  for (const r of rows) {
    byKey.set(`${r.vintage}|${Number(r.tenure_k)}`, r);
    vintageSet.add(r.vintage);
  }
  const vintages = [...vintageSet].sort();
  const series = {};
  for (const v of vintages) {
    series[v] = ks.map((k) => {
      const r = byKey.get(`${v}|${k}`);
      if (!r) return null;
      if (measure === 'logo') {
        return r.n_start > 0 ? round1((r.n_alive / r.n_start) * 100) : null;
      }
      return r.base_mrr > 0 ? round1((r.retained_mrr / r.base_mrr) * 100) : null;
    });
  }
  return { ks, vintages, series };
}
