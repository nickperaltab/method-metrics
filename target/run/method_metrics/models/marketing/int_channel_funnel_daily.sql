

  create or replace view `project-for-method-dw`.`revenue`.`int_channel_funnel_daily`
  OPTIONS(
      description="""Daily building block for the Channel Trajectory scorecard's date-range filter. One row per (event_date, metric, channel) with the fractional attribution weight summed. The frontend windows this by the picked range to compute MTD / trajectory / prior-month / last-year. Trials from Account.SignupDate; syncs from Funnel EventType='Sync'. Fractional multi-touch attribution (Att_* summed directly).\n"""
    )
  as 

-- Daily building block for the Channel Trajectory scorecard's date-range filter.
-- One row per (event_date, metric, channel) with the fractional attribution
-- weight summed for that day. The frontend windows this by the picked date range
-- to compute MTD / trajectory / prior-month / last-year, and joins the per-channel
-- forecast views. Attribution is fractional multi-touch (Att_* summed directly);
-- trials = Account.SignupDate, syncs = Funnel EventType='Sync'. Keeping the
-- parity-critical attribution here in BQ; only the date windowing lives frontend.
-- The month-level int_channel_funnel_trajectory view documents the full method.

WITH trial_rows AS (
  -- NB: Account's native column is `SignUpDate` (capital U); BigQuery resolves
  -- column names case-insensitively. Funnel's is `SignupDate`.
  SELECT SignupDate AS event_date, 'trials' AS metric, channel, weight FROM (
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
  SELECT CAST(Date AS DATE) AS event_date, 'syncs' AS metric, channel, weight FROM (
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
)

SELECT event_date, metric, channel, SUM(weight) AS weight
FROM (SELECT * FROM trial_rows UNION ALL SELECT * FROM sync_rows)
GROUP BY event_date, metric, channel;

