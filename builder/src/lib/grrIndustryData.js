// builder/src/lib/grrIndustryData.js
// Fetch wrappers for the GRR by Industry page. SQL lives in grrIndustrySql.js;
// the headline rate reuses netSaasSql's buildRateSql (canonical metric view).
import { queryBq } from './bigquery.js';
import { buildRateSql } from './netSaasSql.js';
import {
  buildGrrBySegmentSql, buildGrrAccountsSql, buildGrrTrendSql, buildCustomerAccountsSql,
} from './grrIndustrySql.js';

const num = (v) => Number(v) || 0;

// Returns [{ segment, start_mrr, churn_mrr, downgrade_mrr, grr, customers }]
export async function fetchGrrSegments({ month, dimension, filters, customization }) {
  const { rows } = await queryBq(buildGrrBySegmentSql({ month, dimension, filters, customization }));
  return rows.map((r) => ({
    segment: r.segment,
    start_mrr: num(r.start_mrr),
    churn_mrr: num(r.churn_mrr),
    downgrade_mrr: num(r.downgrade_mrr),
    grr: r.grr == null ? null : Number(r.grr),
    customers: num(r.customers),
  }));
}

// Returns account rows with labels + reasoning (already sorted by lost $ in SQL).
export async function fetchGrrAccounts({ month, filters, customization }) {
  const { rows } = await queryBq(buildGrrAccountsSql({ month, filters, customization }));
  return rows.map((r) => ({
    ...r,
    start_mrr: num(r.start_mrr),
    churn_mrr: num(r.churn_mrr),
    downgrade_mrr: num(r.downgrade_mrr),
    confidence: r.confidence == null ? null : Number(r.confidence),
    // BQ's REST API returns BOOLs as the strings 'true'/'false' — and 'false'
    // is truthy, which made the multi-client badge render on every row.
    is_multi_client: r.is_multi_client === 'true' || r.is_multi_client === true,
  }));
}

// Returns the constituent accounts behind one billing entity, each with its own
// label + reasoning — the per-entity drill that makes a multi-client biller legible.
export async function fetchCustomerAccounts({ entityRecordId }) {
  const { rows } = await queryBq(buildCustomerAccountsSql({ entityRecordId }));
  return rows.map((r) => ({
    ...r,
    confidence: r.confidence == null ? null : Number(r.confidence),
  }));
}

// Returns [{ month, segment, start_mrr, customers, grr }] — trailing-12m L1 trend rows.
export async function fetchGrrTrend({ month, months = 12, customization }) {
  const { rows } = await queryBq(buildGrrTrendSql({ endMonth: month, months, customization }));
  return rows.map((r) => ({
    month: r.month,
    segment: r.segment,
    start_mrr: num(r.start_mrr),
    customers: num(r.customers),
    grr: r.grr == null ? null : Number(r.grr),
  }));
}

// Canonical all-up annual GRR from revenue_metrics — never recomputed here.
export async function fetchAnnualGrrHeadline({ month }) {
  const { rows } = await queryBq(buildRateSql({ metric: 'v_metric__annual_grr', period: month }));
  return rows.length && rows[0].value != null ? Number(rows[0].value) : null;
}

// All-up GRR recombined from the page's own L1 segment rows (Unclassified
// included). The page compares this to fetchAnnualGrrHeadline and surfaces a
// visible warning on divergence — the spec's parity gate.
export function computeAllUpGrr(segments) {
  const start = segments.reduce((s, r) => s + num(r.start_mrr), 0);
  const lost = segments.reduce((s, r) => s + num(r.churn_mrr) + num(r.downgrade_mrr), 0);
  return start > 0 ? (start - lost) / start : null;
}
