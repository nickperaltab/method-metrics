
  
    

    create or replace table `project-for-method-dw`.`revenue`.`int_channel_forecast`
      
    
    

    
    OPTIONS(
      description=""""""
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
  