{{ config(materialized='view') }}

-- CONSUMER VIEW. The page-by-page journey for visitors we can tie to a
-- Method account. This is what marketing points Looker at for "which content
-- earns customers". Built on int_ga4_events; do not read the raw export.
--
-- HOW THE STITCH WORKS, and why it recovers anonymous history:
--
--   user_pseudo_id is the _ga cookie and is stable per browser. Most events
--   carry no identity. But if ANY event on that browser exposes the account
--   (the signup completion URL, or a sign-in returnUrl), we can bind the
--   browser to the account and then attribute every OTHER event on the same
--   browser -- including pages read weeks earlier, while anonymous.
--
--   That is why this works retroactively over data already collected, rather
--   than only from the day identification was switched on.
--
-- IDENTITY SOURCE: account_slug from int_ga4_events, parsed out of the URL.
-- Deliberately NOT GA4's user_id. The slug is derivable for every event ever
-- exported; user_id only exists from 2026-08-31 onward and briefly carried
-- malformed values. user_id is still populated for GA4's own UI reporting.
--
-- GRAIN: one row per (browser, event). A browser appears only if it was bound
-- to an account at some point.
--
-- CAVEATS a consumer must know:
--
--  * NO HISTORY BEFORE 2026-08-28. The GA4 export started then and does not
--    backfill. Journeys for anyone acquired earlier do not exist anywhere.
--  * ONE BROWSER, NOT ONE PERSON. Read on a phone, sign in on a laptop, and
--    they are two rows with no link. Cross-device is not solved.
--  * A browser bound to more than one account (shared machine, agency,
--    partner) keeps only its most recent binding; account_count flags them.
--  * GA4 is switched OFF inside the product -- the GA4 config tag excludes
--    Method App Traffic -- so in-app behaviour is largely absent by design.
--  * ~24% of slugs do not match revenue.Account. Mostly QA accounts and
--    nightly-mirror lag on same-day signups. is_known_account flags the join.

with events as (

    select *
    from {{ ref('int_ga4_events') }}
    where user_pseudo_id is not null

), binding as (

    -- One account per browser: the most recently seen slug wins.
    select
        user_pseudo_id,
        array_agg(account_slug order by event_at desc limit 1)[offset(0)] as account_slug,
        count(distinct account_slug)                                     as account_count,
        min(event_at)                                                    as first_identified_at
    from events
    where account_slug is not null
    group by 1

), joined as (

    select
        b.account_slug,
        b.account_count,
        e.user_pseudo_id,
        e.event_date,
        e.event_at,
        e.is_intraday,
        e.event_name,
        e.page_area,
        e.page_host,
        e.page_path,
        e.page_referrer,
        e.traffic_source,
        e.traffic_medium,
        e.traffic_campaign,
        e.gclid,
        e.device_category,
        e.country,
        -- Was this specific event the one that revealed the identity, or was it
        -- anonymous at the time and only attributed later?
        e.account_slug is not null                                       as was_identified_at_the_time
    from events e
    join binding b using (user_pseudo_id)

), sequenced as (

    select
        *,
        row_number() over (partition by user_pseudo_id order by event_at)        as step,
        count(*)     over (partition by user_pseudo_id)                          as total_steps,
        min(event_at) over (partition by user_pseudo_id)                         as journey_start_at
    from joined
    where event_name = 'page_view'

)

select
    s.account_slug,
    a.EntityRecordID                                                     as entity_record_id,
    a.CompanyAccount                                                     as company_account,
    a.CompanyAccount is not null                                         as is_known_account,
    date(a.SignUpDate)                                                   as signup_date,
    a.FirstSaaSInvoiceTxnDate                                            as first_paid_date,
    a.FirstSaaSInvoiceTxnDate > date '1900-01-01'                        as is_paying,

    s.user_pseudo_id,
    s.account_count,
    s.step,
    s.total_steps,
    s.step = 1                                                           as is_first_page,
    s.step = s.total_steps                                               as is_last_page,
    timestamp_diff(s.event_at, s.journey_start_at, minute)               as minutes_into_journey,
    s.was_identified_at_the_time,

    s.event_date,
    s.event_at,
    s.is_intraday,
    s.page_area,
    s.page_host,
    s.page_path,
    s.page_referrer,
    s.traffic_source,
    s.traffic_medium,
    s.traffic_campaign,
    s.gclid,
    s.device_category,
    s.country

from sequenced s
left join (
    -- revenue.Account has ~1.22 rows per EntityRecordID; dedup before joining.
    select * except(rn) from (
        select
            EntityRecordID, CompanyAccount, SignUpDate, FirstSaaSInvoiceTxnDate,
            row_number() over (partition by lower(CompanyAccount) order by SignUpDate) as rn
        from {{ source('revenue', 'Account') }}
    ) where rn = 1
) a
  on lower(a.CompanyAccount) = s.account_slug
