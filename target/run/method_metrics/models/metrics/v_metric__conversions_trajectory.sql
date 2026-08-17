

  create or replace view `project-for-method-dw`.`revenue_metrics`.`v_metric__conversions_trajectory`
  OPTIONS(
      description="""Month-end projection of conversions for the in-progress month. Counts\nconversions through yesterday, divides by COMPLETE days\n(day_of_month - 1), and scales to the full month. Returns exactly one\nrow for the current month \u2014 trajectory has no meaning for a closed\nmonth.\n""",
    
      labels=[('metric_id', '296'), ('layer', 'metrics'), ('type', 'derived'), ('status', 'queued'), ('source_table', 'int_method_monday'), ('source_measure_safe', ''), ('depends_on', '56')]
    )
  as 

-- Canonical metric: "Conversions Trajectory" (#296)
-- Type: derived (single-period projection)
--
-- CONVENTION CHANGED 2026-08-10. Was: conversions through today divided by
-- day_of_month. Now: conversions through YESTERDAY divided by COMPLETE days:
--
--   conversions_mtd / (day_of_month - 1) * days_in_month
--
-- Why: the previous convention divided by day_of_month while its numerator
-- held only part of that day, so it read low until the day's data landed. It
-- also disagreed with Looker's Method Monday page, which already divides by
-- complete days. We unify on the Method Monday convention.
--
-- Consequence: this metric moves 65.1 -> 68.89 on 2026-08-10, and Supabase
-- metrics 321, 322 and 323 follow. Those four Sales Scorecard tiles no longer
-- match Looker's Sales page, deliberately.
--
-- NULL on the 1st of the month.

SELECT period, conversions_trajectory AS value
FROM `project-for-method-dw`.`revenue`.`int_method_monday`;

