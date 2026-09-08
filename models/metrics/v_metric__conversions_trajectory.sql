{{ config(materialized='view') }}

-- Calendar-day linear projection of full-month conversions.
--
-- A projection of int_method_monday, nothing more. The definition, the filters and
-- the early-month trajectory suppression all live in that model; this view only
-- reshapes one of its columns into the (period, value) contract the registry and
-- the scorecard query planner expect.
--
-- Adopted into dbt 2026-09-08 from a hand-cut BigQuery view. SQL unchanged in
-- substance; the CAST is now applied uniformly across all thirteen siblings.

{{ method_monday_metric('conversions_trajectory') }}
