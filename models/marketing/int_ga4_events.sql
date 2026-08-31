{{ config(materialized='view') }}

-- Flattened, cleaned GA4 events. The ONLY thing that should read the raw
-- analytics_274554544 export. Everything downstream reads this.
--
-- Two jobs:
--
-- 1. Drop QA and dev traffic. ~23.3% of raw events come from automated test
--    instances (m11*.methodwarehouse.com regression suites, mta*) and local
--    dev boxes (*.methodlocal.com) that carry the production GTM container.
--    290 distinct hostnames. The regex was tested against every host present:
--    it excludes 14,993 of 64,298 events, misses 9 (two low-volume test hosts),
--    and produces zero false positives. Customer app subdomains on method.me
--    (watterslandscape.method.me etc.) are REAL traffic and are kept.
--
--    Filtering here rather than in GTM is deliberate: it is reversible, it is
--    in git, and it preserves the raw rows. A GTM exception would discard them
--    permanently. Quota is not a factor (0.07M events/day against a 1M limit).
--    GTM filtering is still worth doing for the GA4 UI's own reporting, which
--    this model cannot fix -- but it is not a prerequisite for anything here.
--
-- 2. Flatten the event_params people actually use, so downstream models are not
--    re-writing UNNEST subqueries. Raw nested columns stay available via the
--    source if something unusual is needed.
--
-- Grain: one row per GA4 event.
--
-- CAVEAT -- no identity. user_id is NULL on 100% of rows today (0 of 64,392 as
-- of 2026-08-30) because nothing writes it at sign-in. user_pseudo_id is the
-- _ga client id and is the only handle on a visitor. Until user_id is set,
-- these events CANNOT be joined to a Method account, and any "journey" built
-- from this model is anonymous. See docs: T3 in the attribution plan.
--
-- CAVEAT -- both complete and partial days. events_* spans daily tables
-- (complete) and events_intraday_* (best-effort, incomplete). is_intraday
-- flags which is which; exclude intraday for anything that must reconcile.

with raw_events as (

    select
        _TABLE_SUFFIX as table_suffix,
        event_date,
        event_timestamp,
        event_name,
        user_pseudo_id,

        -- Guard against malformed user_id. On 2026-08-31 between 20:20 and
        -- ~20:30 UTC a GTM RegEx Table variable shipped without capture-group
        -- substitution enabled, so user_id was set to the whole page URL
        -- instead of the account slug (101 events, 14 distinct values). Fixed
        -- in GTM, but those rows persist in the raw export, which we never
        -- edit -- Google owns those tables and rewrites intraday nightly.
        -- A valid value is a CompanyAccount slug: lowercase, no scheme, no
        -- slashes. Anything else becomes NULL rather than being dropped, so
        -- the event still counts as traffic and only the identity is voided.
        case
            when user_id is null                                  then null
            when regexp_contains(user_id, r'^[a-z0-9][a-z0-9-]{1,62}$') then user_id
            else null
        end                                                       as user_id,
        event_params,
        user_properties,
        traffic_source,
        device,
        geo
    from {{ source('ga4', 'events_*') }}

), flattened as (

    select
        parse_date('%Y%m%d', event_date)                      as event_date,
        timestamp_micros(event_timestamp)                     as event_at,
        starts_with(table_suffix, 'intraday_')                as is_intraday,
        event_name,
        user_pseudo_id,
        user_id,

        (select value.string_value from unnest(event_params) where key = 'page_location') as page_location,
        (select value.string_value from unnest(event_params) where key = 'page_referrer') as page_referrer,
        (select value.string_value from unnest(event_params) where key = 'page_title')    as page_title,
        (select value.int_value    from unnest(event_params) where key = 'ga_session_id') as ga_session_id,
        (select value.string_value from unnest(event_params) where key = 'gclid')         as gclid,
        (select value.string_value from unnest(event_params) where key = 'userType')      as user_type,

        traffic_source.source                                 as traffic_source,
        traffic_source.medium                                 as traffic_medium,
        traffic_source.name                                   as traffic_campaign,
        device.category                                       as device_category,
        geo.country                                           as country

    from raw_events

), parsed as (

    select
        *,

        -- Account slug derived from the URL, independent of GA4's user_id.
        --
        -- This is the better source and it should be preferred. The account has
        -- always been present in page_location -- ?accountName=<slug> on the
        -- signup completion page, and ?returnUrl=https://<slug>.method.me on
        -- sign-in -- so it can be extracted here for EVERY event already
        -- collected, back to the export going live on 2026-08-28.
        --
        -- GTM's user_id only applies going forward and is what produced the
        -- malformed rows above. Keep both: user_id drives GA4's own UI
        -- reporting and cross-device stitching, account_slug is what the
        -- warehouse should join on.
        --
        -- Non-account subdomains are excluded so a returnUrl pointing at
        -- www/grow/forums does not masquerade as a customer.
        coalesce(
            lower(regexp_extract(page_location, r'(?i)[?&]accountName=([^&#]+)')),
            nullif(
                regexp_replace(
                    lower(coalesce(regexp_extract(
                        page_location,
                        r'(?i)returnUrl=https?(?::|%3A)(?:/{2}|%2F%2F)([^./%]+)\.method\.me'
                    ), '')),
                    r'^(www|grow|forums|help|info|blog|status|signin|signup)$', ''
                ), ''
            )
        )                                                                    as account_slug,

        lower(regexp_extract(page_location, r'^(?:https?://)?([^/?#]+)'))    as page_host,
        regexp_replace(
            regexp_extract(lower(page_location), r'^(?:https?://)?[^/?#]*([^?#]*)'),
            r'/$', ''
        )                                                                    as page_path
    from flattened

)

select
    event_date,
    event_at,
    is_intraday,
    event_name,
    user_pseudo_id,
    user_id,
    account_slug,
    page_host,
    nullif(page_path, '') as page_path,
    page_location,
    page_referrer,
    page_title,
    ga_session_id,
    gclid,
    user_type,
    traffic_source,
    traffic_medium,
    traffic_campaign,
    device_category,
    country,

    -- Coarse buckets so downstream models stop re-deriving them. `app` is real
    -- customer usage on *.method.me subdomains and on signin/signup, not noise.
    case
        when page_host in ('www.method.me', 'method.me')
             and starts_with(page_path, '/blog')              then 'blog'
        when page_host in ('www.method.me', 'method.me')
             and starts_with(page_path, '/pricing-guides')    then 'pricing_guides'
        when page_host in ('www.method.me', 'method.me')
             and starts_with(page_path, '/resources')         then 'resources'
        when page_host in ('www.method.me', 'method.me')      then 'marketing_site'
        when page_host = 'grow.method.me'                     then 'campaign_landing'
        when starts_with(page_host, 'signup.')                then 'signup'
        when starts_with(page_host, 'signin.')                then 'signin'
        when page_host = 'forums.method.me'                   then 'forums'
        when page_host is null                                then 'unknown'
        else 'app'
    end as page_area

from parsed

-- QA / dev exclusion. See the header comment for how this regex was validated.
where page_host is null
   or not regexp_contains(page_host, r'^m\d|^mta|\.methodlocal\.com$')
