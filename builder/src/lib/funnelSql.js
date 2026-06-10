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

// Attended/committed sales-onboarding touches that count as "assisted" (excludes
// 'booked'/'missed'/'follow up' as ambiguous; 'AI Summary - *' = a real Zoom session
// happened). Tracking began ~Jun 2026, so this is sparse for older cohorts.
const SALES_ASSIST_TYPES = [
  'Demo', 'AI Summary - Demo',
  'Free Consulting Session', 'AI Summary - Free Hour',
  'Consulting Agreement', 'AI Summary - Customization', 'Monthly Dedicated Services',
];
const ASSIST_IN_LIST = SALES_ASSIST_TYPES.map(sqlStr).join(', ');

export function buildFunnelSpineSql({ startDate, endDate, segment = null }) {
  const isSize = segment === 'CompanySize';
  const isAssist = segment === 'Assisted';
  const seg = isSize || isAssist;

  const sizesCte = isSize ? `,
sizes AS (
  SELECT EntityRecordID, MAX(LicenseCount) AS licenses
  FROM ${fqn('Account')}
  GROUP BY EntityRecordID
)` : '';
  const assistCte = isAssist ? `,
assist AS (
  SELECT DISTINCT a.EntityRecordID
  FROM ${fqn('Activity')} a
  JOIN stages s ON s.EntityRecordID = a.EntityRecordID
  WHERE a.IsDeleted = FALSE
    AND a.ActivityType IN (${ASSIST_IN_LIST})
    AND a.DueDateStart >= s.trial_date
)` : '';

  const segExpr = isSize
      ? `${SIZE_BUCKET} AS segment,`
    : isAssist
      ? `IF(asst.EntityRecordID IS NOT NULL, 'Assisted', 'Not assisted') AS segment,`
    : '';
  const segJoin = isSize ? 'LEFT JOIN sizes sz USING (EntityRecordID)'
    : isAssist ? 'LEFT JOIN assist asst USING (EntityRecordID)'
    : '';

  return `WITH stages AS (
  SELECT EntityRecordID,
    MIN(IF(EventType='Trial', Date, NULL))      AS trial_date,
    MIN(IF(EventType='Sync', Date, NULL))       AS sync_date,
    MIN(IF(EventType='Conversion', Date, NULL)) AS conversion_date
  FROM ${fqn('Funnel')}
  GROUP BY EntityRecordID
)${sizesCte}${assistCte}
SELECT
${seg ? `  ${segExpr}\n` : ''}  COUNT(*) AS trials,
  COUNTIF(s.sync_date IS NOT NULL AND s.sync_date >= s.trial_date)             AS synced,
  COUNTIF(s.conversion_date IS NOT NULL AND s.conversion_date >= s.trial_date) AS converted
FROM stages s
${segJoin ? segJoin + '\n' : ''}WHERE s.trial_date BETWEEN ${sqlStr(startDate)} AND ${sqlStr(endDate)}
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
