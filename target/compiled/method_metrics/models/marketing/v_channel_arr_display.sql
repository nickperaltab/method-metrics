

-- DISPLAY view for the Channel ARR scorecard rawTable. Computes the final
-- presentation columns from v_channel_arr (the channel×month aggregate on the
-- fractional attribution primitive int_attribution_fractional).
--
-- DIRECTIONAL — run-rate basis (Custdatlastsaasamount); see v_channel_arr and
-- docs/metric-definitions.md "Channel ARR". NOT accounting-grade.
--
-- FX rate is BAKED at a fixed 1.33 here (the scorecard rawTable SQL is static;
-- the adjustable-rate box is a possible follow-up).
--   cad_arr = ((saas_us_portion*1.33 + saas_nonus_portion)/attribution_value)*12

WITH base AS (
  SELECT
    channel,
    month,
    customers,
    ROUND(attribution_value, 2)                                                AS attribution_value,
    ROUND(SAFE_DIVIDE(first_invoice_weighted, attribution_value), 2)           AS avg_first_invoice,
    ROUND(saas_usd, 2)                                                         AS saas,
    ROUND(SAFE_DIVIDE(saas_usd, attribution_value), 2)                        AS arpc,
    ROUND(SAFE_DIVIDE(saas_usd, attribution_value) * 12, 2)                   AS arr,
    ROUND(SAFE_DIVIDE(saas_us_portion * 1.33 + saas_nonus_portion, attribution_value) * 12, 2) AS cad_arr
  FROM `project-for-method-dw`.`revenue`.`v_channel_arr`
)
SELECT
  channel,
  month,
  customers,
  attribution_value,
  avg_first_invoice,
  saas,
  arpc,
  arr,
  cad_arr,
  -- 3-month trailing rolling avg of CAD ARR per channel (assumes contiguous months)
  ROUND(AVG(cad_arr) OVER (
    PARTITION BY channel ORDER BY month
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  ), 2) AS cad_arr_3mo
FROM base
ORDER BY month DESC, attribution_value DESC