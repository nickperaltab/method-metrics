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
