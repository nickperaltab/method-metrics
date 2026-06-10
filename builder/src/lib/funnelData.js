// builder/src/lib/funnelData.js
import { queryBq } from './bigquery.js';
import { buildFunnelSpineSql, buildConversionMrrSql, buildFunnelAccountTableSql } from './funnelSql.js';

const num = (v) => Number(v) || 0;

// Returns [{ segment?, trials, synced, converted }]
export async function fetchFunnelSpine({ startDate, endDate, segment }) {
  const { rows } = await queryBq(buildFunnelSpineSql({ startDate, endDate, segment }));
  return rows.map((r) => ({
    segment: r.segment ?? null,
    trials: num(r.trials), synced: num(r.synced), converted: num(r.converted),
  }));
}

// Returns { core_mrr, dep_mrr }
export async function fetchConversionMrr({ startDate, endDate }) {
  const { rows } = await queryBq(buildConversionMrrSql({ startDate, endDate }));
  const r = rows[0] || {};
  return { core_mrr: num(r.core_mrr), dep_mrr: num(r.dep_mrr) };
}

// Returns [{ entity_record_id, Company, Vertical, SignupCountry, deltaMrr }]
export async function fetchFunnelAccounts({ startDate, endDate, stage }) {
  const { rows } = await queryBq(buildFunnelAccountTableSql({ startDate, endDate, stage }));
  return rows.map((r) => ({ ...r, deltaMrr: num(r.deltaMrr) }));
}
