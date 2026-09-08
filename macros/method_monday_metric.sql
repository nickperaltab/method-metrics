{#
  One-column projection of int_method_monday into the (period, value) shape every
  v_metric__* view returns.

  Thirteen metric views are nothing but this projection. Before int_method_monday was
  adopted into dbt (2026-09-02) they were hand-cut in the BigQuery console, and the
  thirteen drifted from each other in small ways -- some CAST to FLOAT64, some didn't.
  Routing them all through one macro means the shape is defined once.

  There is no metric logic here. Every definition lives upstream in int_method_monday;
  these views only rename a column. That is why they carry no `filters` or
  `methodology_source` of their own -- see each one's `meta.methodology_source`, which
  points back at the parent.

  `expression` is for the one case that isn't a bare column (sync_rate_mtd derives its
  value from two others). Everything else passes `column` alone.

  The CAST is uniform and deliberate. Some upstream columns are INT64 (counts) and some
  are already FLOAT64 (rates, trajectories); casting all of them keeps `value` a single
  type across the whole v_metric__* family, so a consumer never has to branch on it.
  For the columns that were already FLOAT64 it is a no-op.
#}
{% macro method_monday_metric(column, expression=none) %}
SELECT
  period,
  CAST({{ expression if expression is not none else column }} AS FLOAT64) AS value
FROM {{ ref('int_method_monday') }}
{% endmacro %}
