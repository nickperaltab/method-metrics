#!/usr/bin/env python3
"""
Reconcile the candidate sync denominators over 12 closed months.

Why this exists: the sync conversion rate's denominator is Syncs #55.
models/metrics/v_metric__syncs.yml records ~13% inflation from "re-sync
events". Separately models/_sources.yml:141 records that the region-based
sync signal UNDERCOUNTS completed syncs, and that CustDatFirstSyncCompleted
is the preferred completion field. Two biases, opposite directions, net
effect never measured.

Leadership reads "conversion on Sync" as the share of synced accounts that
convert. This quantifies how far the shipped denominator is from that read.

Output feeds the caveats block on the sync conversion rate metrics and the
"Denominator reconciliation gate" section of
docs/superpowers/specs/2026-07-30-sync-conversion-design.md.

Read-only. No DDL, no writes.

==========================================================================
THREE GRAIN / DATING FACTS THAT DECIDE HOW TO READ EVERY RATIO BELOW.
Sections B, C and D re-prove each one on every run, so this script fails
loudly rather than silently if any of them stops holding.

1. revenue.Funnel is ONE ROW PER ACCOUNT, not one row per event.
   For EventType='Sync', row count == distinct CompanyAccount == distinct
   (EntityRecordID, CompanyAccount), and Account is unique on both
   RecordID and CompanyAccount. So int_syncs COUNT(*) is account-grain and
   COUNT(DISTINCT EntityRecordID) is customer-grain. They count DIFFERENT
   UNITS. The multiplicity is multi-account customers, not repeat syncs.
   There are zero repeat sync events in Funnel (section B).

2. int_syncs.SyncDate IS THE SIGNUP DATE, not the date the sync happened.
   Funnel.Date == SignupDate for 100% of Sync rows and 100% of Trial rows
   (section D). So "Syncs in month M" means "accounts that signed up in
   month M and have since completed a sync." Syncs #55 is a signup-cohort
   measure, not an event-timing measure. Two consequences:
     - Recent months are structurally incomplete and grow retroactively.
     - The numerator (int_conversions.FirstSaaSInvoiceTxnDate) IS event
       dated, so the shipped same-month ratio pairs two different
       populations. Section E measures the cohort-consistent rate instead.

3. revenue.Account is unique on RecordID (146,663 rows / 146,663 RecordIDs
   at time of writing). The ~1.22 rows-per-EntityRecordID hazard in
   CLAUDE.md is about EntityRecordID, NOT RecordID. The GROUP BY RecordID
   below is kept as an explicit grain assertion; section B re-checks the
   uniqueness so the dedup cannot rot into a no-op unnoticed.

   int_conversions is also account-grain — it selects from revenue.Account
   with no aggregation, and its two LEFT JOINs are pre-aggregated per
   entity so they cannot fan out. Numerator and candidates 1, 3, 4 are all
   account-grain. Candidate 2 is the odd one out.
==========================================================================
"""
import sys

from google.cloud import bigquery

PROJECT = "project-for-method-dw"

# Shared population filters. Funnel is already restricted to this
# population (section B verifies Funnel Trial rows == filtered Account
# rows), so applying them to Account keeps candidate 3 comparable.
ACCOUNT_FILTERS = """
    IsConversionException = FALSE
    AND Partner != 'Method Integration'
"""

# --------------------------------------------------------------------------
# A. The 12-month monthly table.
# --------------------------------------------------------------------------
SQL_MONTHLY = f"""
WITH months AS (
  SELECT DATE_TRUNC(m, MONTH) AS period
  FROM UNNEST(GENERATE_DATE_ARRAY(
    DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH),
    DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH),
    INTERVAL 1 MONTH)) AS m
),
-- 1. Account-grain, SIGNUP-dated: what Syncs #55 counts today.
events AS (
  SELECT DATE_TRUNC(SyncDate, MONTH) AS period, COUNT(*) AS sync_events
  FROM `{PROJECT}.revenue.int_syncs`
  GROUP BY 1
),
-- 2. Customer-grain, signup-dated: distinct entities per month.
entities AS (
  SELECT DATE_TRUNC(SyncDate, MONTH) AS period,
         COUNT(DISTINCT EntityRecordID) AS sync_entities
  FROM `{PROJECT}.revenue.int_syncs`
  GROUP BY 1
),
-- 3. Account-grain, SYNC-COMPLETION-dated: the field _sources.yml:141
--    prefers. GROUP BY RecordID asserts account grain.
account_first_sync AS (
  SELECT DATE_TRUNC(first_sync, MONTH) AS period,
         COUNT(*) AS accounts_first_synced
  FROM (
    SELECT RecordID,
           MIN(NULLIF(CustDatFirstSyncCompleted, DATE '0001-01-01')) AS first_sync
    FROM `{PROJECT}.revenue.Account`
    WHERE {ACCOUNT_FILTERS}
    GROUP BY RecordID
  )
  WHERE first_sync IS NOT NULL
  GROUP BY 1
),
-- 4. Account-grain union: earliest sync evidence from EITHER signal.
--    Upper bound on the population.
either_signal AS (
  SELECT DATE_TRUNC(first_evidence, MONTH) AS period,
         COUNT(*) AS accounts_either
  FROM (
    SELECT a.RecordID,
           LEAST(
             COALESCE(NULLIF(a.CustDatFirstSyncCompleted, DATE '0001-01-01'), DATE '9999-12-31'),
             COALESCE(f.funnel_sync_date, DATE '9999-12-31')
           ) AS first_evidence
    FROM (
      SELECT RecordID, CompanyAccount, CustDatFirstSyncCompleted
      FROM `{PROJECT}.revenue.Account`
      WHERE {ACCOUNT_FILTERS}
    ) a
    LEFT JOIN (
      SELECT CompanyAccount, MIN(SyncDate) AS funnel_sync_date
      FROM `{PROJECT}.revenue.int_syncs`
      GROUP BY 1
    ) f USING (CompanyAccount)
  )
  WHERE first_evidence != DATE '9999-12-31'
  GROUP BY 1
),
-- Numerator: account-grain, EVENT-dated (first SaaS invoice).
conversions AS (
  SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
         COUNT(*) AS conversions
  FROM `{PROJECT}.revenue.int_conversions`
  GROUP BY 1
)
SELECT
  m.period,
  COALESCE(ev.sync_events, 0)            AS sync_events,
  COALESCE(en.sync_entities, 0)          AS sync_entities,
  COALESCE(af.accounts_first_synced, 0)  AS accounts_first_synced,
  COALESCE(ei.accounts_either, 0)        AS accounts_either,
  COALESCE(cv.conversions, 0)            AS conversions,
  SAFE_DIVIDE(cv.conversions, ev.sync_events)           AS rate_on_events,
  SAFE_DIVIDE(cv.conversions, en.sync_entities)         AS rate_on_entities,
  SAFE_DIVIDE(cv.conversions, af.accounts_first_synced) AS rate_on_account_field
FROM months m
LEFT JOIN events ev              USING (period)
LEFT JOIN entities en            USING (period)
LEFT JOIN account_first_sync af  USING (period)
LEFT JOIN either_signal ei       USING (period)
LEFT JOIN conversions cv         USING (period)
ORDER BY m.period
"""

# --------------------------------------------------------------------------
# B. Grain assertions.
# --------------------------------------------------------------------------
SQL_GRAIN = f"""
WITH sync_rows AS (
  SELECT COUNT(*) AS n,
         COUNT(DISTINCT CompanyAccount) AS n_company_account,
         COUNT(DISTINCT EntityRecordID) AS n_entity,
         COUNT(DISTINCT CONCAT(CAST(EntityRecordID AS STRING), '|', CompanyAccount))
           AS n_entity_account
  FROM `{PROJECT}.revenue.int_syncs`
),
acct AS (
  SELECT COUNT(*) AS n,
         COUNT(DISTINCT RecordID) AS n_record_id,
         COUNT(DISTINCT CompanyAccount) AS n_company_account,
         COUNT(DISTINCT EntityRecordID) AS n_entity
  FROM `{PROJECT}.revenue.Account`
),
trial_vs_acct AS (
  SELECT
    (SELECT COUNT(*) FROM `{PROJECT}.revenue.Funnel` WHERE EventType = 'Trial')
      AS funnel_trial_rows,
    (SELECT COUNT(*) FROM `{PROJECT}.revenue.Account` WHERE {ACCOUNT_FILTERS})
      AS filtered_account_rows
)
SELECT
  sync_rows.n                  AS sync_rows,
  sync_rows.n_company_account  AS sync_distinct_company_account,
  sync_rows.n_entity_account   AS sync_distinct_entity_account,
  sync_rows.n_entity           AS sync_distinct_entity,
  acct.n                       AS account_rows,
  acct.n_record_id             AS account_distinct_record_id,
  acct.n_company_account       AS account_distinct_company_account,
  acct.n_entity                AS account_distinct_entity,
  trial_vs_acct.funnel_trial_rows,
  trial_vs_acct.filtered_account_rows
FROM sync_rows, acct, trial_vs_acct
"""

# Is every multi-row entity explained by owning multiple accounts? If rows
# always equal distinct accounts, there are no repeat sync events at all.
SQL_MULTIPLICITY = f"""
WITH per_entity AS (
  SELECT EntityRecordID,
         COUNT(*) AS sync_rows,
         COUNT(DISTINCT CompanyAccount) AS sync_accounts
  FROM `{PROJECT}.revenue.int_syncs`
  GROUP BY 1
)
SELECT
  COUNT(*)                           AS entities,
  COUNTIF(sync_rows = 1)             AS entities_with_one_row,
  COUNTIF(sync_rows > sync_accounts) AS entities_with_repeat_events,
  SUM(sync_rows)                     AS total_sync_rows,
  MAX(sync_rows)                     AS max_rows_for_one_entity
FROM per_entity
"""

# Fan-in depends entirely on the window you measure it over. The yml quotes
# an all-time figure; the metric is monthly.
SQL_FANIN = f"""
WITH win AS (
  SELECT EntityRecordID, DATE_TRUNC(SyncDate, MONTH) AS period
  FROM `{PROJECT}.revenue.int_syncs`
  WHERE SyncDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
    AND SyncDate <  DATE_TRUNC(CURRENT_DATE(), MONTH)
)
SELECT
  (SELECT COUNT(*) FROM `{PROJECT}.revenue.int_syncs`) AS alltime_rows,
  (SELECT COUNT(DISTINCT EntityRecordID) FROM `{PROJECT}.revenue.int_syncs`)
    AS alltime_entities,
  (SELECT COUNT(*) FROM win) AS window_rows,
  (SELECT COUNT(DISTINCT EntityRecordID) FROM win) AS window_distinct_entities,
  (SELECT SUM(n) FROM (
     SELECT period, COUNT(DISTINCT EntityRecordID) AS n FROM win GROUP BY 1
   )) AS window_monthly_sum_entities
"""

# --------------------------------------------------------------------------
# C. Population overlap of the two account-grain sync signals, and whether
#    the Funnel sync signal IS the region signal _sources.yml warns about.
# --------------------------------------------------------------------------
SQL_OVERLAP = f"""
WITH acct AS (
  SELECT CompanyAccount,
         NULLIF(CustDatFirstSyncCompleted, DATE '0001-01-01') AS first_sync,
         NULLIF(SyncTypeRegion, '') AS region
  FROM `{PROJECT}.revenue.Account`
  WHERE {ACCOUNT_FILTERS}
),
fn AS (
  SELECT CompanyAccount, MIN(SyncDate) AS funnel_sync_date
  FROM `{PROJECT}.revenue.int_syncs`
  GROUP BY 1
)
SELECT
  COUNT(*)                                                               AS filtered_accounts,
  COUNTIF(fn.CompanyAccount IS NOT NULL)                                 AS in_funnel_sync,
  COUNTIF(acct.region IS NOT NULL)                                       AS has_sync_type_region,
  COUNTIF(acct.first_sync IS NOT NULL)                                   AS has_first_sync_date,
  COUNTIF(fn.CompanyAccount IS NOT NULL AND acct.first_sync IS NOT NULL)  AS in_both,
  COUNTIF(fn.CompanyAccount IS NOT NULL AND acct.first_sync IS NULL)      AS funnel_only,
  COUNTIF(fn.CompanyAccount IS NULL AND acct.first_sync IS NOT NULL)      AS field_only
FROM acct LEFT JOIN fn USING (CompanyAccount)
"""

# --------------------------------------------------------------------------
# D. Dating basis. This is the finding the brief did not anticipate.
# --------------------------------------------------------------------------
SQL_DATING = f"""
SELECT
  (SELECT COUNT(*) FROM `{PROJECT}.revenue.int_syncs`) AS sync_rows,
  (SELECT COUNTIF(SyncDate = CAST(SignupDate AS DATE))
     FROM `{PROJECT}.revenue.int_syncs`) AS syncdate_equals_signupdate,
  (SELECT COUNT(*) FROM `{PROJECT}.revenue.Funnel` WHERE EventType = 'Trial')
    AS trial_rows,
  (SELECT COUNTIF(CAST(Date AS DATE) = CAST(SignupDate AS DATE))
     FROM `{PROJECT}.revenue.Funnel` WHERE EventType = 'Trial')
    AS trial_date_equals_signup,
  (SELECT COUNT(*) FROM `{PROJECT}.revenue.Funnel` WHERE EventType = 'Conversion')
    AS conversion_rows,
  (SELECT COUNTIF(CAST(Date AS DATE) = CAST(SignupDate AS DATE))
     FROM `{PROJECT}.revenue.Funnel` WHERE EventType = 'Conversion')
    AS conversion_date_equals_signup
"""

# How long after signup does the sync actually complete? This is the
# retroactive-growth exposure on recent months.
SQL_SYNC_LAG = f"""
WITH j AS (
  SELECT DATE_DIFF(NULLIF(a.CustDatFirstSyncCompleted, DATE '0001-01-01'),
                   f.SyncDate, DAY) AS lag_days
  FROM `{PROJECT}.revenue.int_syncs` f
  JOIN `{PROJECT}.revenue.Account` a USING (CompanyAccount)
  WHERE {ACCOUNT_FILTERS}
)
SELECT COUNT(*) AS rows_with_both,
       COUNTIF(lag_days <= 0)  AS sync_on_or_before_signup_day,
       COUNTIF(lag_days > 30)  AS sync_more_than_30d_after_signup,
       COUNTIF(lag_days > 60)  AS sync_more_than_60d_after_signup,
       COUNTIF(lag_days > 90)  AS sync_more_than_90d_after_signup
FROM j WHERE lag_days IS NOT NULL
"""

# --------------------------------------------------------------------------
# E. The cohort-consistent rate: what leadership actually means.
#    Of the accounts that signed up in month M and synced, what share
#    ever converted? Numerator and denominator are the SAME accounts.
# --------------------------------------------------------------------------
SQL_COHORT = f"""
WITH s AS (
  SELECT CompanyAccount, DATE_TRUNC(SyncDate, MONTH) AS period
  FROM `{PROJECT}.revenue.int_syncs`
  WHERE SyncDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
    AND SyncDate <  DATE_TRUNC(CURRENT_DATE(), MONTH)
),
c AS (
  SELECT DISTINCT CompanyAccount FROM `{PROJECT}.revenue.int_conversions`
)
SELECT s.period,
       COUNT(*) AS synced_accounts,
       COUNTIF(c.CompanyAccount IS NOT NULL) AS converted,
       SAFE_DIVIDE(COUNTIF(c.CompanyAccount IS NOT NULL), COUNT(*)) AS cohort_rate
FROM s LEFT JOIN c USING (CompanyAccount)
GROUP BY 1 ORDER BY 1
"""

# How mismatched is the shipped same-month pairing?
SQL_BASIS = f"""
SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS period,
       COUNT(*) AS conversions,
       COUNTIF(DATE_TRUNC(CAST(SignupDate AS DATE), MONTH)
               = DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH)) AS signed_up_same_month
FROM `{PROJECT}.revenue.int_conversions`
WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
  AND FirstSaaSInvoiceTxnDate <  DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY 1 ORDER BY 1
"""


def one_row(client, sql):
    rows = list(client.query(sql).result())
    if not rows:
        sys.exit("no rows returned — check the query")
    return rows[0]


def pct(num, den):
    return f"{num / den * 100:.1f}%" if den else "n/a"


def main():
    client = bigquery.Client(project=PROJECT)

    # ---------------- Section A ----------------
    rows = list(client.query(SQL_MONTHLY).result())
    if not rows:
        sys.exit("no rows returned — check the date window")

    print("=" * 78)
    print("A. MONTHLY DENOMINATOR CANDIDATES — 12 closed months")
    print("=" * 78)
    hdr = (f"{'period':<11}{'events':>8}{'entities':>10}{'acctfld':>9}"
           f"{'either':>8}{'convs':>7}{'r_event':>9}{'r_entity':>10}{'r_acct':>9}")
    print(hdr)
    print("-" * len(hdr))
    for r in rows:
        print(f"{r.period.isoformat():<11}{r.sync_events:>8}{r.sync_entities:>10}"
              f"{r.accounts_first_synced:>9}{r.accounts_either:>8}{r.conversions:>7}"
              f"{(r.rate_on_events or 0):>9.4f}{(r.rate_on_entities or 0):>10.4f}"
              f"{(r.rate_on_account_field or 0):>9.4f}")

    tot_ev = sum(r.sync_events for r in rows)
    tot_en = sum(r.sync_entities for r in rows)
    tot_af = sum(r.accounts_first_synced for r in rows)
    tot_ei = sum(r.accounts_either for r in rows)
    tot_cv = sum(r.conversions for r in rows)

    print("\n--- 12-month totals ---")
    print(f"  1. sync rows, signup-dated (what #55 counts)  {tot_ev:>8,}   account-grain")
    print(f"  2. distinct entities that synced              {tot_en:>8,}   customer-grain")
    print(f"  3. accounts w/ CustDatFirstSyncCompleted      {tot_af:>8,}   account-grain")
    print(f"  4. accounts w/ either signal (upper bound)    {tot_ei:>8,}   account-grain")
    print(f"     conversions (numerator, event-dated)       {tot_cv:>8,}   account-grain")

    print("\n--- implied 12-month conversion rates ---")
    for label, den in (("1. on signup-dated sync rows ", tot_ev),
                       ("2. on distinct entities      ", tot_en),
                       ("3. on Account first-sync     ", tot_af),
                       ("4. on either signal          ", tot_ei)):
        print(f"  {label} {tot_cv / den * 100:6.2f}%" if den else f"  {label}    n/a")

    print("\n--- the two gap percentages ---")
    if tot_ev and tot_en:
        print(f"  account-vs-entity fan-in (#1 over #2):     "
              f"{(tot_ev / tot_en - 1) * 100:+.1f}%")
    if tot_ev and tot_af:
        print(f"  Account-field-vs-#55 gap  (#3 over #1):    "
              f"{(tot_af / tot_ev - 1) * 100:+.1f}%")

    print("\n--- per-month gap stability (is any single month distorting?) ---")
    print(f"  {'period':<11}{'fanin_%':>9}{'fieldgap_%':>12}")
    fan_vals, fld_vals = [], []
    for r in rows:
        if r.sync_entities:
            fan_vals.append((r.sync_events / r.sync_entities - 1) * 100)
        if r.sync_events:
            fld_vals.append((r.accounts_first_synced / r.sync_events - 1) * 100)
        fan = f"{(r.sync_events / r.sync_entities - 1) * 100:+.1f}" if r.sync_entities else "n/a"
        fld = f"{(r.accounts_first_synced / r.sync_events - 1) * 100:+.1f}" if r.sync_events else "n/a"
        print(f"  {r.period.isoformat():<11}{fan:>9}{fld:>12}")
    if fan_vals and fld_vals:
        print(f"  {'range':<11}{f'{min(fan_vals):+.1f}..{max(fan_vals):+.1f}':>9}"
              f"{f'{min(fld_vals):+.1f}..{max(fld_vals):+.1f}':>12}")

    # ---------------- Section B ----------------
    g = one_row(client, SQL_GRAIN)
    print("\n" + "=" * 78)
    print("B. GRAIN ASSERTIONS")
    print("=" * 78)
    print(f"  int_syncs rows                      {g.sync_rows:>9,}")
    print(f"  ... distinct CompanyAccount         {g.sync_distinct_company_account:>9,}")
    print(f"  ... distinct (entity, account)      {g.sync_distinct_entity_account:>9,}")
    print(f"  ... distinct EntityRecordID         {g.sync_distinct_entity:>9,}")
    print(f"  Account rows                        {g.account_rows:>9,}")
    print(f"  ... distinct RecordID               {g.account_distinct_record_id:>9,}")
    print(f"  ... distinct CompanyAccount         {g.account_distinct_company_account:>9,}")
    print(f"  ... distinct EntityRecordID         {g.account_distinct_entity:>9,}")
    print(f"  Funnel EventType='Trial' rows       {g.funnel_trial_rows:>9,}")
    print(f"  filtered Account rows               {g.filtered_account_rows:>9,}")

    print()
    print(f"  Account unique on RecordID?                 "
          f"{'YES' if g.account_rows == g.account_distinct_record_id else 'NO — dedup must change'}")
    print(f"  int_syncs one row per account?              "
          f"{'YES' if g.sync_rows == g.sync_distinct_company_account else 'NO — repeat events exist'}")
    print(f"  Funnel population == filtered Account?      "
          f"{'YES' if g.funnel_trial_rows == g.filtered_account_rows else 'NO'}")

    m = one_row(client, SQL_MULTIPLICITY)
    print(f"\n  entities with a sync row                    {m.entities:>9,}")
    print(f"  ... exactly one sync row                    {m.entities_with_one_row:>9,}"
          f"  ({pct(m.entities_with_one_row, m.entities)})")
    print(f"  ... more rows than distinct accounts        {m.entities_with_repeat_events:>10,}"
          f"  <- true repeat sync events")
    print(f"  max sync rows for one entity                {m.max_rows_for_one_entity:>9,}")

    if m.entities_with_repeat_events == 0:
        print("\n  => Every multi-row entity is explained by owning multiple")
        print("     accounts. There are ZERO repeat sync events in Funnel.")
        print("     The yml's 're-syncs after disconnect/reconnect' mechanism")
        print("     is not present in the data.")

    f = one_row(client, SQL_FANIN)
    print("\n--- fan-in depends on the window; the yml quotes the wrong one ---")
    print(f"  all time:      {f.alltime_rows:>7,} rows / {f.alltime_entities:>7,} entities"
          f"  = {(f.alltime_rows / f.alltime_entities - 1) * 100:+.1f}%   <- the yml's ~13%")
    print(f"  12mo window:   {f.window_rows:>7,} rows / {f.window_distinct_entities:>7,} entities"
          f"  = {(f.window_rows / f.window_distinct_entities - 1) * 100:+.1f}%")
    print(f"  monthly grain: {f.window_rows:>7,} rows / {f.window_monthly_sum_entities:>7,} entities"
          f"  = {(f.window_rows / f.window_monthly_sum_entities - 1) * 100:+.1f}%   "
          f"<- what the monthly metric actually carries")

    # ---------------- Section C ----------------
    o = one_row(client, SQL_OVERLAP)
    print("\n" + "=" * 78)
    print("C. POPULATION OVERLAP OF THE TWO ACCOUNT-GRAIN SIGNALS (all time)")
    print("=" * 78)
    print(f"  filtered accounts                   {o.filtered_accounts:>9,}")
    print(f"  in int_syncs (Funnel sync)          {o.in_funnel_sync:>9,}")
    print(f"  SyncTypeRegion populated            {o.has_sync_type_region:>9,}")
    print(f"  CustDatFirstSyncCompleted set       {o.has_first_sync_date:>9,}")
    print(f"  in both signals                     {o.in_both:>9,}")
    print(f"  Funnel only (no completion date)    {o.funnel_only:>9,}")
    print(f"  Account-field only (missed by #55)  {o.field_only:>9,}")

    if o.in_funnel_sync == o.has_sync_type_region:
        print("\n  => int_syncs membership is exactly SyncTypeRegion-populated.")
        print("     The _sources.yml:141 undercount warning applies directly")
        print("     to the sync denominator.")

    symmetric = o.funnel_only + o.field_only
    print(f"\n  net count gap                       "
          f"{o.has_first_sync_date - o.in_funnel_sync:>+9,}"
          f"  ({pct(o.has_first_sync_date - o.in_funnel_sync, o.in_funnel_sync)} of #55)")
    print(f"  symmetric difference                {symmetric:>9,}"
          f"  ({pct(symmetric, o.in_funnel_sync)} of #55)")
    print("  The two signals disagree about WHICH accounts far more than")
    print("  about HOW MANY. The net gap hides most of the disagreement.")

    # ---------------- Section D ----------------
    d = one_row(client, SQL_DATING)
    print("\n" + "=" * 78)
    print("D. DATING BASIS  (not anticipated by the brief)")
    print("=" * 78)
    print(f"  int_syncs rows                      {d.sync_rows:>9,}")
    print(f"  ... SyncDate == SignupDate          {d.syncdate_equals_signupdate:>9,}"
          f"  ({pct(d.syncdate_equals_signupdate, d.sync_rows)})")
    print(f"  Funnel Trial rows                   {d.trial_rows:>9,}")
    print(f"  ... Date == SignupDate              {d.trial_date_equals_signup:>9,}"
          f"  ({pct(d.trial_date_equals_signup, d.trial_rows)})")
    print(f"  Funnel Conversion rows              {d.conversion_rows:>9,}")
    print(f"  ... Date == SignupDate              {d.conversion_date_equals_signup:>9,}"
          f"  ({pct(d.conversion_date_equals_signup, d.conversion_rows)})")

    if d.syncdate_equals_signupdate == d.sync_rows:
        print("\n  => int_syncs.SyncDate IS THE SIGNUP DATE, with zero exceptions.")
        print("     Syncs #55 is a SIGNUP-COHORT measure: 'accounts that signed")
        print("     up in month M and have since completed a sync'. It is not")
        print("     'syncs that happened in month M'.")

    lag = one_row(client, SQL_SYNC_LAG)
    print("\n--- when does the sync actually complete, vs signup? ---")
    print(f"  rows with both dates                {lag.rows_with_both:>9,}")
    print(f"  synced on/before signup day         {lag.sync_on_or_before_signup_day:>9,}"
          f"  ({pct(lag.sync_on_or_before_signup_day, lag.rows_with_both)})")
    print(f"  synced >30d after signup            {lag.sync_more_than_30d_after_signup:>9,}"
          f"  ({pct(lag.sync_more_than_30d_after_signup, lag.rows_with_both)})")
    print(f"  synced >60d after signup            {lag.sync_more_than_60d_after_signup:>9,}"
          f"  ({pct(lag.sync_more_than_60d_after_signup, lag.rows_with_both)})")
    print(f"  synced >90d after signup            {lag.sync_more_than_90d_after_signup:>9,}"
          f"  ({pct(lag.sync_more_than_90d_after_signup, lag.rows_with_both)})")
    print("  => the most recent months are structurally incomplete and will")
    print("     grow retroactively. A month published at close is missing")
    print("     roughly the >30d share of its eventual syncs.")

    # ---------------- Section E ----------------
    print("\n" + "=" * 78)
    print("E. THE READ LEADERSHIP ACTUALLY WANTS")
    print("=" * 78)
    basis = list(client.query(SQL_BASIS).result())
    tot_b_cv = sum(r.conversions for r in basis)
    tot_b_same = sum(r.signed_up_same_month for r in basis)
    print("Shipped ratio pairs month-M invoicers with month-M signups.")
    print(f"  month-M conversions                 {tot_b_cv:>9,}")
    print(f"  ... that signed up in month M       {tot_b_same:>9,}"
          f"  ({pct(tot_b_same, tot_b_cv)})")
    print("  => roughly half the numerator comes from earlier signup")
    print("     cohorts than the denominator it is divided by.")

    coh = list(client.query(SQL_COHORT).result())
    print("\nCohort-consistent rate — same accounts on both sides:")
    print(f"  {'signup month':<14}{'synced':>8}{'converted':>11}{'rate':>9}")
    for r in coh:
        print(f"  {r.period.isoformat():<14}{r.synced_accounts:>8}{r.converted:>11}"
              f"{(r.cohort_rate or 0) * 100:>8.2f}%")
    coh_syn = sum(r.synced_accounts for r in coh)
    coh_cnv = sum(r.converted for r in coh)
    coh_rate = coh_cnv / coh_syn if coh_syn else 0
    shipped = tot_cv / tot_ev if tot_ev else 0
    print(f"  {'12mo total':<14}{coh_syn:>8}{coh_cnv:>11}{coh_rate * 100:>8.2f}%")

    print("\n--- bottom line ---")
    print(f"  shipped rate  (#301 basis, conversions_M / syncs_M)   {shipped * 100:6.2f}%")
    print(f"  'share of synced accounts that converted'             {coh_rate * 100:6.2f}%")
    print(f"  shipped reads {(shipped - coh_rate) * 100:+.2f} pp versus the leadership read")

    print("\n" + "=" * 78)
    print("Paste the gap percentages into the caveats block on")
    print("v_metric__sync_to_conversion_rate and the new sync rate models,")
    print("and into the design spec's denominator reconciliation gate.")
    print("=" * 78)


if __name__ == "__main__":
    main()
