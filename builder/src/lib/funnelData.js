// builder/src/lib/funnelData.js
import { queryBq } from './bigquery.js';
import { buildFunnelSpineSql, buildConversionMrrSql, buildFunnelAccountTableSql } from './funnelSql.js';

const num = (v) => Number(v) || 0;

// Returns [{ segment?, trials, synced, converted }]
export async function fetchFunnelSpine({ cohortMonth, segment }) {
  const { rows } = await queryBq(buildFunnelSpineSql({ cohortMonth, segment }));
  return rows.map((r) => ({
    segment: r.segment ?? null,
    trials: num(r.trials), synced: num(r.synced), converted: num(r.converted),
  }));
}

// Returns { core_mrr, dep_mrr }
export async function fetchConversionMrr({ cohortMonth }) {
  const { rows } = await queryBq(buildConversionMrrSql({ cohortMonth }));
  const r = rows[0] || {};
  return { core_mrr: num(r.core_mrr), dep_mrr: num(r.dep_mrr) };
}

// Returns [{ entity_record_id, Company, Vertical, SignupCountry, deltaMrr }]
export async function fetchFunnelAccounts({ cohortMonth, stage }) {
  const { rows } = await queryBq(buildFunnelAccountTableSql({ cohortMonth, stage }));
  return rows.map((r) => ({ ...r, deltaMrr: num(r.deltaMrr) }));
}
