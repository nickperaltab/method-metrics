{{ config(materialized='view') }}

-- Aggregated motion + lifecycle funnel for the chart. One row per (signup_month, motion).
-- Ships COUNTS only — the frontend computes conversion %, show rate, and retention rate
-- (retained_Kmo / eligible_Kmo). status: directional (see labels); lives in `revenue`.
-- The chart filters to motion_trackable cohorts (2024+) for the fork.

SELECT
  signup_month,
  motion,
  COUNT(*)                                          AS trials,
  COUNTIF(synced)                                   AS synced,
  COUNTIF(demo_booked)                              AS demo_booked,
  COUNTIF(demo_attended)                            AS demo_attended,
  COUNTIF(free_booked)                              AS free_booked,
  COUNTIF(free_attended)                            AS free_attended,
  COUNTIF(converted)                                AS converted,
  COUNTIF(converted AND is_customized)              AS customized,
  COUNTIF(converted AND eligible_1mo)               AS eligible_1mo,
  COUNTIF(converted AND eligible_1mo AND retained_1mo)   AS retained_1mo,
  COUNTIF(converted AND eligible_3mo)               AS eligible_3mo,
  COUNTIF(converted AND eligible_3mo AND retained_3mo)   AS retained_3mo,
  COUNTIF(converted AND eligible_6mo)               AS eligible_6mo,
  COUNTIF(converted AND eligible_6mo AND retained_6mo)   AS retained_6mo,
  COUNTIF(converted AND eligible_12mo)              AS eligible_12mo,
  COUNTIF(converted AND eligible_12mo AND retained_12mo) AS retained_12mo
FROM {{ ref('int_motion_funnel') }}
GROUP BY 1, 2
ORDER BY 1, 2
