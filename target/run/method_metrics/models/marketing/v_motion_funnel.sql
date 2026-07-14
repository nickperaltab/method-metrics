

  create or replace view `project-for-method-dw`.`revenue`.`v_motion_funnel`
  OPTIONS(
      description="""Motion + lifecycle acquisition funnel, aggregated to (signup_month, motion). Counts only: trials \u2192 synced \u2192 demo booked/attended \u2192 converted \u2192 customized \u2192 retained at 1/3/6/12 months (each with an eligibility denominator for maturity). The talked-to-us fork is only valid for 2024+ cohorts. Directional \u2014 inputs (Activity, V7) are partial; not a verified metric.\n""",
    
      labels=[('layer', 'intermediate'), ('status', 'directional'), ('source_table', 'int_motion_funnel')]
    )
  as 

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
FROM `project-for-method-dw`.`revenue`.`int_motion_funnel`
GROUP BY 1, 2;

