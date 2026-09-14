{{ config(materialized='view') }}

-- One row per marketing click, with the channel CORRECTED in dbt.
--
-- WHY THIS MODEL EXISTS
--
-- Channel classification for clicks happens in Alocet: a table of ~60 ordered
-- rules (CampaignCookieSplitRules) is applied by CookieClickSplitterService,
-- and the result lands in CampaignAdjustedRecordID / SplitAdjusted. Those
-- columns finally reach BigQuery as of 2026-09-01.
--
-- That rule engine has three defects we can correct here rather than wait on:
--
--   1. Gemini is invisible. Rule 23 matches any referrer containing "google"
--      at RuleOrder 130; every AI rule sits at 194 or later and first match
--      wins. Result: 245 Gemini clicks in 2026 credited to SEO.
--   2. Perplexity is labelled "ChatGPT". Rule 70 sets the wrong SetSplitTo.
--   3. AI traffic with no referrer lands in Direct. Rule 15 catches blank
--      referrers at RuleOrder 50, before the UTM-based AI rules at 199+.
--      Result: 514 AI clicks in 2026 credited to Direct.
--
-- Correcting in dbt rather than in the rules table is deliberate. It is
-- versioned, reviewable, retroactive over the full 13-year click history, and
-- it does not require write access to a production table that has no review
-- step. The rules table stays the operational source for the Slack alerts and
-- the Att_* stamp; this model is the reporting truth.
--
-- WHAT AIO MEANS HERE
--
-- A click whose referrer or landing URL names an AI assistant. That captures
-- referred traffic and UTM-tagged traffic. It CANNOT capture Google AI
-- Overview clicks, which arrive as ordinary google.com organic with nothing to
-- distinguish them -- so AIO is a floor, not a total.
--
-- GRAIN: one row per click. Deleted and ignored clicks are excluded.

with clicks as (

    select
        cc.RecordID                     as click_id,
        cc.CampaignCookieRecordID       as cookie_id,
        cc.CreatedDate                  as clicked_at,
        cc.Referrer                     as referrer,
        cc.URL                          as landing_url,
        cc.Keyword                      as keyword,
        cc.BrowserInfo                  as browser_info,
        cc.CampaignRecordID             as campaign_raw_id,
        cc.CampaignAdjustedRecordID     as campaign_adjusted_id,
        nullif(cc.SplitAdjusted, '')    as split_adjusted,
        cc.AdjustedByRuleRecordID       as adjusted_by_rule_id,
        cc.OverrideRecordID             as override_id,
        lower(concat(ifnull(cc.Referrer, ''), ' ', ifnull(cc.URL, ''))) as match_text
    from {{ source('marketing', 'CampaignCookieClicks') }} cc
    where coalesce(cc.IsDeleted, false) = false
      and coalesce(cc.IsToBeIgnored, false) = false

), classified as (

    select
        c.*,
        cam.Name as channel_as_recorded,

        -- Which assistant, if any. Ordered so the specific wins over generic.
        case
            when regexp_contains(c.match_text, r'chatgpt|openai')   then 'ChatGPT'
            when regexp_contains(c.match_text, r'perplexity')       then 'Perplexity'
            when regexp_contains(c.match_text, r'gemini')           then 'Gemini'
            when regexp_contains(c.match_text, r'claude')           then 'Claude'
            when regexp_contains(c.match_text, r'copilot')          then 'Copilot'
            when regexp_contains(c.match_text, r'deepseek|grok\.|mistral|meta\.ai|you\.com|poe\.com')
                                                                    then 'Other AI'
        end as ai_source

    from clicks c
    -- Coalesce adjusted -> raw before joining the campaign name.
    --
    -- CampaignAdjustedRecordID only began syncing to BigQuery on 2026-09-01 and
    -- carries no history: it is 100% NULL before 2025, which left `channel`
    -- NULL on every pre-2025 click. The raw CampaignRecordID has always been
    -- present, so falling back to it recovers the channel for tagged traffic
    -- across the full history.
    --
    -- This matches what the upstream engine already does:
    -- MultiTouchAttribution.cs:255 selects
    -- ISNULL(CampaignAdjustedRef, CampaignRef) AS CampaignAdjustedRef.
    --
    -- Untagged pre-2025 clicks (campaign 0, never adjusted) still resolve to
    -- NULL, because nothing recorded what they were. That is a genuine gap,
    -- not a join bug. is_aio is unaffected either way: it is derived from the
    -- referrer and URL, never from the campaign.
    left join {{ source('marketing', 'Campaign') }} cam
      on cam.RecordID = coalesce(nullif(c.campaign_adjusted_id, 0),
                                 nullif(c.campaign_raw_id, 0))

)

select
    click_id,
    cookie_id,
    clicked_at,
    date(clicked_at)            as clicked_date,
    referrer,
    landing_url,
    keyword,
    browser_info,
    campaign_raw_id,
    campaign_adjusted_id,
    adjusted_by_rule_id,
    override_id,
    split_adjusted,

    channel_as_recorded,
    ai_source,
    ai_source is not null       as is_aio,

    -- The corrected top-level channel. AIO is promoted out of whatever the
    -- rule engine credited it to; everything else passes through untouched.
    case
        when ai_source is not null then 'AIO'
        else channel_as_recorded
    end                         as channel,

    -- Kept so the promotion is auditable: which channel each AIO click was
    -- taken from. NULL for non-AIO clicks.
    case when ai_source is not null then channel_as_recorded end
                                as channel_before_aio_promotion

from classified
