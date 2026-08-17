

  create or replace view `project-for-method-dw`.`revenue`.`v_channel_arr_display`
  OPTIONS(
      description="""DIRECTIONAL presentation view for the Channel ARR scorecard \u2014 final display\ncolumns per (channel \u00d7 first-invoice month) computed from v_channel_arr (on\nthe int_attribution_fractional real-multi-touch primitive). \"SaaS\" is the\nrun-rate (Custdatlastsaasamount) allocated by fractional attribution \u2014 NOT\ninvoiced revenue, does not tie to RevCogs. CAD ARR baked at a fixed 1.33 (stale\nif the USD\u2192CAD rate moves). Penny-matched to the Looker \"Revenue by Channel\"\ndashboard (May 2026).\n\nPresentation layer only \u2014 it duplicates v_channel_arr with formatting + a baked\nFX rate. For definition questions prefer v_channel_arr itself.\n[REVIEW: worth exposing at all as a definition surface, or keep internal since\nit's display formatting over v_channel_arr?]\n""",
    
      labels=[('layer', 'marketing'), ('type', 'presentation'), ('status', 'directional'), ('verified_at', '2026-06-02'), ('source_table', 'v_channel_arr')]
    )
  as 

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
ORDER BY month DESC, attribution_value DESC;

