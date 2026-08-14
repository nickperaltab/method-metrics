{{ config(materialized='view') }}

-- Daily building block for the Channel Trajectory scorecard's date-range filter.
-- One row per (event_date, metric, channel) with the fractional attribution
-- weight summed for that day. The frontend windows this by the picked date range
-- to compute MTD / trajectory / prior-month / last-year, and joins the per-channel
-- forecast views. Attribution is fractional multi-touch (Att_* summed directly);
-- trials = Account.SignupDate, syncs = Funnel EventType='Sync'. Keeping the
-- parity-critical attribution here in BQ; only the date windowing lives frontend.
-- The month-level int_channel_funnel_trajectory view documents the full method.
--
-- Backlinks stays its OWN channel here. This is the building block, so the
-- breakout must remain recoverable; the Backlinks-into-SEO rollup the scorecard
-- displays happens downstream (int_channel_funnel_trajectory + the frontend
-- windowed query in builder/src/lib/channelTrajectorySql.js).
--
-- Caveat: a sync row is dated by SignupDate but gated on SyncTypeRegion, which
-- flips when the account eventually syncs — so historical sync months keep
-- growing retroactively. The same window returns different numbers on different
-- days. Any "matches Looker" claim holds only at a single instant.

WITH trial_rows AS (
  -- NB: Account's native column is `SignUpDate` (capital U); BigQuery resolves
  -- column names case-insensitively. Funnel's is `SignupDate`.
  SELECT SignupDate AS event_date, 'trials' AS metric, channel, weight FROM (
    SELECT SignupDate,
      Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Direct,
      Att_None, Att_Email, Att_Partners, Att_Content, Att_Social, Att_Other,
      Att_Referral_Link, Att_Referral_Program, Att_Remarketing, Att_Backlinks,
      Att_Banner_Ads, Att_Help_Center, Att_Online_Chat_Tool, Att_Seminar_Conference
    FROM {{ source('revenue', 'Account') }}
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
  -- Sourced from Account, NOT the revenue.Funnel view. Funnel's 'Sync' branch is
  -- just `Account WHERE SyncTypeRegion != ''` re-dated to SignupDate, but its
  -- SELECT list hand-enumerates the Att_* columns and omits Att_Email — so every
  -- email-attributed sync silently lost its weight (5.6 of 230 rows in Jul 2026).
  -- Reading Account directly restores Att_Email. Verified bit-identical to the
  -- Funnel path on all 17 shared channels across 5,078 days / 214 months.
  SELECT SignupDate AS event_date, 'syncs' AS metric, channel, weight FROM (
    SELECT SignupDate,
      Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Direct,
      Att_None, Att_Email, Att_Partners, Att_Content, Att_Social, Att_Other,
      Att_Referral_Link, Att_Referral_Program, Att_Remarketing, Att_Backlinks,
      Att_Banner_Ads, Att_Help_Center, Att_Online_Chat_Tool, Att_Seminar_Conference
    FROM {{ source('revenue', 'Account') }}
    WHERE IsConversionException = FALSE
      AND Partner != 'Method Integration'
      AND SignupDate != DATE('0001-01-01')
      AND SyncTypeRegion != ''
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
)

SELECT event_date, metric, channel, SUM(weight) AS weight
FROM (SELECT * FROM trial_rows UNION ALL SELECT * FROM sync_rows)
GROUP BY event_date, metric, channel
