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
  buildCohortAgeChurnSql,
  buildDistinctValuesSql,
  buildRateSql,
} from './netSaasSql.js';

const num = (v) => Number(v) || 0;

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

export async function fetchComponentSplit({ month, movementKind, filters, decompView, bridgeView }) {
  const { rows } = await queryBq(buildComponentSplitSql({ month, movementKind, filters, decompView, bridgeView }));
  const r = rows[0];
  if (!r) return { seats: 0, apps: 0, price: 0 };
  return { seats: num(r.seats), apps: num(r.apps), price: num(r.price) };
}

export async function fetchAccountTable({ month, drill, dim, slice, filters, bridgeView, decompView }) {
  const { rows } = await queryBq(buildAccountTableSql({ month, drill, dim, slice, filters, bridgeView, decompView }));
  return rows.map((r) => {
    const out = { ...r, deltaMrr: num(r.deltaMrr) };
    // seat/app/price columns only exist on expansion/downgrade rows.
    if (r.seat_mrr !== undefined) out.seat_mrr = num(r.seat_mrr);
    if (r.app_mrr !== undefined) out.app_mrr = num(r.app_mrr);
    if (r.price_mrr !== undefined) out.price_mrr = num(r.price_mrr);
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
