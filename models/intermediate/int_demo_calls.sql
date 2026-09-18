{{ config(materialized='view') }}

-- Intermediate model: one row per recorded call, matched to the demo meeting
-- it belongs to and carrying that meeting's lifecycle classification.
--
-- Ported from hand-written BigQuery DDL on 2026-09-15. dbt owns it now; the
-- BQ-side view is superseded and should be dropped once this has run.
--
-- Depends on revenue.int_demos, which is still a hand-built BQ base table with
-- no builder in any repo (declared under the `revenue_orphans` source so the
-- dependency is at least explicit). Its classifications are frozen at
-- 2026-08-28. Reverse-engineering it into a model is tracked separately.

-- Lifecycle fences, computed live rather than read from the frozen int_demos.
--
-- int_demos is a base table with no builder in any repo; it last refreshed
-- 2026-08-28, so every call after that had no classification at all. The fences
-- it carried are just aggregates over revenue.Funnel and revenue.Account, both
-- live, so there is no reason to depend on a snapshot for them.
--
-- Verified against int_demos before switching: 4,261 of 4,336 classified calls
-- agree (98.3%). Of the 75 that differ, 58 are customers who subscribed AFTER
-- int_demos was last built — the live computation is right and the frozen table
-- is stale. See knowledge/validations/2026-09-15-revenue-funnel.md.
--
-- Funnel caveat: it is safe for Trial and Conversion, NOT for sync timing —
-- its Sync rows carry SignupDate, not the sync date, on 39.8% of rows. first_sync
-- is passed through for context only and nothing classifies on it.
WITH fences AS (
  SELECT
    eid,
    f_trial,
    f_sync,
    f_sub,
    excl
  FROM (
    SELECT EntityRecordID AS eid,
           MIN(IF(EventType = 'Trial', DATE(Date), NULL)) AS f_trial,
           MIN(IF(EventType = 'Sync',  DATE(Date), NULL)) AS f_sync
    FROM {{ source('revenue', 'Funnel') }}
    GROUP BY eid
  ) f
  -- FULL JOIN, and select the coalesced `eid` from USING — not f.eid. An entity
  -- present only on the Account side gets f.eid = NULL, which silently dropped
  -- 44 rows into 'no_funnel_record' when this was first written.
  FULL JOIN (
    SELECT EntityRecordID AS eid,
           -- 0001-01-01 is the never-sentinel. Without NULLIF it wins every
           -- MIN() and this fence matched int_demos on only 30% of rows.
           MIN(NULLIF(DATE(FirstSaaSInvoiceTxnDate), DATE '0001-01-01')) AS f_sub,
           LOGICAL_OR(IsConversionException OR Partner = 'Method Integration') AS excl
    FROM {{ source('revenue', 'Account') }}
    GROUP BY eid
  ) a USING (eid)
),

bridge AS (
  SELECT DISTINCT entity_record_id, account_record_id, company_account
  FROM {{ ref('int_accounts') }}
  WHERE entity_record_id IS NOT NULL
),

calls AS (
  SELECT
    cv.conversation_id,
    cv.account_id,
    b.entity_record_id,
    b.company_account,
    cv.occurred_at,
    -- Toronto, not UTC. A call that ends after 20:00 ET in winter is already
    -- the next day in UTC, and would be matched to the wrong meeting by the
    -- +/-1 day window below.
    DATE(cv.occurred_at, 'America/Toronto')                      AS call_date,
    cv.call_type,
    cv.topic,
    LENGTH(COALESCE(cv.transcript_text, ''))                     AS transcript_chars
  FROM {{ source('customer_signals', 'conversations') }} cv
  -- LEFT, not INNER. An inner join here required a call to already have a CRM
  -- account, so a demo with a prospect not yet in the CRM — partner-led and
  -- IT-partner calls especially — was not shown as unlinked, it was not shown
  -- at all. 1,055 demos with real transcripts, 50-100 every month back to
  -- February, invisible to anyone without an independent roster to compare
  -- against. Reported by Sarah Trimble 2026-09-18 from a CRM-anchored roster:
  -- the view held 4 of Monday's 7 recorded demos.
  --
  -- Carried over from the hand-written BigQuery view during the 2026-09-15
  -- port (it is on line 85 of 35c6bb07), so this predates dbt.
  --
  -- The WHERE arm below is what bounds the blast radius: only call_type='demo'
  -- can enter unclassified, so this admits the 1,055 demos and none of the
  -- 129 customization / 56 free_hour / 7 support rows that are also unlinked.
  LEFT JOIN bridge b ON b.account_record_id = cv.account_id
  -- conversations is Zoom transcripts only, but that was implicit until Intercom
  -- rows were added to it in Sep 2026 and put 2,052 support chats into the demo
  -- coaching report. The filter is what stops that recurring.
  WHERE cv.source = 'zoom'
)

SELECT
  c.conversation_id,
  c.entity_record_id,
  c.account_id,
  c.company_account,
  c.occurred_at,
  c.call_date,
  c.call_type,
  c.topic,
  c.transcript_chars,
  c.transcript_chars > 200                                       AS has_transcript,

  -- the meeting this call belongs to
  d.demo_date,
  DATE_DIFF(c.call_date, d.demo_date, DAY)                       AS days_from_meeting,
  IF(c.call_date = d.demo_date, 'same_day', 'adjacent_day')      AS match_quality,

  -- Lifecycle zone, computed live from the fences above. Always populated
  -- where the entity is known, so it no longer goes NULL when int_demos is
  -- stale. Pure date comparison — this is the whole classification.
  CASE
    -- FIRST, and before the funnel branches. An unlinked call has no entity at
    -- all, so every fence comes back NULL and it would otherwise fall into
    -- 'no_funnel_record' — which asserts something different and false: that
    -- the company has an Account and simply has no funnel row. Here there is
    -- no Account, because the prospect never became a customer. Conflating the
    -- two is the same shape of bug as the 44 rows the FULL JOIN note describes.
    --
    -- 'unlinked' is about the ACCOUNT, not about identity. Method's Activity
    -- table has ContactsName and ContactsEmail for these calls, keyed by
    -- ZoomMeetingUUID = conversation_id (100 of 100 populated in a September
    -- sample). We do not ingest them yet. Do not read this value as
    -- "we don't know who was on the call".
    WHEN c.entity_record_id IS NULL THEN 'unlinked'
    WHEN fx.excl THEN 'excluded'
    WHEN fx.f_trial IS NULL AND fx.f_sub IS NULL AND fx.f_sync IS NULL
      THEN 'no_funnel_record'
    WHEN fx.f_trial IS NOT NULL AND c.call_date < fx.f_trial THEN 'pre_signup'
    WHEN fx.f_sub IS NULL OR c.call_date < fx.f_sub THEN 'pre_subscription'
    ELSE 'post_subscription'
  END                                                            AS zone,
  d.zone                                                         AS zone_int_demos,

  -- is_demo answers "did this meeting actually happen", which needs attendance
  -- evidence rather than dates. That still comes from int_demos, so it stays
  -- NULL for calls it has not seen. Do not infer it from zone.
  d.is_demo,
  d.entity_record_id IS NOT NULL                                 AS is_classified,

  -- classification_reason and confidence_note are defined ONCE in int_demos so
  -- that every meeting carries them, including the 64% with no recording.
  d.classification_reason,
  d.confidence_note,

  -- context a reader wants without having to compute it
  DATE_DIFF(c.call_date, fx.f_trial, DAY)                        AS days_since_signup,
  DATE_DIFF(c.call_date, fx.f_sub, DAY)                          AS days_since_subscribed,

  d.attended,
  d.missed,
  d.returning_customer,
  d.after_sync,
  d.typed_deliberately,
  d.multi_account_customer,

  -- fences, so a reader can see why the call was classified this way.
  -- Live, not int_demos' frozen copies.
  fx.f_trial                                                     AS first_signup,
  fx.f_sub                                                       AS first_subscribed,
  fx.f_sync                                                      AS first_sync,
  d.last_cancel_month

FROM calls c
-- LEFT, not INNER. int_demos is a frozen base table (see the header note); an
-- INNER JOIN meant every call after its last refresh vanished from this model
-- entirely rather than appearing unclassified. On 2026-09-15 that was 362 of
-- 362 transcripts since 28 Aug — the demo coaching report had shown no new
-- call for two and a half weeks, with no error and no empty-result signal.
--
-- A missing classification must degrade to a NULL zone, never to a missing
-- row: an absent call is indistinguishable from a call that never happened.
LEFT JOIN fences fx ON fx.eid = c.entity_record_id
LEFT JOIN {{ source('revenue_orphans', 'int_demos') }} d
  ON d.entity_record_id = c.entity_record_id
 AND ABS(DATE_DIFF(c.call_date, d.demo_date, DAY)) <= 1

-- One call can fall within +/-1 day of two different meetings. Keep the single
-- best match so the model is genuinely one row per conversation: same-day wins,
-- then the earlier meeting. Without this it silently duplicates 1,437 calls and
-- inflates any count taken from it.
-- Keep a call if EITHER int_demos classified it, OR Method typed it a demo.
--
-- The first arm preserves everything the old INNER JOIN produced, including
-- the 390 free-hour and 59 customization calls it pulled in by entity+date
-- proximity — dropping those would silently change Sarah's historical numbers.
--
-- The second arm is what unblocks new calls while int_demos is frozen. Without
-- it, a bare LEFT JOIN would admit all 3,901 customization and 1,598 free-hour
-- transcripts and rebuild the contamination this model was just cleaned of.
WHERE d.entity_record_id IS NOT NULL
   OR c.call_type = 'demo'

QUALIFY ROW_NUMBER() OVER (
  PARTITION BY c.conversation_id
  ORDER BY ABS(DATE_DIFF(c.call_date, d.demo_date, DAY)), d.demo_date
) = 1
