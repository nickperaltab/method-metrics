{{ config(materialized='view') }}

-- Passthrough to the existing BQ-side `revenue.v_trials` view.
-- The canonical filter logic (IsConversionException = FALSE,
-- Partner != 'Method Integration', SignupDate != DATE('0001-01-01'))
-- lives in the BQ DDL, not here. This file exists so dbt parse can
-- attach the semantic_model defined in v_trials.yml to a real model.
-- Phase 1.5 may inline the filter and rename to `int_trials`.

select * from `project-for-method-dw.revenue.v_trials`
