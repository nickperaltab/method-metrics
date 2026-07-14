

-- Cohort survival by first-pay vintage. ENTITY grain (EntityRecordID).
-- Mirrors VINTAGE_SQL (build_expanders_doc.py) + §18 of verification-queries.md.
-- See docs/metric-definitions.md and docs/superpowers/specs/2026-06-22-cohort-survival-vintage-design.md.

WITH mrr AS (
  SELECT Month, EntityRecordID, SUM(StartMRR) AS month_mrr
  FROM `project-for-method-dw`.`revenue`.`int_customer_mrr`
  GROUP BY 1, 2
),
signup AS (
  SELECT EntityRecordID, MIN(Date) AS sd
  FROM `project-for-method-dw`.`revenue`.`Funnel`
  WHERE EventType = 'Trial'
  GROUP BY 1
),
first_pay AS (  -- anchor = each entity's FIRST paying month
  SELECT EntityRecordID, MIN(Month) AS t0
  FROM mrr
  WHERE month_mrr > 0
  GROUP BY 1
),
base AS (
  SELECT
    fp.EntityRecordID AS eid,
    fp.t0,
    CAST(EXTRACT(YEAR FROM fp.t0) AS STRING) AS vintage,
    b.month_mrr AS mrr0
  FROM first_pay fp
  JOIN mrr b
    ON b.EntityRecordID = fp.EntityRecordID
    AND b.Month = fp.t0
  JOIN signup s  -- signup gate: first-pay anchor is genuine, not left-censored
    ON s.EntityRecordID = fp.EntityRecordID
    AND s.sd >= '2021-06-01'
),
joined AS (
  SELECT
    base.vintage,
    k AS tenure_k,
    base.mrr0,
    IFNULL(f.month_mrr, 0) AS mrrk
  FROM base, UNNEST(GENERATE_ARRAY(0, 24)) AS k
  LEFT JOIN mrr f
    ON f.EntityRecordID = base.eid
    AND f.Month = DATE_ADD(base.t0, INTERVAL k MONTH)
  WHERE DATE_ADD(base.t0, INTERVAL k MONTH)
        <= DATE('2026-05-01')
)
SELECT
  vintage,
  tenure_k,
  -- n_start = cohort size, constant across k (UNNEST drives one row per entity per tenure)
  COUNT(*) AS n_start,
  COUNTIF(mrrk > 0) AS n_alive,
  SUM(mrr0) AS base_mrr,
  SUM(LEAST(mrrk, mrr0)) AS retained_mrr,
  SUM(mrrk) AS net_mrr
FROM joined
GROUP BY 1, 2
HAVING n_start >= 30
ORDER BY 1, 2