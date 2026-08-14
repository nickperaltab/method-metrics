{{ config(materialized='view') }}

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
FROM {{ ref('int_method_monday') }}
