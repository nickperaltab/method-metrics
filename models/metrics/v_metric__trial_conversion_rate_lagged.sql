{{ config(materialized='view') }}

-- Canonical metric: "Conversion Rate" (#357) — the Sales Scorecard flavour
-- Type: derived ratio
--
-- Formula: conversions in M
--            / ((trials in M-1 + forecasted trials in M) / 2)
--
-- This is NOT v_metric__trial_to_conversion_rate (#302). #302 is
-- same-month and runs 15-20%. This one lags the denominator by a month
-- and blends in forecast, which is what the Looker Sales Scorecard shows.
--
-- The one-month lag is deliberate: trials convert roughly a month after
-- signup, so pairing conversions in M against trials in M-1 is closer to
-- a cohort than same-month would be.
--
-- The current month reads LOW (a partial numerator over a full-month
-- denominator). That is not a bug — it is why the panel shows ~9.6%
-- mid-month and ~13% at month end. Do not "fix" it by annualising here;
-- the trajectory metric (#321) is the month-end projection.
--
-- Emits a decimal rate (0.096), not a percentage (9.6).

WITH conversions AS (
  SELECT
    DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
    COUNT(*) AS conversions
  FROM {{ source('revenue', 'int_conversions') }}
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY 1
),
trials_lagged AS (
  -- Trials from month M-1, surfaced under month M.
  SELECT
    DATE_ADD(DATE_TRUNC(SignupDate, MONTH), INTERVAL 1 MONTH) AS period,
    COUNT(*) AS prior_month_trials
  FROM {{ ref('int_trials') }}
  WHERE SignupDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 25 MONTH)
  GROUP BY 1
),
forecast AS (
  SELECT
    DATE_TRUNC(Date, MONTH) AS period,
    SUM(Forecasted_Trials) AS forecasted_trials
  FROM {{ source('revenue', 'method_forecast') }}
  GROUP BY 1
)
SELECT
  c.period AS period,
  SAFE_DIVIDE(
    c.conversions,
    (COALESCE(t.prior_month_trials, 0) + COALESCE(f.forecasted_trials, 0)) / 2.0
  ) AS value
FROM conversions c
LEFT JOIN trials_lagged t USING (period)
LEFT JOIN forecast f USING (period)
ORDER BY 1
