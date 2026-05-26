{{ config(materialized='view') }}

-- Canonical metric: "Trial-to-Conversion Rate" (#302)
-- Type: ratio (cross-model)
-- Formula: SAFE_DIVIDE(conversions, trials) per period

SELECT
  COALESCE(c.period, t.period) AS period,
  SAFE_DIVIDE(c.value, t.value) AS value
FROM {{ ref('v_metric__conversions') }} c
FULL OUTER JOIN {{ ref('v_metric__trials') }} t
  ON c.period = t.period
ORDER BY 1
