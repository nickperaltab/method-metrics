// builder/src/lib/intakeMixSql.js
// Pure SQL builders for the "Intake Mix" Labs page. No I/O. Unit-tested.
//
// Purpose: quarterly mix of new business (trials + new paying customers) by
// business size, benchmarked against the live top-30%-by-MRR customer
// fingerprint, plus customization attach per cohort. Answers: "are we
// acquiring the profile that retains and expands?"
//
// Sources:
//   revenue.Account                  — CustDatAnnualSales (synced QB invoice
//                                       volume ×12), deduped to EntityRecordID
//                                       with MAX. Business-size input.
//   revenue.int_motion_funnel        — trials (signup_month), one row per signup.
//   revenue.int_customers            — new paying customers (IsNew flag, Month).
//   revenue.int_customer_proserv     — is_customized + first_ps_date (customization).
//   revenue.int_customer_annual_mrr  — StartMRR per entity/month, benchmark base.
//   v7_classification.v_entity_primary_label — one row per customer_record_id
//                                       (= EntityRecordID); l1 industry, for the
//                                       benchmark's % Manufacturing & Distribution.
//
// Size-band gotcha: a customer missing from Account entirely must land in
// 'No data', never NULL — the band expression COALESCEs to 'No data' AFTER the
// LEFT JOIN too (a validated bug).

const ACCOUNT_TABLE = '`project-for-method-dw.revenue.Account`';
const MOTION_FUNNEL_TABLE = '`project-for-method-dw.revenue.int_motion_funnel`';
const CUSTOMERS_TABLE = '`project-for-method-dw.revenue.int_customers`';
const CUSTOMER_MRR_TABLE = '`project-for-method-dw.revenue.int_customer_mrr`';
const PROSERV_TABLE = '`project-for-method-dw.revenue.int_customer_proserv`';
const ANNUAL_MRR_TABLE = '`project-for-method-dw.revenue.int_customer_annual_mrr`';
const LABEL_VIEW = '`project-for-method-dw.v7_classification.v_entity_primary_label`';

export const INTAKE_POPULATIONS = ['trials', 'new_customers'];

// BigQuery string-literal escape: double any single quote.
function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

// The size-band CTE, shared by the two intake builders. Deduplicates Account to
// one row per EntityRecordID (MAX of cleaned CustDatAnnualSales), then bands.
// CustDatAnnualSales cleaned to BETWEEN 1 AND 1e10 (junk/zero/negative → NULL).
// Bands: '<$1M', '$1M–$5M', '$5M+', and 'No data' for NULL.
const BANDED_CTE = `banded AS (
    SELECT
      EntityRecordID,
      CASE
        WHEN annual_sales IS NULL THEN 'No data'
        WHEN annual_sales < 1000000 THEN '<$1M'
        WHEN annual_sales < 5000000 THEN '$1M–$5M'
        ELSE '$5M+'
      END AS band
    FROM (
      SELECT EntityRecordID, MAX(IF(CustDatAnnualSales BETWEEN 1 AND 1e10, CustDatAnnualSales, NULL)) AS annual_sales
      FROM ${ACCOUNT_TABLE}
      GROUP BY 1
    )
  )`;

// Quarterly mix of new business by business size for one population.
// population ∈ INTAKE_POPULATIONS; throws otherwise (injection guard).
// Note: COALESCE(b.band, 'No data') AS band — a customer missing from Account
// entirely (LEFT JOIN miss) lands in 'No data', never NULL.
export function buildIntakeMixSql({ population, startDate = '2024-01-01' }) {
  if (!INTAKE_POPULATIONS.includes(population)) {
    throw new Error(`Unknown intake population: ${population}`);
  }
  if (population === 'trials') {
    return `WITH ${BANDED_CTE}
SELECT
  DATE_TRUNC(f.signup_month, QUARTER) AS quarter,
  COALESCE(b.band, 'No data') AS band,
  COUNT(*) AS n
FROM ${MOTION_FUNNEL_TABLE} f
LEFT JOIN banded b ON b.EntityRecordID = f.EntityRecordID
WHERE f.signup_month >= ${sqlStr(startDate)}
GROUP BY quarter, band
ORDER BY quarter, band`.trimEnd();
  }
  // new_customers
  return `WITH ${BANDED_CTE}
SELECT
  DATE_TRUNC(c.Month, QUARTER) AS quarter,
  COALESCE(b.band, 'No data') AS band,
  COUNT(DISTINCT c.EntityRecordID) AS n
FROM ${CUSTOMERS_TABLE} c
LEFT JOIN banded b ON b.EntityRecordID = c.EntityRecordID
WHERE c.IsNew AND c.Month >= ${sqlStr(startDate)}
GROUP BY quarter, band
ORDER BY quarter, band`.trimEnd();
}

// Customization attach per first-pay cohort quarter: of the customers who first
// paid in quarter Q, how many bought project hours within 90/180 days of their
// first payment. first_pay = MIN(Month) per entity in int_customers.
export function buildAttachByCohortSql({ startDate = '2024-01-01' }) {
  return `WITH first_pay AS (
    SELECT EntityRecordID, MIN(Month) AS fp
    FROM ${CUSTOMERS_TABLE}
    GROUP BY 1
  )
SELECT
  DATE_TRUNC(fp.fp, QUARTER) AS cohort_quarter,
  COUNT(*) AS new_customers,
  COUNTIF(p.first_ps_date IS NOT NULL AND DATE_DIFF(p.first_ps_date, fp.fp, DAY) <= 90) AS attached_90d,
  COUNTIF(p.first_ps_date IS NOT NULL AND DATE_DIFF(p.first_ps_date, fp.fp, DAY) <= 180) AS attached_180d
FROM first_pay fp
LEFT JOIN ${PROSERV_TABLE} p ON p.EntityRecordID = fp.EntityRecordID
WHERE fp.fp >= ${sqlStr(startDate)}
GROUP BY 1
ORDER BY 1`.trimEnd();
}

// The live top-30%-by-MRR customer fingerprint for one month (the latest
// complete month, passed in). Ranks paying customers by MRR desc, takes the top
// 30% by ROW_NUMBER()/COUNT(*), and returns the profile that new intake is
// benchmarked against.
//
// Validated live result for month = '2026-06-01':
//   n = 949, avg_mrr = 576, pct_5m_plus = 42.5, pct_customized = 84, pct_mnd = 47.8
export function buildBenchmarkSql({ month }) {
  return `WITH cust AS (
    SELECT EntityRecordID, SUM(StartMRR) AS mrr
    FROM ${ANNUAL_MRR_TABLE}
    WHERE Month = ${sqlStr(month)} AND StartMRR > 0
    GROUP BY 1
  ),
  ranked AS (
    SELECT EntityRecordID, mrr,
      SAFE_DIVIDE(ROW_NUMBER() OVER (ORDER BY mrr DESC), COUNT(*) OVER ()) AS pr
    FROM cust
  ),
  top30 AS (
    SELECT EntityRecordID, mrr FROM ranked WHERE pr <= 0.30
  ),
  sized AS (
    SELECT EntityRecordID,
      MAX(IF(CustDatAnnualSales BETWEEN 1 AND 1e10, CustDatAnnualSales, NULL)) AS annual_sales
    FROM ${ACCOUNT_TABLE}
    GROUP BY 1
  )
SELECT
  COUNT(*) AS n,
  ROUND(AVG(t.mrr)) AS avg_mrr,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(s.annual_sales >= 5000000), COUNT(*)), 1) AS pct_5m_plus,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(COALESCE(p.is_customized, FALSE)), COUNT(*)), 1) AS pct_customized,
  ROUND(100 * SAFE_DIVIDE(COUNTIF(v.l1 = 'Manufacturing & Distribution'), COUNT(*)), 1) AS pct_mnd
FROM top30 t
LEFT JOIN sized s ON s.EntityRecordID = t.EntityRecordID
LEFT JOIN ${PROSERV_TABLE} p ON p.EntityRecordID = t.EntityRecordID
LEFT JOIN ${LABEL_VIEW} v ON v.customer_record_id = t.EntityRecordID`.trimEnd();
}

// The size-band CASE on a per-entity cleaned sales column, shared by the
// convert-rate and growth builders. `salesCol` is the aliased column reference
// (e.g. 'a.sales') already cleaned to BETWEEN 1 AND 1e10 upstream.
function bandCase(salesCol) {
  return `CASE
    WHEN ${salesCol} IS NULL THEN 'No data'
    WHEN ${salesCol} < 1000000 THEN '<$1M'
    WHEN ${salesCol} < 5000000 THEN '$1M–$5M'
    ELSE '$5M+'
  END`;
}

// The deduped-Account CTE keyed on EntityRecordID → cleaned `sales`, shared by
// the quality / convert / growth / giants builders (each references a.sales).
const ACCT_SALES_CTE = `acct AS (
    SELECT EntityRecordID, MAX(IF(CustDatAnnualSales BETWEEN 1 AND 1e10, CustDatAnnualSales, NULL)) AS sales
    FROM ${ACCOUNT_TABLE}
    GROUP BY 1
  )`;

// "Are we attracting better customers?" — quarterly trial-quality trend.
// Trials-side counts (trials, trials_1m_plus, trials_5m_plus) are always mature.
// Convert-side counts (converts, converts_5m_plus, avg_mrr_at_convert) are only
// meaningful once a signup quarter has had ~12 months to convert — the data
// layer flags immature quarters via convertMaturity(). Percentages are computed
// client-side so a zero-denominator quarter can't divide.
export function buildIntakeQualitySql({ startDate = '2024-01-01' }) {
  return `WITH ${ACCT_SALES_CTE}
SELECT
  DATE_TRUNC(f.signup_month, QUARTER) AS quarter,
  COUNT(*) AS trials,
  COUNTIF(a.sales >= 1000000) AS trials_1m_plus,
  COUNTIF(a.sales >= 5000000) AS trials_5m_plus,
  COUNTIF(f.converted) AS converts,
  COUNTIF(f.converted AND a.sales >= 5000000) AS converts_5m_plus,
  ROUND(AVG(IF(f.converted, f.mrr0, NULL)), 0) AS avg_mrr_at_convert
FROM ${MOTION_FUNNEL_TABLE} f
LEFT JOIN acct a USING (EntityRecordID)
WHERE f.signup_month >= ${sqlStr(startDate)}
GROUP BY 1
ORDER BY 1`.trimEnd();
}

// "Do the good ones convert?" — trial→convert counts by size band per signup
// quarter. Rates (converts/trials) are computed client-side. Reuses the banded
// size CTE so a signup missing from Account lands in 'No data'.
export function buildConvertRateByBandSql({ startDate = '2024-01-01' }) {
  return `WITH ${BANDED_CTE}
SELECT
  DATE_TRUNC(f.signup_month, QUARTER) AS quarter,
  COALESCE(b.band, 'No data') AS band,
  COUNT(*) AS trials,
  COUNTIF(f.converted) AS converts
FROM ${MOTION_FUNNEL_TABLE} f
LEFT JOIN banded b USING (EntityRecordID)
WHERE f.signup_month >= ${sqlStr(startDate)}
GROUP BY 1, 2
ORDER BY 1, 2`.trimEnd();
}

// "Do they grow after converting?" — growth of converts by convert-cohort
// quarter × size band. mrr_now = current MRR at nowMonth (latest complete
// month, passed by the component and escaped). grew_10pct = now > mrr0*1.1;
// gone = now = 0; median_mrr_multiple = median(now/mrr0). Only cohorts with
// mrr0 > 0 are included.
//
// Validated reference values (2024 cohorts, for a test comment only):
//   $5M+   grew 42.6%, gone 40.5%, median multiple 1.55
//   <$1M   grew 10.2%, gone 70.6%, median multiple 1.0
export function buildGrowthByCohortSql({ startDate = '2024-01-01', nowMonth }) {
  return `WITH ${ACCT_SALES_CTE},
  now_mrr AS (
    SELECT EntityRecordID, SUM(StartMRR) AS mrr_now
    FROM ${CUSTOMER_MRR_TABLE}
    WHERE Month = ${sqlStr(nowMonth)}
    GROUP BY 1
  )
SELECT
  DATE_TRUNC(f.convert_month, QUARTER) AS cohort_quarter,
  ${bandCase('a.sales')} AS band,
  COUNT(*) AS converts,
  COUNTIF(COALESCE(n.mrr_now, 0) > f.mrr0 * 1.1) AS grew_10pct,
  COUNTIF(COALESCE(n.mrr_now, 0) = 0) AS gone,
  ROUND(APPROX_QUANTILES(SAFE_DIVIDE(n.mrr_now, f.mrr0), 2)[OFFSET(1)], 2) AS median_mrr_multiple
FROM ${MOTION_FUNNEL_TABLE} f
LEFT JOIN acct a USING (EntityRecordID)
LEFT JOIN now_mrr n USING (EntityRecordID)
WHERE f.converted AND f.convert_month >= ${sqlStr(startDate)} AND f.mrr0 > 0
GROUP BY 1, 2
ORDER BY 1, 2`.trimEnd();
}

// Guard: minSales/maxMrr must be finite positive numbers (injection guard — they
// are interpolated as bare numeric literals, not string-escaped).
function assertFinitePositive(name, v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`${name} must be a finite positive number`);
  }
}

// "Sleeping giants" — active paying customers with $5M+ reported sales who are
// paying under maxMrr/mo. These are big businesses on a tiny plan: undersold.
// mrr = current MRR at nowMonth (SUM StartMRR > 0). Joins bring display columns:
// customization, industry (l1), country → US flag, tenure years (from first SaaS
// invoice), and account_count per entity (franchise-style multi-account entities
// can inflate a single "giant"). US accounts sort first (non-US sales are
// un-normalized foreign currency and would otherwise headline the list as
// $5B mirages), then reported sales desc. LIMIT 250.
export function buildSleepingGiantsSql({ nowMonth, minSales = 5000000, maxMrr = 219 }) {
  assertFinitePositive('minSales', minSales);
  assertFinitePositive('maxMrr', maxMrr);
  return `WITH acct AS (
    SELECT
      EntityRecordID,
      MAX(IF(CustDatAnnualSales BETWEEN 1 AND 1e10, CustDatAnnualSales, NULL)) AS sales,
      ANY_VALUE(SignupCountry) AS country,
      COUNT(*) AS account_count,
      MIN(IF(FirstSaaSInvoiceTxnDate BETWEEN '2000-01-01' AND ${sqlStr(nowMonth)}, FirstSaaSInvoiceTxnDate, NULL)) AS first_invoice
    FROM ${ACCOUNT_TABLE}
    GROUP BY 1
  ),
  cust AS (
    SELECT EntityRecordID, ANY_VALUE(Company) AS Company, SUM(StartMRR) AS mrr
    FROM ${CUSTOMER_MRR_TABLE}
    WHERE Month = ${sqlStr(nowMonth)}
    GROUP BY 1
    HAVING SUM(StartMRR) > 0
  )
SELECT
  c.Company,
  c.EntityRecordID,
  c.mrr,
  a.sales,
  a.country IN ('United States', 'USA', 'US') AS is_us,
  COALESCE(p.is_customized, FALSE) AS is_customized,
  v.l1,
  DATE_DIFF(${sqlStr(nowMonth)}, a.first_invoice, MONTH) / 12 AS tenure_years,
  a.account_count
FROM cust c
JOIN acct a USING (EntityRecordID)
LEFT JOIN ${PROSERV_TABLE} p ON p.EntityRecordID = c.EntityRecordID
LEFT JOIN ${LABEL_VIEW} v ON v.customer_record_id = c.EntityRecordID
WHERE a.sales >= ${minSales} AND c.mrr < ${maxMrr}
ORDER BY is_us DESC, a.sales DESC
LIMIT 250`.trimEnd();
}

// The peer benchmark for the Sleeping Giants panel: average MRR of active $5M+
// customers who are NOT sleeping (mrr >= minMrr, i.e. paying a real plan). Shows
// what the giants "should" be paying. Validated: $778 at nowMonth = '2026-06-01'.
export function buildGiantsPeerBenchmarkSql({ nowMonth, minSales = 5000000, minMrr = 219 }) {
  assertFinitePositive('minSales', minSales);
  assertFinitePositive('minMrr', minMrr);
  return `WITH ${ACCT_SALES_CTE},
  cust AS (
    SELECT EntityRecordID, SUM(StartMRR) AS mrr
    FROM ${CUSTOMER_MRR_TABLE}
    WHERE Month = ${sqlStr(nowMonth)}
    GROUP BY 1
    HAVING SUM(StartMRR) > 0
  )
SELECT ROUND(AVG(c.mrr)) AS avg_peer_mrr, COUNT(*) AS n
FROM cust c
JOIN acct a USING (EntityRecordID)
WHERE a.sales >= ${minSales} AND c.mrr >= ${minMrr}`.trimEnd();
}
