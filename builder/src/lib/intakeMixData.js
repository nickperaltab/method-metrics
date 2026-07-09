// builder/src/lib/intakeMixData.js
// Fetch wrappers + pure pivot/maturity helpers for the "Intake Mix" Labs page.
// SQL lives in intakeMixSql.js.
//
// CRITICAL: BigQuery's REST API returns ALL values as strings. Every numeric
// must be coerced (num); quarter/date fields stay strings. (The string 'false'
// is truthy — that exact trap shipped a bug on a sibling page.)
import { queryBq } from './bigquery.js';
import { buildIntakeMixSql, buildAttachByCohortSql, buildBenchmarkSql } from './intakeMixSql.js';

const num = (v) => Number(v) || 0;

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
