{{ config(materialized='table') }}

-- Per-customer motion + lifecycle funnel row. ENTITY grain — one row per trialer.
-- Assembles the shipped spine (int_trials -> int_syncs -> int_customer_mrr) with the
-- talked-to-us fork (int_presale_touches), customization (int_customer_proserv),
-- DEP/prepay/industry lenses, and a multi-horizon retention curve computed per-entity
-- from int_customer_mrr (same first-pay anchor int_customer_survival uses; no engine
-- rebuilt). Directional: Activity-based motion is only trustworthy for 2024+ cohorts
-- (motion_trackable). See docs/superpowers/specs/2026-06-29-acquisition-funnel-phase2-motion-lifecycle-design.md.

{% set censor = var('motion_censor_month', none) %}

WITH trials AS (
  SELECT EntityRecordID, DATE_TRUNC(MIN(SignupDate), MONTH) AS signup_month
  FROM {{ ref('int_trials') }}
  GROUP BY 1
),
syncs AS (
  SELECT EntityRecordID, MIN(SyncDate) AS sync_date
  FROM {{ ref('int_syncs') }}
  GROUP BY 1
),
mrr AS (
  SELECT EntityRecordID, Month, SUM(StartMRR) AS m
  FROM {{ ref('int_customer_mrr') }}
  GROUP BY 1, 2
),
conv AS (  -- first paying month = convert anchor t0
  SELECT EntityRecordID, MIN(Month) AS convert_month
  FROM mrr
  WHERE m > 0
  GROUP BY 1
),
conv_mrr AS (
  SELECT c.EntityRecordID, c.convert_month, mr.m AS mrr0
  FROM conv c JOIN mrr mr
    ON mr.EntityRecordID = c.EntityRecordID AND mr.Month = c.convert_month
),
dep AS (
  SELECT EntityRecordID, LOGICAL_OR(HasDEP) AS has_dep
  FROM {{ ref('int_customers') }}
  GROUP BY 1
),
sizes AS (
  SELECT EntityRecordID, MAX(TotalUsers) AS users
  FROM {{ ref('int_customers') }}
  GROUP BY 1
),
prepay AS (
  SELECT EntityRecordID,
    LOGICAL_OR(InvoiceGrouping = 'SaaS' AND SaaSPayType = 'Prepay' AND SaaSAmount != 0) AS is_prepay
  FROM {{ source('revenue', 'TransLineFlattened') }}
  GROUP BY 1
),
censor AS (
  SELECT
    {% if censor %}DATE('{{ censor }}'){% else %}DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH){% endif %} AS censor_month
)
SELECT
  t.EntityRecordID,
  t.signup_month,
  s.sync_date IS NOT NULL                          AS synced,
  cm.convert_month IS NOT NULL                     AS converted,
  cm.convert_month,
  CAST(cm.mrr0 AS NUMERIC)                         AS mrr0,
  -- talked = attended a demo/free session on or before the convert month
  -- (or any time, if never converted). Else self_serve.
  CASE
    WHEN COALESCE(pt.attended_any, FALSE)
      AND (cm.convert_month IS NULL
           OR pt.first_attended_date < DATE_ADD(cm.convert_month, INTERVAL 1 MONTH))
    THEN 'talked' ELSE 'self_serve'
  END                                              AS motion,
  t.signup_month >= DATE('2024-01-01')             AS motion_trackable,
  COALESCE(pt.demo_booked, FALSE)                  AS demo_booked,
  COALESCE(pt.demo_attended, FALSE)                AS demo_attended,
  COALESCE(pt.free_booked, FALSE)                  AS free_booked,
  COALESCE(pt.free_attended, FALSE)                AS free_attended,
  COALESCE(ps.is_customized, FALSE)                AS is_customized,
  COALESCE(ps.ps_gross, 0)                         AS ps_gross,
  COALESCE(d.has_dep, FALSE)                        AS has_dep,
  COALESCE(pp.is_prepay, FALSE)                     AS is_prepay,
  ind.l1                                            AS industry_l1,
  -- customer size bucket derived from peak user count
  CASE
    WHEN sz.users IS NULL THEN 'Unknown'
    WHEN sz.users <= 1     THEN 'Solo'
    WHEN sz.users <= 4     THEN 'Small (2-4)'
    WHEN sz.users <= 10    THEN 'SMB (5-10)'
    ELSE                        'Mid (11+)'
  END                                               AS user_tier,
  -- retention horizons (numerator = alive at t0+K; eligible = t0+K observable)
  COALESCE(r1.m, 0) > 0                             AS retained_1mo,
  DATE_ADD(cm.convert_month, INTERVAL 1 MONTH)  <= c.censor_month AS eligible_1mo,
  COALESCE(r3.m, 0) > 0                             AS retained_3mo,
  DATE_ADD(cm.convert_month, INTERVAL 3 MONTH)  <= c.censor_month AS eligible_3mo,
  COALESCE(r6.m, 0) > 0                             AS retained_6mo,
  DATE_ADD(cm.convert_month, INTERVAL 6 MONTH)  <= c.censor_month AS eligible_6mo,
  COALESCE(r12.m, 0) > 0                            AS retained_12mo,
  DATE_ADD(cm.convert_month, INTERVAL 12 MONTH) <= c.censor_month AS eligible_12mo
FROM trials t
CROSS JOIN censor c
LEFT JOIN syncs s        ON s.EntityRecordID = t.EntityRecordID
LEFT JOIN conv_mrr cm    ON cm.EntityRecordID = t.EntityRecordID
LEFT JOIN {{ ref('int_presale_touches') }} pt ON pt.EntityRecordID = t.EntityRecordID
LEFT JOIN {{ ref('int_customer_proserv') }} ps ON ps.EntityRecordID = t.EntityRecordID
LEFT JOIN dep d          ON d.EntityRecordID = t.EntityRecordID
LEFT JOIN sizes sz       ON sz.EntityRecordID = t.EntityRecordID
LEFT JOIN prepay pp      ON pp.EntityRecordID = t.EntityRecordID
LEFT JOIN {{ source('v7_classification', 'v_entity_primary_label') }} ind
                         ON ind.customer_record_id = t.EntityRecordID
LEFT JOIN mrr r1  ON r1.EntityRecordID = t.EntityRecordID  AND r1.Month  = DATE_ADD(cm.convert_month, INTERVAL 1 MONTH)
LEFT JOIN mrr r3  ON r3.EntityRecordID = t.EntityRecordID  AND r3.Month  = DATE_ADD(cm.convert_month, INTERVAL 3 MONTH)
LEFT JOIN mrr r6  ON r6.EntityRecordID = t.EntityRecordID  AND r6.Month  = DATE_ADD(cm.convert_month, INTERVAL 6 MONTH)
LEFT JOIN mrr r12 ON r12.EntityRecordID = t.EntityRecordID AND r12.Month = DATE_ADD(cm.convert_month, INTERVAL 12 MONTH)
WHERE t.signup_month >= DATE('2020-01-01')
