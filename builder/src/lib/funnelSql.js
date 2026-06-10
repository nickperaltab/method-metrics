// builder/src/lib/funnelSql.js
// Pure SQL builders for the Acquisition Funnel. No I/O. Unit-tested.

const fqn = (view) => `\`project-for-method-dw.revenue.${view}\``;
function sqlStr(v) { return `'${String(v).replace(/'/g, "''")}'`; }

// Company-size buckets from per-entity MAX(LicenseCount). A leading sort index
// keeps buckets in numeric order (labels would otherwise sort lexically).
const SIZE_BUCKET = `CASE
      WHEN sz.licenses IS NULL THEN '5 · Unknown'
      WHEN sz.licenses <= 1     THEN '1 · 1 seat (VSB)'
      WHEN sz.licenses <= 4     THEN '2 · 2-4 (SB)'
      WHEN sz.licenses <= 10    THEN '3 · 5-10 (SMB)'
      ELSE '4 · 11+ (Mid)'
    END`;

export function buildFunnelSpineSql({ startDate, endDate, segment = null }) {
  const seg = segment === 'CompanySize';
  return `WITH stages AS (
  SELECT EntityRecordID,
    MIN(IF(EventType='Trial', Date, NULL))      AS trial_date,
    MIN(IF(EventType='Sync', Date, NULL))       AS sync_date,
    MIN(IF(EventType='Conversion', Date, NULL)) AS conversion_date
  FROM ${fqn('Funnel')}
  GROUP BY EntityRecordID
),
sizes AS (
  SELECT EntityRecordID, MAX(LicenseCount) AS licenses
  FROM ${fqn('Account')}
  GROUP BY EntityRecordID
)
SELECT
${seg ? `  ${SIZE_BUCKET} AS segment,\n` : ''}  COUNT(*) AS trials,
  COUNTIF(s.sync_date IS NOT NULL AND s.sync_date >= s.trial_date)             AS synced,
  COUNTIF(s.conversion_date IS NOT NULL AND s.conversion_date >= s.trial_date) AS converted
FROM stages s
LEFT JOIN sizes sz USING (EntityRecordID)
WHERE s.trial_date BETWEEN ${sqlStr(startDate)} AND ${sqlStr(endDate)}
${seg ? 'GROUP BY segment\nORDER BY segment' : ''}`.trimEnd();
}

// DEP-revenue classification (same item patterns proven in the MRR-movement work).
const DEP_ITEM = `(LOWER(l.item) LIKE '%premium app%' OR LOWER(l.item) LIKE '%enhancement plan%' OR LOWER(l.item) LIKE '%dedicated%')`;

// V1 approximation: "$ at conversion" uses each converted entity's MRR at the
// LATEST int_customer_mrr_lines month (their current book), not the value at their
// exact conversion date. Good enough for V1's "value of this cohort's converts";
// refine to at-conversion MRR in a later phase.
export function buildConversionMrrSql({ startDate, endDate }) {
  return `WITH stages AS (
  SELECT EntityRecordID,
    MIN(IF(EventType='Trial', Date, NULL))      AS trial_date,
    MIN(IF(EventType='Conversion', Date, NULL)) AS conversion_date
  FROM ${fqn('Funnel')}
  GROUP BY EntityRecordID
),
converted AS (
  SELECT EntityRecordID
  FROM stages
  WHERE trial_date BETWEEN ${sqlStr(startDate)} AND ${sqlStr(endDate)}
    AND conversion_date IS NOT NULL AND conversion_date >= trial_date
),
latest AS ( SELECT MAX(month) AS m FROM ${fqn('int_customer_mrr_lines')} )
SELECT
  ROUND(SUM(IF(NOT ${DEP_ITEM}, l.saas, 0)), 2) AS core_mrr,
  ROUND(SUM(IF(${DEP_ITEM}, l.saas, 0)), 2)      AS dep_mrr
FROM ${fqn('int_customer_mrr_lines')} l
JOIN converted c ON c.EntityRecordID = l.entity_record_id
WHERE l.month = (SELECT m FROM latest) AND l.saas != 0`.trimEnd();
}

export function buildFunnelAccountTableSql({ startDate, endDate, stage }) {
  const cond = stage === 'synced'
      ? 'AND s.sync_date IS NOT NULL AND s.sync_date >= s.trial_date'
    : stage === 'converted'
      ? 'AND s.conversion_date IS NOT NULL AND s.conversion_date >= s.trial_date'
    : '';
  return `WITH stages AS (
  SELECT EntityRecordID,
    ANY_VALUE(CompanyAccount)     AS company,
    ANY_VALUE(Vertical)           AS vertical,
    ANY_VALUE(SignupCountry)      AS country,
    MAX(CustDatLastSaasAmount)    AS mrr,
    MIN(IF(EventType='Trial', Date, NULL))      AS trial_date,
    MIN(IF(EventType='Sync', Date, NULL))       AS sync_date,
    MIN(IF(EventType='Conversion', Date, NULL)) AS conversion_date
  FROM ${fqn('Funnel')}
  GROUP BY EntityRecordID
)
SELECT
  s.EntityRecordID AS entity_record_id,
  s.company  AS Company,
  s.vertical AS Vertical,
  s.country  AS SignupCountry,
  ROUND(s.mrr, 2) AS deltaMrr
FROM stages s
WHERE s.trial_date BETWEEN ${sqlStr(startDate)} AND ${sqlStr(endDate)}
  ${cond}
ORDER BY s.mrr DESC
LIMIT 50`.trimEnd();
}
