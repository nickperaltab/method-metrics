

-- Channel Trajectory: per channel × metric (trials / syncs / sync_rate) —
-- current-month MTD (excl today), calendar-day linear trajectory, prior-month
-- full, last-year full, and YoY / MoM %.
--
-- Attribution is FRACTIONAL multi-touch: Att_* are already fractional weights,
-- summed directly (do NOT normalize, do NOT collapse to one channel).
-- Trials  = revenue.Account by SignupDate.
-- Syncs   = revenue.Funnel where EventType='Sync' (NOT CustDatFirstSyncCompleted).
-- Window  = [DATE_TRUNC(CURRENT_DATE(),MONTH), CURRENT_DATE())  (MTD excl today).
-- Trajectory = MTD / days_elapsed * days_in_month  (calendar-day linear run-rate).

WITH cal AS (
  SELECT
    CURRENT_DATE() AS today,
    DATE_TRUNC(CURRENT_DATE(), MONTH) AS m_start,
    DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH) AS pm_start,
    DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH), MONTH) AS ly_start,
    DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 11 MONTH), MONTH) AS ly_next_start,
    DATE_DIFF(CURRENT_DATE(), DATE_TRUNC(CURRENT_DATE(), MONTH), DAY) AS days_elapsed,
    EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE())) AS days_in_month
),

trial_rows AS (
  -- NB: Account's native column is `SignUpDate` (capital U); we rely on
  -- BigQuery's case-insensitive column resolution. Funnel's is `SignupDate`.
  SELECT SignupDate AS d, channel, weight FROM (
    SELECT SignupDate,
      Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Direct,
      Att_None, Att_Email, Att_Partners, Att_Content, Att_Social, Att_Other,
      Att_Referral_Link, Att_Referral_Program, Att_Remarketing, Att_Backlinks,
      Att_Banner_Ads, Att_Help_Center, Att_Online_Chat_Tool, Att_Seminar_Conference
    FROM `project-for-method-dw`.`revenue`.`Account`
    WHERE IsConversionException = FALSE
      AND Partner != 'Method Integration'
      AND SignupDate != DATE('0001-01-01')
  )
  UNPIVOT (weight FOR channel IN (
    Att_SEO AS 'SEO', Att_Pay_Per_Click AS 'PPC',
    Att_OPN_Other_Peoples_Networks AS 'OPN', Att_Direct AS 'Direct',
    Att_None AS 'None', Att_Email AS 'Email', Att_Partners AS 'Partners',
    Att_Content AS 'Content', Att_Social AS 'Social', Att_Other AS 'Other',
    Att_Referral_Link AS 'Referral', Att_Referral_Program AS 'Referral_Program',
    Att_Remarketing AS 'Remarketing', Att_Backlinks AS 'Backlinks',
    Att_Banner_Ads AS 'Banner_Ads', Att_Help_Center AS 'Help_Center',
    Att_Online_Chat_Tool AS 'Online_Chat', Att_Seminar_Conference AS 'Seminar'))
  WHERE weight <> 0
),

sync_rows AS (
  SELECT CAST(Date AS DATE) AS d, channel, weight FROM (
    SELECT Date,
      Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Direct,
      Att_None, Att_Partners, Att_Content, Att_Social, Att_Other,
      Att_Referral_Link, Att_Referral_Program, Att_Remarketing, Att_Backlinks,
      Att_Banner_Ads, Att_Help_Center, Att_Online_Chat_Tool, Att_Seminar_Conference
    FROM `project-for-method-dw`.`revenue`.`Funnel`
    WHERE EventType = 'Sync'
  )
  UNPIVOT (weight FOR channel IN (
    Att_SEO AS 'SEO', Att_Pay_Per_Click AS 'PPC',
    Att_OPN_Other_Peoples_Networks AS 'OPN', Att_Direct AS 'Direct',
    Att_None AS 'None', Att_Partners AS 'Partners',
    Att_Content AS 'Content', Att_Social AS 'Social', Att_Other AS 'Other',
    Att_Referral_Link AS 'Referral', Att_Referral_Program AS 'Referral_Program',
    Att_Remarketing AS 'Remarketing', Att_Backlinks AS 'Backlinks',
    Att_Banner_Ads AS 'Banner_Ads', Att_Help_Center AS 'Help_Center',
    Att_Online_Chat_Tool AS 'Online_Chat', Att_Seminar_Conference AS 'Seminar'))
  WHERE weight <> 0
),

events AS (
  SELECT 'trials' AS metric, d, channel, weight FROM trial_rows
  UNION ALL
  SELECT 'syncs' AS metric, d, channel, weight FROM sync_rows
),

agg AS (
  SELECT
    e.metric, e.channel,
    SUM(CASE WHEN e.d >= c.m_start  AND e.d < c.today        THEN e.weight END) AS mtd,
    SUM(CASE WHEN e.d >= c.pm_start AND e.d < c.m_start       THEN e.weight END) AS prior_full,
    SUM(CASE WHEN e.d >= c.ly_start AND e.d < c.ly_next_start THEN e.weight END) AS ly_full,
    ANY_VALUE(c.days_elapsed)  AS days_elapsed,
    ANY_VALUE(c.days_in_month) AS days_in_month
  FROM events e CROSS JOIN cal c
  GROUP BY e.metric, e.channel
),

-- Per-channel forecast for the CURRENT month (Looker parity). method_forecast
-- itself is month-level only; these views carry the channel split.
fcst AS (
  SELECT 'trials' AS metric, f.AttributionChannel AS channel, f.forecast_value AS forecast
  FROM `project-for-method-dw`.`revenue`.`v_trials_forecast_channel` f, cal c
  WHERE f.forecast_date = c.m_start
  UNION ALL
  SELECT 'syncs', f.AttributionChannel, f.forecast_value
  FROM `project-for-method-dw`.`revenue`.`v_syncs_forecast_channel` f, cal c
  WHERE f.forecast_date = c.m_start
),

base AS (
  SELECT
    a.metric, a.channel, a.mtd, a.prior_full, a.ly_full,
    CASE WHEN a.days_elapsed > 0 THEN a.mtd / a.days_elapsed * a.days_in_month END AS trajectory,
    f.forecast
  FROM agg a
  LEFT JOIN fcst f USING (metric, channel)
),

rate AS (
  SELECT
    'sync_rate' AS metric, t.channel,
    SAFE_DIVIDE(s.mtd, t.mtd)               AS mtd,
    SAFE_DIVIDE(s.prior_full, t.prior_full) AS prior_full,
    SAFE_DIVIDE(s.ly_full, t.ly_full)       AS ly_full,
    SAFE_DIVIDE(s.trajectory, t.trajectory) AS trajectory,
    SAFE_DIVIDE(s.forecast, t.forecast)     AS forecast
  FROM (SELECT * FROM base WHERE metric = 'trials') t
  LEFT JOIN (SELECT * FROM base WHERE metric = 'syncs') s USING (channel)
),

unioned AS (
  SELECT metric, channel, mtd, trajectory, prior_full, ly_full, forecast FROM base
  UNION ALL
  SELECT metric, channel, mtd, trajectory, prior_full, ly_full, forecast FROM rate
)

SELECT
  metric,
  channel,
  mtd                                            AS mtd_actual,
  trajectory,
  prior_full                                     AS prior_month_full,
  ly_full                                        AS last_year_full,
  forecast,
  SAFE_DIVIDE(trajectory - ly_full, ly_full)     AS yoy_pct,
  SAFE_DIVIDE(trajectory - prior_full, prior_full) AS mom_pct,
  SAFE_DIVIDE(trajectory - forecast, forecast)   AS fcst_pct
FROM unioned