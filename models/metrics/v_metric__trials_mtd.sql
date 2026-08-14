{{ config(materialized='view') }}

-- Canonical metric: "Trials MTD (through yesterday)"
-- Type: simple (windowed count)
--
-- Trials so far this month, excluding today. Pairs with
-- v_metric__trials_trajectory, which divides this same count by complete days.
-- A tile showing a through-today figure beside a through-yesterday trajectory
-- is the inconsistency this convention exists to prevent.
--
-- Distinct from Trials #54, which is the full-month total and must stay that
-- way — it feeds Marketing, the AI chart builder and 19 dbt consumers.

SELECT period, CAST(trials_mtd AS FLOAT64) AS value
FROM {{ ref('int_method_monday') }}
