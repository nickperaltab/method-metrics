
  
    

    create or replace table `project-for-method-dw`.`revenue`.`int_channel_forecast`
      
    
    

    
    OPTIONS(
      description="""Per-channel monthly forecast for trials and syncs, materialized as a native BQ\ntable. One row per (metric, forecast_date, channel). A pass-through UNION of the\ntwo Sheets-federated forecast views (v_trials_forecast_channel +\nv_syncs_forecast_channel).\n\nWhy materialized: the forecast views federate over Google Sheets (Drive), and\nreading them from the browser frontend requires a Drive OAuth scope the app does\nnot request \u2014 which 403'd users. dbt reads the Sheet once at build time (its\nservice account has Drive access) and lands this plain table the frontend can\njoin scope-free. Refreshed on the normal dbt run cadence.\n\n\u26a0\ufe0f Pass-through: the numbers are only as good as the upstream forecast Sheet \u2014 if\nthe Sheet is wrong or stale, this table is wrong. Values reflect the last dbt\nbuild, not live edits to the Sheet.\n"""
    )
    as (
      

-- Per-channel monthly forecast, MATERIALIZED as a native table so browser
-- queries never touch the Google-Sheets-federated source (looker_inputs).
-- The forecast views (v_trials/v_syncs_forecast_channel) federate over Drive;
-- reading them from the frontend requires Drive scope the app's OAuth doesn't
-- request, which 403'd users. dbt reads the Sheet here once at build time (its
-- service account has Drive access) and lands a plain table the frontend can
-- join scope-free. Refreshed on the normal dbt run cadence.

SELECT 'trials' AS metric, forecast_date, AttributionChannel AS channel, forecast_value
FROM `project-for-method-dw`.`revenue`.`v_trials_forecast_channel`
UNION ALL
SELECT 'syncs' AS metric, forecast_date, AttributionChannel AS channel, forecast_value
FROM `project-for-method-dw`.`revenue`.`v_syncs_forecast_channel`
    );
  