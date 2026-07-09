// builder/src/lib/intakeMixData.js
// Fetch wrappers + pure pivot/maturity helpers for the "Intake Mix" Labs page.
// SQL lives in intakeMixSql.js.
//
// CRITICAL: BigQuery's REST API returns ALL values as strings. Every numeric
// must be coerced (num); quarter/date fields stay strings. (The string 'false'
// is truthy — that exact trap shipped a bug on a sibling page.)
import { queryBq } from './bigquery.js';
import {
  buildIntakeMixSql, buildAttachByCohortSql, buildBenchmarkSql,
  buildIntakeQualitySql, buildConvertRateByBandSql, buildGrowthByCohortSql,
  buildSleepingGiantsSql, buildGiantsPeerBenchmarkSql,
} from './intakeMixSql.js';

const num = (v) => Number(v) || 0;
// BQ returns booleans as the strings 'true'/'false'; 'false' is truthy, so
// coerce via string compare, never via Boolean(). (This exact trap shipped a bug.)
const bool = (v) => v === true || v === 'true';
// A percentage guarded against a zero denominator → null (renders as '—').
const pct = (n, d) => (d > 0 ? (num(n) / num(d)) * 100 : null);

const BAND_KEYS = ['<$1M', '$1M–$5M', '$5M+', 'No data'];

// Returns [{ quarter, band, n }] — quarter/band strings, n numeric.
export async function fetchIntakeMix({ population, startDate }) {
  const { rows } = await queryBq(buildIntakeMixSql({ population, startDate }));
  return rows.map((r) => ({
    quarter: r.quarter,
    band: r.band,
    n: num(r.n),
  }));
}

// Returns [{ cohort_quarter, new_customers, attached_90d, attached_180d }].
export async function fetchAttachByCohort({ startDate }) {
  const { rows } = await queryBq(buildAttachByCohortSql({ startDate }));
  return rows.map((r) => ({
    cohort_quarter: r.cohort_quarter,
    new_customers: num(r.new_customers),
    attached_90d: num(r.attached_90d),
    attached_180d: num(r.attached_180d),
  }));
}

// Returns { n, avg_mrr, pct_5m_plus, pct_customized, pct_mnd } (single row);
// null when the query returns no rows.
export async function fetchIntakeBenchmark({ month }) {
  const { rows } = await queryBq(buildBenchmarkSql({ month }));
  if (!rows.length) return null;
  const r = rows[0];
  return {
    n: num(r.n),
    avg_mrr: num(r.avg_mrr),
    pct_5m_plus: num(r.pct_5m_plus),
    pct_customized: num(r.pct_customized),
    pct_mnd: num(r.pct_mnd),
  };
}

// ── pure helpers (unit-tested; never call Date.now() — the caller passes today) ─

function quarterLabel(iso) {
  // iso is 'YYYY-MM-DD' at a quarter start (Jan/Apr/Jul/Oct 1st).
  const [y, m] = iso.split('-').map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `Q${q} ${y}`;
}

// The ISO date (YYYY-MM-DD) of the quarter start that contains `todayIso`.
function currentQuarterStart(todayIso) {
  const [y, m] = todayIso.split('-').map(Number);
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  return `${y}-${String(qStartMonth).padStart(2, '0')}-01`;
}

// Pivot [{quarter,band,n}] → one row per quarter with per-band counts + total,
// sorted ascending. The quarter containing `todayIso` is labeled "… (QTD)".
export function toQuarterSeries(rows, todayIso) {
  const byQuarter = new Map();
  for (const r of rows || []) {
    if (!byQuarter.has(r.quarter)) {
      byQuarter.set(r.quarter, { '<$1M': 0, '$1M–$5M': 0, '$5M+': 0, 'No data': 0 });
    }
    byQuarter.get(r.quarter)[r.band] = num(r.n);
  }
  const curQ = todayIso ? currentQuarterStart(todayIso) : null;
  return [...byQuarter.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([quarter, bands]) => {
      const total = BAND_KEYS.reduce((s, k) => s + num(bands[k]), 0);
      const label = quarterLabel(quarter) + (quarter === curQ ? ' (QTD)' : '');
      return { quarter, label, total, bands };
    });
}

// A cohort is "mature" for a window once its quarter END plus the window's days
// has passed as of todayIso. cohortQuarterIso is the quarter-start ISO date.
export function attachMaturity(cohortQuarterIso, todayIso) {
  const [y, m] = cohortQuarterIso.split('-').map(Number);
  // Quarter end = last day of the third month of the quarter. JS Date month is
  // 0-based; day 0 of month (m+3) is the last day of month (m+2), i.e. the
  // quarter's final month.
  const quarterEnd = new Date(Date.UTC(y, (m - 1) + 3, 0));
  const today = new Date(todayIso + 'T00:00:00Z');
  const mature = (days) => {
    const threshold = new Date(quarterEnd.getTime());
    threshold.setUTCDate(threshold.getUTCDate() + days);
    return threshold.getTime() <= today.getTime();
  };
  return { mature90: mature(90), mature180: mature(180) };
}

// A signup/convert quarter's convert-side metrics are "mature" once the quarter
// END plus 365 days has passed as of todayIso — before that, converts are still
// arriving and the convert-side lines shouldn't be read as final. Trials-side
// lines are always mature. quarterIso is the quarter-start ISO date.
export function convertMaturity(quarterIso, todayIso) {
  const [y, m] = quarterIso.split('-').map(Number);
  const quarterEnd = new Date(Date.UTC(y, (m - 1) + 3, 0));
  const threshold = new Date(quarterEnd.getTime());
  threshold.setUTCDate(threshold.getUTCDate() + 365);
  const today = new Date(todayIso + 'T00:00:00Z');
  return threshold.getTime() <= today.getTime();
}

// ── attract → convert → grow fetchers ───────────────────────────────────────

// Quarterly trial-quality trend. Percentages computed client-side (zero
// denominators → null). Each row carries a convert_mature flag (convert-side
// fields are still maturing within ~12 months of signup); trials-side is always
// mature. Returns rows sorted ascending by quarter.
export async function fetchIntakeQuality({ startDate, todayIso }) {
  const { rows } = await queryBq(buildIntakeQualitySql({ startDate }));
  return rows.map((r) => ({
    quarter: r.quarter,
    trials: num(r.trials),
    trials_1m_plus: num(r.trials_1m_plus),
    trials_5m_plus: num(r.trials_5m_plus),
    converts: num(r.converts),
    converts_5m_plus: num(r.converts_5m_plus),
    avg_mrr_at_convert: num(r.avg_mrr_at_convert),
    pct_trials_1m: pct(r.trials_1m_plus, r.trials),
    pct_trials_5m: pct(r.trials_5m_plus, r.trials),
    pct_converts_5m: pct(r.converts_5m_plus, r.converts),
    convert_mature: todayIso ? convertMaturity(r.quarter, todayIso) : true,
  }));
}

// Trial→convert by size band, pivoted client-side to one row per quarter with a
// per-band { trials, converts, rate } map (rate = null on zero-denominator).
// Each row carries a convert_mature flag like fetchIntakeQuality.
export async function fetchConvertRateByBand({ startDate, todayIso }) {
  const { rows } = await queryBq(buildConvertRateByBandSql({ startDate }));
  const byQuarter = new Map();
  for (const r of rows || []) {
    if (!byQuarter.has(r.quarter)) byQuarter.set(r.quarter, {});
    byQuarter.get(r.quarter)[r.band] = {
      trials: num(r.trials),
      converts: num(r.converts),
      rate: pct(r.converts, r.trials),
    };
  }
  return [...byQuarter.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([quarter, bands]) => ({
      quarter,
      bands,
      convert_mature: todayIso ? convertMaturity(quarter, todayIso) : true,
    }));
}

// Growth of converts by cohort quarter × band. Coerces counts; exposes
// pct_grew, pct_gone, median_multiple. Only cohorts >= 12 months old are
// meaningful — each row is flagged `mature` (cohort end + 365d passed).
export async function fetchGrowthByCohort({ startDate, nowMonth, todayIso }) {
  const { rows } = await queryBq(buildGrowthByCohortSql({ startDate, nowMonth }));
  return rows.map((r) => ({
    cohort_quarter: r.cohort_quarter,
    band: r.band,
    converts: num(r.converts),
    grew_10pct: num(r.grew_10pct),
    gone: num(r.gone),
    pct_grew: pct(r.grew_10pct, r.converts),
    pct_gone: pct(r.gone, r.converts),
    median_multiple: num(r.median_mrr_multiple),
    mature: todayIso ? convertMaturity(r.cohort_quarter, todayIso) : true,
  }));
}

// Sleeping-giant account list. Coerces mrr/sales/tenure/account_count to
// numbers and is_us/is_customized to real booleans (BQ returns 'true'/'false'
// strings — 'false' is truthy, so never use Boolean()).
export async function fetchSleepingGiants({ nowMonth, minSales, maxMrr }) {
  const { rows } = await queryBq(buildSleepingGiantsSql({ nowMonth, minSales, maxMrr }));
  return rows.map((r) => ({
    company: r.Company,
    entity_record_id: r.EntityRecordID,
    mrr: num(r.mrr),
    sales: num(r.sales),
    is_us: bool(r.is_us),
    is_customized: bool(r.is_customized),
    l1: r.l1 || null,
    tenure_years: num(r.tenure_years),
    account_count: num(r.account_count),
  }));
}

// The engaged $5M+ peer benchmark (avg MRR of active $5M+ customers paying a
// real plan). Returns { avg_peer_mrr, n }; null when no rows.
export async function fetchGiantsPeerBenchmark({ nowMonth, minSales, minMrr }) {
  const { rows } = await queryBq(buildGiantsPeerBenchmarkSql({ nowMonth, minSales, minMrr }));
  if (!rows.length) return null;
  return { avg_peer_mrr: num(rows[0].avg_peer_mrr), n: num(rows[0].n) };
}
