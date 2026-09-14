{{ config(materialized='view') }}

-- DIRECTIONAL metric: trial -> sync -> paying funnel by CLICK-DERIVED channel.
-- Grain: (channel x signup month). One row per channel per month.
--
-- WHY THIS EXISTS. Every other channel view in this project roots in
-- revenue.Account.Att_*: int_attribution_fractional unpacks those 18 columns,
-- and the single-touch AttributionChannel dimension is a CASE over them. There
-- is no Att_AIO column and adding one costs three repo deploys, so AI-sourced
-- traffic can never appear in v_channel_scorecard, int_channel_funnel_daily or
-- anything built on them.
--
-- This view roots in int_cookie_clicks instead, which derives the channel from
-- the click's referrer and landing URL. That makes AIO a first-class channel
-- value with no upstream change. See the window note below for how far back
-- the channel comparison is trustworthy.
--
-- DOES NOT RECONCILE to the Att_*-derived views, and is not meant to. They
-- answer "which channels does Alocet credit this account to"; this answers
-- "which channels actually touched this account's browser". Directionally
-- comparable, never penny-matched. Do not chase the delta.
--
-- ATTRIBUTION MODEL. Each trial account's 1.0 of credit is split evenly across
-- the distinct channels that touched its cookie. Deliberately simpler than the
-- Alocet multi-touch engine, which applies first/last/middle percentages from
-- CampaignAttributionTypes and zeroes Direct touches in mixed journeys. Even
-- splitting is the honest floor: we do not have the touch ORDER for every
-- cookie, because untagged repeat visits are discarded upstream (TICKETS.md,
-- "Pixel Tracker: Three Upstream Fixes for AI Traffic").
--
-- THESE ARE FIRST-TOUCH MEASURES. Read that literally before quoting them.
--
-- Untagged channels (Direct, SEO, AIO) are recorded only on a browser's FIRST
-- ever visit; every later untagged visit is discarded by the pixel. Tagged
-- channels carry a trc code and are recorded on every visit. Measured position
-- in journey, 2025 onward:
--
--     Facebook Ads  tagged     75.7% first   24.3% later
--     AdWords       tagged     77.8% first   22.2% later
--     Bing          tagged     85.4% first   14.6% later
--     SEO           untagged   99.3% first    0.7% later
--     Direct        untagged   99.8% first    0.2% later
--     AIO           untagged   99.8% first    0.2% later
--
-- Direct at 99.8% first-touch is the proof this is mechanical, not behavioural:
-- typing a URL from memory is definitionally a return visit.
--
-- CONSEQUENCE FOR AIO. An assistant can only be credited here when it was the
-- very first thing a browser ever did. A mid-funnel AI consultation, which is
-- the position assistants actually occupy in a buying process, is discarded.
-- So `trials` for AIO means "trials whose browser was FIRST introduced to
-- Method by an assistant", not "AI-influenced trials". The second number is
-- larger and currently unmeasurable.
--
-- The conversion RATE is still a clean read, because the cohort is coherent:
-- first-touch-AI browsers, followed through to paying. It is the VOLUME that
-- is structurally understated, and understated more for untagged channels
-- than tagged ones, so cross-channel volume comparisons are biased.
--
-- Fixing this is two lines in CookieTracker.cs:165. See TICKETS.md,
-- "Pixel Tracker: Three Upstream Fixes for AI Traffic".
--
-- WINDOW STARTS 2025-01-01, AND NOT EARLIER. CampaignAdjustedRecordID only
-- began syncing to BigQuery on 2026-09-01 and carries no history, so the
-- channel is unresolvable for most pre-2025 clicks. Coverage of the trial
-- cohort, measured:
--
--     2023   30.8%      2025   93.8%
--     2024   34.2%      2026   90.7%
--
-- Extending the window backwards would silently mix a 34%-covered period with
-- a 94%-covered one and make every channel look like it grew in January 2025.
-- is_aio is unaffected by this and IS available back to 2013, because it is
-- derived from the referrer and URL rather than the campaign join. Use
-- int_cookie_clicks directly for long-run AIO click trends.
--
-- Current incomplete month excluded.

WITH trial_cohort AS (

    -- int_trials is the canonical trial definition (excludes conversion
    -- exceptions, Method Integration partner rows, and the 0001-01-01
    -- sentinel). Grain is one row per CompanyAccount, verified: 112,556 rows,
    -- 112,556 distinct CompanyAccount.
    --
    -- Stay at ACCOUNT grain deliberately. Collapsing to EntityRecordID with
    -- MIN(SignupDate) silently drops any customer whose earliest account
    -- predates the reporting window, which cost 55% of the cohort on the first
    -- build of this view.
    SELECT
        CompanyAccount,
        SignupDate AS signup_date
    FROM {{ ref('int_trials') }}

), account_cookie AS (

    -- One cookie per account. revenue.Account carries ~1.22 rows per
    -- EntityRecordID, so dedupe before joining or weights inflate.
    SELECT
        CompanyAccount,
        ANY_VALUE(CookieRecordID)         AS cookie_id,
        MIN(FirstSaaSInvoiceTxnDate)      AS first_paid_date
    FROM {{ source('revenue', 'Account') }}
    WHERE CookieRecordID IS NOT NULL
    GROUP BY CompanyAccount

), cookie_channels AS (

    -- The distinct channels that touched each cookie. AIO is promoted here,
    -- upstream of this view.
    SELECT DISTINCT
        cookie_id,
        channel
    FROM {{ ref('int_cookie_clicks') }}
    WHERE channel IS NOT NULL

), weighted AS (

    SELECT
        t.CompanyAccount,
        t.signup_date,
        ac.first_paid_date,
        cc.channel,
        1.0 / COUNT(*) OVER (PARTITION BY t.CompanyAccount) AS attribution_weight
    FROM trial_cohort t
    JOIN account_cookie ac USING (CompanyAccount)
    JOIN cookie_channels cc ON cc.cookie_id = ac.cookie_id

), synced AS (

    -- Reached a sync at any point. int_syncs is one row per sync EVENT, so
    -- dedupe to the account before joining or accounts that synced repeatedly
    -- would count more than once.
    SELECT DISTINCT CompanyAccount
    FROM {{ ref('int_syncs') }}

)

SELECT
    w.channel,
    DATE_TRUNC(w.signup_date, MONTH)                                 AS signup_month,

    SUM(w.attribution_weight)                                        AS trials,
    SUM(IF(s.CompanyAccount IS NOT NULL, w.attribution_weight, 0))   AS synced,
    SUM(IF(w.first_paid_date > DATE('0001-01-01'),
           w.attribution_weight, 0))                                 AS paying,

    -- Unweighted account count, for sanity-checking the fractional measures.
    -- Double-counts an account touched by several channels, so these sum to
    -- more than the true trial total. Never present as a channel split.
    COUNT(DISTINCT w.CompanyAccount)                                 AS trial_accounts_touched

FROM weighted w
LEFT JOIN synced s USING (CompanyAccount)
WHERE w.signup_date >= DATE('2025-01-01')
  AND w.signup_date <  DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY channel, signup_month
ORDER BY channel, signup_month
