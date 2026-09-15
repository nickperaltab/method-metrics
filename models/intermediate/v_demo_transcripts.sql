{{ config(materialized='view') }}

-- The front-facing model for demo transcript analysis. `v_` because it is meant
-- to be read directly by people and by Claude sessions; int_demo_calls beneath
-- it is not.
--
-- Ported from hand-written BigQuery DDL on 2026-09-15. Point people here rather
-- than at int_demo_calls or at customer_signals.conversations: it already joins
-- the transcript text to the lifecycle classification and the V7 industry
-- labels, so no assembly is needed.
--
-- Content-bearing: transcript_text is real customer speech. It must never be
-- copied into the repo or duplicated into another table.

SELECT
  -- identity
  c.conversation_id,
  c.entity_record_id,
  c.account_id,
  c.company_account,

  -- V7 classification, straight from v7_classification.v_entity_primary_label
  -- (joined on customer_record_id = EntityRecordID). Exposed in full rather
  -- than flattened to one "industry" column, so L2/L3, operating model and the
  -- label's own confidence are all available without a second join.
  v.l1                                              AS v7_l1,
  v.l2                                              AS v7_l2,
  v.l3                                              AS v7_l3,
  v.operating_model                                 AS v7_operating_model,
  v.confidence                                      AS v7_confidence,
  v.is_multi_business                               AS v7_is_multi_business,
  v.is_multi_client                                 AS v7_is_multi_client,

  -- when
  c.occurred_at,
  c.call_date,

  -- what Method's own labelling says (NOT independent evidence)
  c.call_type,
  c.topic,

  -- what the lifecycle says
  c.is_demo,
  c.zone,
  c.classification_reason,
  c.confidence_note,
  c.returning_customer,
  c.attended,
  c.missed,
  c.days_since_signup,
  c.days_since_subscribed,
  c.match_quality,

  -- the transcript itself, so no join is needed
  c.transcript_chars,
  cv.transcript_text,
  cv.participants

FROM {{ ref('int_demo_calls') }} c
JOIN {{ source('customer_signals', 'conversations') }} cv
  ON cv.conversation_id = c.conversation_id
LEFT JOIN {{ source('v7_classification', 'v_entity_primary_label') }} v
  ON v.customer_record_id = c.entity_record_id
-- has_transcript is transcript_chars > 200. Reports that apply their own,
-- stricter threshold (a stored prompt was using > 2000) will under-count real
-- transcripts — align on this one rather than re-deciding per report.
WHERE c.has_transcript
