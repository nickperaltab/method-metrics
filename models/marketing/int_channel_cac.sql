{{ config(materialized='view') }}

-- CAC per acquisition channel per month. Spend numerator comes from the
-- marketing tracker sheet (int_marketing_spend); the customer denominator is
-- canonical — int_customers.IsNew — NOT the sheet's own customer count. The
-- two disagree by 10–25% on SEO/Partners (different attribution timing);
-- sheet_customers is carried alongside so the gap stays visible instead of
-- silently inherited.
--
-- Channels are the mutually-exclusive canonical set (matches
-- AttributionChannel values). TOTAL and sub-split blocks are excluded here;
-- query int_marketing_spend directly for those.
--
-- cac_media    = media dollars only (the number to compare across channels)
-- cac_fully_loaded = sheet's Total Spend incl. team + mktg/sales cost

WITH new_customers AS (
  SELECT AttributionChannel AS channel, Month AS month,
         COUNT(DISTINCT EntityRecordID) AS bq_new_customers
  FROM {{ ref('int_customers') }}
  WHERE IsNew
  GROUP BY 1, 2
)

SELECT
  s.channel,
  s.month,
  s.media_spend,
  s.team_spend,
  s.mktg_sales_cost,
  s.total_spend,
  n.bq_new_customers,
  s.sheet_customers,
  SAFE_DIVIDE(s.media_spend, n.bq_new_customers) AS cac_media,
  SAFE_DIVIDE(s.total_spend, n.bq_new_customers) AS cac_fully_loaded,
  s.sheet_arr,
  s.sheet_cac_arr
FROM {{ ref('int_marketing_spend') }} s
LEFT JOIN new_customers n USING (channel, month)
WHERE s.channel IN ('PPC', 'SEO', 'OPN', 'Partners', 'Email')
  AND s.month < DATE_TRUNC(CURRENT_DATE(), MONTH)
