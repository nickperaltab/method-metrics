// builder/src/lib/netSaasData.js
// Thin async wrappers: build SQL via netSaasSql.js, execute via queryBq, return
// normalized plain objects with numeric fields coerced to Number.
//
// queryBq(sql) returns { rows, schema } where every value is a STRING (BigQuery
// REST returns all values as strings). So we unwrap `.rows` and coerce numbers.
//
import { queryBq } from './bigquery.js';
import {
  buildBridgeSql,
  buildDimSplitSql,
  buildComponentSplitSql,
  buildAccountTableSql,
  buildBookSplitSql,
  buildBookHeatmapSql,
  buildHealthChurnBenchmarkSql,
  buildCohortAgeChurnSql,
  buildDistinctValuesSql,
  buildRateSql,
  buildAccountHistorySql,
  buildAccountLifecycleSql,
  buildAccountActivitiesSql,
  buildAccountCasesSql,
} from './netSaasSql.js';

const num = (v) => Number(v) || 0;

// Strip HTML tags + collapse whitespace + decode the few common entities that
// show up in Method's rich-text Comments/Description bodies. Display-only.
function stripHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function fetchBridge({ month, filters, bridgeView }) {
  const { rows } = await queryBq(buildBridgeSql({ month, filters, bridgeView }));
  const r = rows[0];
  if (!r) return null;
  return {
    start_mrr: num(r.start_mrr),
    new_mrr: num(r.new_mrr),
    expansion_mrr: num(r.expansion_mrr),
    downgrade_mrr: num(r.downgrade_mrr),
    churn_mrr: num(r.churn_mrr),
    end_mrr: num(r.end_mrr),
  };
}

// Headline GRR/NRR % from the validated metric view — null when no row exists
// for the period (so callers can distinguish "no data" from a real 0 rate).
export async function fetchRate({ metric, period }) {
  const { rows } = await queryBq(buildRateSql({ metric, period }));
  const v = rows[0]?.value;
  return v == null ? null : Number(v);
}

export async function fetchDimSplit({ month, measure, dim, filters, bridgeView }) {
  const { rows } = await queryBq(buildDimSplitSql({ month, measure, dim, filters, bridgeView }));
  return rows.map((r) => ({ bucket: r.bucket, value: num(r.value) }));
}

export async function fetchCohortAgeChurn({ month, filters, bridgeView }) {
  const { rows } = await queryBq(buildCohortAgeChurnSql({ month, filters, bridgeView }));
  return rows.map((r) => ({ bucket: r.bucket, value: num(r.value) }));
}

// End-MRR "current book" split by health tier: MRR + account count per tier.
export async function fetchBookSplit({ month, filters, bridgeView, minAgeMonths }) {
  const { rows } = await queryBq(buildBookSplitSql({ month, filters, bridgeView, minAgeMonths }));
  return rows.map((r) => ({ bucket: r.bucket, value: num(r.value), accounts: num(r.accounts) }));
}

// End-MRR heatmap: health tier × license band, account count + MRR per cell.
export async function fetchBookHeatmap({ month, filters, bridgeView, minAgeMonths, excludePS, excludeDEP }) {
  const { rows } = await queryBq(buildBookHeatmapSql({ month, filters, bridgeView, minAgeMonths, excludePS, excludeDEP }));
  return rows.map((r) => ({ tier: r.tier, sizeBand: r.mrr_band, accounts: num(r.accounts), mrr: num(r.mrr) }));
}

// Trailing-year churn rate per health tier (the correlation). Returns a map
// { [tier]: { churn, n } } for annotating the heatmap rows.
export async function fetchHealthChurnBenchmark({ month, filters, bridgeView, minAgeMonths, excludePS, excludeDEP }) {
  const { rows } = await queryBq(buildHealthChurnBenchmarkSql({ month, filters, bridgeView, minAgeMonths, excludePS, excludeDEP }));
  const out = {};
  for (const r of rows) out[r.tier] = { churn: num(r.churn_pct), n: num(r.n) };
  return out;
}

export async function fetchComponentSplit({ month, movementKind, filters, decompView, bridgeView }) {
  const { rows } = await queryBq(buildComponentSplitSql({ month, movementKind, filters, decompView, bridgeView }));
  const r = rows[0];
  if (!r) return { seats: 0, apps: 0, price: 0 };
  return { seats: num(r.seats), apps: num(r.apps), price: num(r.price) };
}

export async function fetchAccountTable({ month, drill, dim, slice, filters, bridgeView, decompView, minAgeMonths, sizeBand, excludePS, excludeDEP }) {
  const { rows } = await queryBq(buildAccountTableSql({ month, drill, dim, slice, filters, bridgeView, decompView, minAgeMonths, sizeBand, excludePS, excludeDEP }));
  return rows.map((r) => {
    const out = { ...r, deltaMrr: num(r.deltaMrr) };
    // seat/app/price columns only exist on expansion/downgrade rows.
    if (r.seat_mrr !== undefined) out.seat_mrr = num(r.seat_mrr);
    if (r.app_mrr !== undefined) out.app_mrr = num(r.app_mrr);
    if (r.price_mrr !== undefined) out.price_mrr = num(r.price_mrr);
    // health_score / seats / age_mo only exist on book (current-book) rows.
    if (r.health_score !== undefined) out.health_score = r.health_score == null ? null : num(r.health_score);
    if (r.seats !== undefined) out.seats = num(r.seats);
    if (r.trend6 !== undefined) out.trend6 = r.trend6 == null ? null : num(r.trend6);
    if (r.age_mo !== undefined) out.age_mo = num(r.age_mo);
    return out;
  });
}

// Distinct values per filter dim — reference data, values are strings (labels),
// no numeric coercion. Returns { [dim]: string[] }, one array per requested dim.
export async function fetchFilterOptions({ dims, months = 24, bridgeView }) {
  const { rows } = await queryBq(buildDistinctValuesSql({ dims, months, bridgeView }));
  const out = {};
  for (const d of dims) out[d] = [];
  for (const r of rows) {
    if (out[r.dim]) out[r.dim].push(r.val);
  }
  return out;
}

// Per-account monthly MRR / licenses / apps history for the L4 detail view.
export async function fetchAccountHistory({ entityRecordId }) {
  const { rows } = await queryBq(buildAccountHistorySql({ entityRecordId }));
  return rows.map((r) => ({ month: r.month, mrr: num(r.mrr), licenses: num(r.licenses), apps: num(r.apps) }));
}

// Lifecycle milestone dates for one account — null when absent.
export async function fetchAccountLifecycle({ entityRecordId }) {
  const { rows } = await queryBq(buildAccountLifecycleSql({ entityRecordId }));
  const r = rows[0] || {};
  return { signup: r.signup || null, firstSync: r.first_sync || null, firstInvoice: r.first_invoice || null };
}

// Account timeline: activities + cases merged, newest first, bodies cleaned for
// reading. Each item: { id, kind, date, title, meta, body }.
export async function fetchAccountTimeline({ entityRecordId }) {
  const [acts, cases] = await Promise.all([
    queryBq(buildAccountActivitiesSql({ entityRecordId })),
    queryBq(buildAccountCasesSql({ entityRecordId })),
  ]);
  const items = [
    ...acts.rows.map((r) => ({
      id: `a${r.record_id}`, kind: 'activity', date: r.date,
      title: r.activity_type || 'Activity', meta: '', body: stripHtml(r.body),
    })),
    ...cases.rows.map((r) => ({
      id: `c${r.record_id}`, kind: 'case', date: r.date,
      title: r.subject || 'Case', meta: [r.status, r.category].filter(Boolean).join(' · '),
      body: stripHtml(r.body),
    })),
  ].filter((x) => x.date);
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return items;
}
