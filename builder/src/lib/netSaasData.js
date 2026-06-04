// builder/src/lib/netSaasData.js
// Thin async wrappers: build SQL via netSaasSql.js, execute via queryBq, return
// normalized plain objects with numeric fields coerced to Number.
//
// queryBq(sql) returns { rows, schema } where every value is a STRING (BigQuery
// REST returns all values as strings). So we unwrap `.rows` and coerce numbers.
//
// NOTE: fetchCohortAgeChurn (and its buildCohortAgeChurnSql import) are added in
// Task 9 — intentionally omitted here so this module imports cleanly.
import { queryBq } from './bigquery.js';
import {
  buildBridgeSql,
  buildDimSplitSql,
  buildComponentSplitSql,
  buildAccountTableSql,
} from './netSaasSql.js';

const num = (v) => Number(v) || 0;

export async function fetchBridge({ month, filters }) {
  const { rows } = await queryBq(buildBridgeSql({ month, filters }));
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

export async function fetchDimSplit({ month, measure, dim, filters }) {
  const { rows } = await queryBq(buildDimSplitSql({ month, measure, dim, filters }));
  return rows.map((r) => ({ bucket: r.bucket, value: num(r.value) }));
}

export async function fetchComponentSplit({ month, movementKind, filters }) {
  const { rows } = await queryBq(buildComponentSplitSql({ month, movementKind, filters }));
  const r = rows[0];
  if (!r) return { seats: 0, apps: 0, price: 0 };
  return { seats: num(r.seats), apps: num(r.apps), price: num(r.price) };
}

export async function fetchAccountTable({ month, drill, dim, slice, filters }) {
  const { rows } = await queryBq(buildAccountTableSql({ month, drill, dim, slice, filters }));
  return rows.map((r) => {
    const out = { ...r, deltaMrr: num(r.deltaMrr) };
    // seat/app/price columns only exist on expansion/downgrade rows.
    if (r.seat_mrr !== undefined) out.seat_mrr = num(r.seat_mrr);
    if (r.app_mrr !== undefined) out.app_mrr = num(r.app_mrr);
    if (r.price_mrr !== undefined) out.price_mrr = num(r.price_mrr);
    return out;
  });
}
