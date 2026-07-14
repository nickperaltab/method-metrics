

-- Marketing spend actuals per channel per month, pivoted from the sheet load
-- (marketing.sheet_cac_raw). One row per (channel, month), Actuals only —
-- Budget/Forecast scenarios stay in the raw table for anyone who wants them.
--
-- media_spend picks up the per-channel media line, whose measure name varies
-- by block ("Mktg PPC Spend", "Mktg Content Spend" for SEO, "Mktg Partners +
-- Events Spend", ...) — everything shaped 'Mktg%Spend' except the team line.
-- sheet_* columns are the sheet's own numbers, kept for reconciliation;
-- int_channel_cac recomputes CAC against canonical customer counts.

SELECT
  channel,
  block,
  month,
  SUM(IF(measure LIKE 'Mktg%Spend' AND measure != 'Mktg Team Overall Spend', value, 0)) AS media_spend,
  SUM(IF(measure = 'Mktg Team Overall Spend', value, 0)) AS team_spend,
  SUM(IF(measure = 'Mktg + Sales Cost', value, 0)) AS mktg_sales_cost,
  SUM(IF(measure = 'Total Spend', value, 0)) AS total_spend,
  MAX(IF(measure = 'Customers', value, NULL)) AS sheet_customers,
  MAX(IF(measure = 'ARR', value, NULL)) AS sheet_arr,
  MAX(IF(measure = 'CAC:ARR', value, NULL)) AS sheet_cac_arr
FROM `project-for-method-dw`.`marketing`.`sheet_cac_raw`
WHERE scenario = 'Actuals'
GROUP BY channel, block, month
-- Future months exist in the sheet as formula zeros; keep only months where
-- the block reported anything real.
HAVING media_spend != 0 OR total_spend != 0 OR sheet_customers IS NOT NULL