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

WITH bridge AS (
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
  JOIN bridge b ON b.account_record_id = cv.account_id
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

  -- lifecycle classification: the reason to use this model at all.
  -- NULL means int_demos has no row for this meeting yet, NOT that the call
  -- was unclassifiable. Filter on is_classified to say which you mean.
  d.zone,
  d.is_demo,
  d.entity_record_id IS NOT NULL                                 AS is_classified,

  -- classification_reason and confidence_note are defined ONCE in int_demos so
  -- that every meeting carries them, including the 64% with no recording.
  d.classification_reason,
  d.confidence_note,

  -- context a reader wants without having to compute it
  DATE_DIFF(d.demo_date, d.first_signup, DAY)                    AS days_since_signup,
  DATE_DIFF(d.demo_date, d.first_subscribed, DAY)                AS days_since_subscribed,

  d.attended,
  d.missed,
  d.returning_customer,
  d.after_sync,
  d.typed_deliberately,
  d.multi_account_customer,

  -- fences, so a reader can see why the call was classified this way
  d.first_signup,
  d.first_subscribed,
  d.first_sync,
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
