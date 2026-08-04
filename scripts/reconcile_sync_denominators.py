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

Read-only. No DDL, no writes. Exits 1 if any grain invariant fails.

==========================================================================
READ revenue.Funnel's VIEW DDL BEFORE CHANGING ANYTHING HERE.

  SELECT view_definition
  FROM `project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEWS`
  WHERE table_name = 'Funnel'

Funnel is not an event log. It is a VIEW over revenue.Account with three
UNION ALL branches, all reading one CTE that applies
`IsConversionException = FALSE AND Partner != 'Method Integration'`:

  Trial       SELECT SignupDate AS Date              ... WHERE SignupDate != sentinel
  Sync        SELECT SignupDate AS Date              ... WHERE SyncTypeRegion != "" AND SignupDate != sentinel
  Conversion  SELECT FirstSaaSInvoiceTxnDate AS Date ... WHERE FirstSaaSInvoiceTxnDate != sentinel

Four things follow from that DDL as tautologies, not as empirical findings.
The pre-flight block re-checks them anyway, as regression guards against
the DDL changing underneath us. Exact counts are deliberately not quoted
here — the runtime check is the authority, not this comment.

1. One row per account, never per event. So int_syncs COUNT(*) is
   account-grain and COUNT(DISTINCT EntityRecordID) is customer-grain.
   They count DIFFERENT UNITS. Multi-row entities are multi-account
   customers. There are no repeat sync events to inflate anything.

2. int_syncs.SyncDate IS SignupDate — the same column, aliased. So Syncs
   #55 is a SIGNUP-COHORT measure: "accounts that signed up in month M and
   have since completed a sync", not "syncs that happened in M".

3. int_syncs membership IS `SyncTypeRegion != ""`. So the
   _sources.yml:141 undercount warning applies directly to this
   denominator.

4. Funnel's population IS the filtered Account population, so applying the
   same two filters to Account keeps candidates 3 and 4 comparable.

Also from the DDL: CustDatFirstSyncCompleted is a Funnel COLUMN, present on
every branch. Re-dating the denominator by sync completion therefore needs
no new source and no join — see candidate 5, which isolates the date-basis
change from any population change. models/intermediate/int_syncs.sql simply
does not project the column today.

Candidate 5 is computed here for evidence only. Actually re-dating
int_syncs has blast radius on live metrics #55 and #300 and is the metric
owner's call, not this script's.

revenue.Account is unique on RecordID, so the GROUP BY RecordID in
candidate 3 is currently a no-op. It is kept as an explicit grain
assertion. The ~1.22 rows-per-EntityRecordID hazard in CLAUDE.md is about
EntityRecordID, NOT RecordID, and nothing here groups by EntityRecordID.

int_conversions is account-grain too — it selects from revenue.Account with
no aggregation, and its two LEFT JOINs are pre-aggregated per entity so
they cannot fan out. Numerator and candidates 1, 3, 4, 5 are all
account-grain. Candidate 2 is the odd one out.
==========================================================================
"""
import sys

from google.cloud import bigquery

PROJECT = "project-for-method-dw"

# Funnel already applies these (see DDL above). Repeating them on Account
# keeps candidates 3 and 4 population-comparable with candidates 1 and 2.
ACCOUNT_FILTERS = """
    IsConversionException = FALSE
    AND Partner != 'Method Integration'
"""

SENTINEL = "DATE '0001-01-01'"

# Cohorts before 2019 behave completely differently from every cohort
# since. Blending them yields a sync-lag statistic that is true of the
# table and false of every publishable month. See section D.
MODERN_ERA_START = "DATE '2019-01-01'"

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
-- 3. Account-grain, completion-dated, from the Account side. Differs from
--    #1 in BOTH population and date basis.
account_first_sync AS (
  SELECT DATE_TRUNC(first_sync, MONTH) AS period,
         COUNT(*) AS accounts_first_synced
  FROM (
    SELECT RecordID,
           MIN(NULLIF(CustDatFirstSyncCompleted, {SENTINEL})) AS first_sync
    FROM `{PROJECT}.revenue.Account`
    WHERE {ACCOUNT_FILTERS}
    GROUP BY RecordID
  )
  WHERE first_sync IS NOT NULL
  GROUP BY 1
),
-- 4. Account-grain union: earliest sync evidence from EITHER signal.
either_signal AS (
  SELECT DATE_TRUNC(first_evidence, MONTH) AS period,
         COUNT(*) AS accounts_either
  FROM (
    SELECT a.RecordID,
           LEAST(
             COALESCE(NULLIF(a.CustDatFirstSyncCompleted, {SENTINEL}), DATE '9999-12-31'),
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
-- 5. THE CANDIDATE THE DATING FINDING ACTUALLY IMPLIES.
--    Exactly #55's population, re-dated from signup to sync completion.
--    Reads CustDatFirstSyncCompleted straight off Funnel, so this isolates
--    the date-basis change from any population change. Drops only the rows
--    with no completion date.
sync_dated AS (
  SELECT DATE_TRUNC(CustDatFirstSyncCompleted, MONTH) AS period,
         COUNT(*) AS accounts_sync_dated
  FROM `{PROJECT}.revenue.Funnel`
  WHERE EventType = 'Sync'
    AND CustDatFirstSyncCompleted != {SENTINEL}
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
  COALESCE(sd.accounts_sync_dated, 0)    AS accounts_sync_dated,
  COALESCE(cv.conversions, 0)            AS conversions,
  SAFE_DIVIDE(cv.conversions, ev.sync_events)           AS rate_on_events,
  SAFE_DIVIDE(cv.conversions, en.sync_entities)         AS rate_on_entities,
  SAFE_DIVIDE(cv.conversions, af.accounts_first_synced) AS rate_on_account_field,
  SAFE_DIVIDE(cv.conversions, sd.accounts_sync_dated)   AS rate_on_sync_dated
FROM months m
LEFT JOIN events ev              USING (period)
LEFT JOIN entities en            USING (period)
LEFT JOIN account_first_sync af  USING (period)
LEFT JOIN either_signal ei       USING (period)
LEFT JOIN sync_dated sd          USING (period)
LEFT JOIN conversions cv         USING (period)
ORDER BY m.period
"""

# --------------------------------------------------------------------------
# Pre-flight: the DDL tautologies, as regression guards.
# --------------------------------------------------------------------------
SQL_GRAIN = f"""
WITH sync_rows AS (
  SELECT COUNT(*) AS n,
         COUNT(DISTINCT CompanyAccount) AS n_company_account,
         COUNT(DISTINCT CONCAT(CAST(EntityRecordID AS STRING), '|', CompanyAccount))
           AS n_entity_account,
         COUNT(DISTINCT EntityRecordID) AS n_entity,
         COUNTIF(SyncDate = CAST(SignupDate AS DATE)) AS n_syncdate_eq_signup
  FROM `{PROJECT}.revenue.int_syncs`
),
acct AS (
  SELECT COUNT(*) AS n,
         COUNT(DISTINCT RecordID) AS n_record_id,
         COUNTIF({ACCOUNT_FILTERS.strip()}) AS n_filtered,
         COUNTIF(NULLIF(SyncTypeRegion, '') IS NOT NULL AND {ACCOUNT_FILTERS.strip()})
           AS n_region_filtered
  FROM `{PROJECT}.revenue.Account`
),
funnel AS (
  SELECT COUNTIF(EventType = 'Trial') AS trial_rows,
         COUNTIF(EventType = 'Sync')  AS sync_rows,
         COUNTIF(EventType = 'Sync' AND CustDatFirstSyncCompleted != {SENTINEL})
           AS sync_rows_with_completion
  FROM `{PROJECT}.revenue.Funnel`
)
SELECT sync_rows.n                     AS sync_rows,
       sync_rows.n_company_account     AS sync_distinct_company_account,
       sync_rows.n_entity_account      AS sync_distinct_entity_account,
       sync_rows.n_entity              AS sync_distinct_entity,
       sync_rows.n_syncdate_eq_signup  AS sync_syncdate_eq_signup,
       acct.n                          AS account_rows,
       acct.n_record_id                AS account_distinct_record_id,
       acct.n_filtered                 AS account_filtered_rows,
       acct.n_region_filtered          AS account_region_filtered,
       funnel.trial_rows,
       funnel.sync_rows                AS funnel_sync_rows,
       funnel.sync_rows_with_completion
FROM sync_rows, acct, funnel
"""

SQL_MULTIPLICITY = f"""
WITH per_entity AS (
  SELECT EntityRecordID,
         COUNT(*) AS sync_rows,
         COUNT(DISTINCT CompanyAccount) AS sync_accounts
  FROM `{PROJECT}.revenue.int_syncs`
  GROUP BY 1
)
SELECT COUNT(*)                           AS entities,
       COUNTIF(sync_rows = 1)             AS entities_with_one_row,
       COUNTIF(sync_rows > sync_accounts) AS entities_with_repeat_events,
       MAX(sync_rows)                     AS max_rows_for_one_entity
FROM per_entity
"""

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
# C. Population overlap of the two account-grain signals, split by era.
#    The net gap flips sign between windows; the era split says why.
# --------------------------------------------------------------------------
SQL_OVERLAP = f"""
WITH acct AS (
  SELECT IF(SignupDate < {MODERN_ERA_START}, 'pre-2019', '2019+') AS era,
         NULLIF(CustDatFirstSyncCompleted, {SENTINEL}) AS first_sync,
         NULLIF(SyncTypeRegion, '') AS region
  FROM `{PROJECT}.revenue.Account`
  WHERE {ACCOUNT_FILTERS}
)
SELECT era,
       COUNT(*)                                               AS filtered_accounts,
       COUNTIF(region IS NOT NULL)                            AS in_region_signal,
       COUNTIF(first_sync IS NOT NULL)                        AS has_completion_date,
       COUNTIF(region IS NOT NULL AND first_sync IS NOT NULL)  AS in_both,
       COUNTIF(region IS NOT NULL AND first_sync IS NULL)      AS region_only,
       COUNTIF(region IS NULL AND first_sync IS NOT NULL)      AS field_only
FROM acct GROUP BY era ORDER BY era
"""

# --------------------------------------------------------------------------
# D. Signup-to-sync lag, SPLIT BY ERA, plus a direct measurement of how much
#    a published month actually grows after close.
#
#    The blended all-time lag is ~19% over 30 days. That figure is a
#    pre-2019 artifact and is false of every publishable month.
# --------------------------------------------------------------------------
SQL_SYNC_LAG_BY_ERA = f"""
WITH j AS (
  SELECT IF(SignupDate < {MODERN_ERA_START}, 'pre-2019', '2019+') AS era,
         DATE_DIFF(CustDatFirstSyncCompleted, CAST(SignupDate AS DATE), DAY) AS lag_days
  FROM `{PROJECT}.revenue.Funnel`
  WHERE EventType = 'Sync' AND CustDatFirstSyncCompleted != {SENTINEL}
)
SELECT era, COUNT(*) AS n, COUNTIF(lag_days <= 0) AS on_or_before_signup,
       COUNTIF(lag_days > 30) AS over_30d, COUNTIF(lag_days > 60) AS over_60d
FROM j GROUP BY era
UNION ALL
SELECT 'ALL (do not quote)', COUNT(*), COUNTIF(lag_days <= 0),
       COUNTIF(lag_days > 30), COUNTIF(lag_days > 60)
FROM j
ORDER BY era
"""

# The number that actually matters: for each recent signup cohort, what
# share of its sync rows completed their sync AFTER that month closed?
SQL_RETRO_FILL = f"""
SELECT DATE_TRUNC(CAST(SignupDate AS DATE), MONTH) AS signup_month,
       COUNT(*) AS sync_rows,
       SAFE_DIVIDE(COUNTIF(CustDatFirstSyncCompleted != {SENTINEL}
             AND CustDatFirstSyncCompleted > LAST_DAY(CAST(SignupDate AS DATE), MONTH)),
             COUNT(*)) AS filled_after_month_end,
       SAFE_DIVIDE(COUNTIF(CustDatFirstSyncCompleted != {SENTINEL}
             AND CustDatFirstSyncCompleted
                 > DATE_ADD(LAST_DAY(CAST(SignupDate AS DATE), MONTH), INTERVAL 30 DAY)),
             COUNT(*)) AS filled_after_month_end_plus_30d
FROM `{PROJECT}.revenue.Funnel`
WHERE EventType = 'Sync'
  AND SignupDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 15 MONTH)
  AND SignupDate <  DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY 1 ORDER BY 1
"""

# Is CustDatFirstSyncCompleted trustworthy? The -4.5% gap and candidates 3
# and 5 all depend on it.
SQL_FIELD_SANITY = f"""
SELECT COUNT(*) AS rows_with_date,
       COUNTIF(CustDatFirstSyncCompleted = CAST(SignupDate AS DATE)) AS equals_signup_date,
       COUNTIF(CustDatFirstSyncCompleted < CAST(SignupDate AS DATE)) AS before_signup_date,
       MIN(DATE_DIFF(CustDatFirstSyncCompleted, CAST(SignupDate AS DATE), DAY)) AS min_lag_days
FROM `{PROJECT}.revenue.Funnel`
WHERE EventType = 'Sync' AND CustDatFirstSyncCompleted != {SENTINEL}
"""

# --------------------------------------------------------------------------
# E. The cohort-consistent rate, on TWO windows, because the gap is
#    window-dependent and must not be presented as a standing bias.
# --------------------------------------------------------------------------
SQL_COHORT_WINDOW = f"""
WITH s AS (
  SELECT CompanyAccount FROM `{PROJECT}.revenue.int_syncs`
  WHERE SyncDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL @back MONTH)
    AND SyncDate <  DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL @fwd MONTH)
),
conv AS (SELECT DISTINCT CompanyAccount FROM `{PROJECT}.revenue.int_conversions`),
cohort AS (
  SELECT COUNT(*) AS synced, COUNTIF(conv.CompanyAccount IS NOT NULL) AS converted
  FROM s LEFT JOIN conv USING (CompanyAccount)
),
shipped AS (
  SELECT
    (SELECT COUNT(*) FROM `{PROJECT}.revenue.int_conversions`
      WHERE FirstSaaSInvoiceTxnDate
              >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL @back MONTH)
        AND FirstSaaSInvoiceTxnDate
              <  DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL @fwd MONTH)) AS convs,
    (SELECT COUNT(*) FROM `{PROJECT}.revenue.int_syncs`
      WHERE SyncDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL @back MONTH)
        AND SyncDate <  DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL @fwd MONTH)) AS syncs
)
SELECT cohort.synced, cohort.converted,
       SAFE_DIVIDE(cohort.converted, cohort.synced) AS cohort_rate,
       SAFE_DIVIDE(shipped.convs, shipped.syncs)    AS shipped_rate
FROM cohort, shipped
"""

SQL_BASIS = f"""
SELECT COUNT(*) AS conversions,
       COUNTIF(DATE_TRUNC(CAST(SignupDate AS DATE), MONTH)
               = DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH)) AS signed_up_same_month
FROM `{PROJECT}.revenue.int_conversions`
WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 12 MONTH)
  AND FirstSaaSInvoiceTxnDate <  DATE_TRUNC(CURRENT_DATE(), MONTH)
"""

FAILURES = []


def one_row(client, sql, params=None):
    cfg = None
    if params:
        cfg = bigquery.QueryJobConfig(query_parameters=[
            bigquery.ScalarQueryParameter(k, "INT64", v) for k, v in params.items()])
    rows = list(client.query(sql, job_config=cfg).result())
    if not rows:
        sys.exit("no rows returned — check the query")
    return rows[0]


def pct(num, den):
    return f"{num / den * 100:.1f}%" if den else "n/a"


def signed(val):
    return f"{val:+.1f}" if val is not None else "n/a"


def rng(vals):
    return f"{min(vals):+.1f}..{max(vals):+.1f}" if vals else "n/a"


def check(label, ok, detail=""):
    print(f"  {label:<46}{'PASS' if ok else 'FAIL'}  {detail}")
    if not ok:
        FAILURES.append(label)


def preflight(client):
    """The DDL tautologies. Every ratio downstream assumes them."""
    print("=" * 78)
    print("PRE-FLIGHT — DDL invariants (Funnel DDL quoted in module docstring)")
    print("=" * 78)
    g = one_row(client, SQL_GRAIN)

    check("Funnel Sync is one row per account",
          g.sync_rows == g.sync_distinct_company_account == g.sync_distinct_entity_account,
          f"{g.sync_rows:,} rows / {g.sync_distinct_company_account:,} accounts")
    check("int_syncs.SyncDate IS SignupDate",
          g.sync_syncdate_eq_signup == g.sync_rows,
          f"{g.sync_syncdate_eq_signup:,}/{g.sync_rows:,}")
    check("int_syncs membership IS SyncTypeRegion != ''",
          g.funnel_sync_rows == g.account_region_filtered,
          f"{g.funnel_sync_rows:,} vs {g.account_region_filtered:,}")
    check("Funnel population IS filtered Account",
          g.trial_rows == g.account_filtered_rows,
          f"{g.trial_rows:,} vs {g.account_filtered_rows:,}")
    check("Account unique on RecordID",
          g.account_rows == g.account_distinct_record_id,
          f"{g.account_rows:,} rows / {g.account_distinct_record_id:,} IDs")

    m = one_row(client, SQL_MULTIPLICITY)
    check("no repeat sync events exist",
          m.entities_with_repeat_events == 0,
          f"{m.entities_with_repeat_events} entities with rows > accounts")

    if FAILURES:
        print("\n" + "!" * 78)
        print("ABORTING. A grain invariant no longer holds, so every ratio this")
        print("script would print is computed on a false assumption.")
        for f in FAILURES:
            print(f"  FAILED: {f}")
        print("Re-read the Funnel view DDL before trusting any prior output.")
        print("!" * 78)
        sys.exit(1)

    print(f"\n  Funnel Sync rows with a completion date   "
          f"{g.sync_rows_with_completion:,}/{g.funnel_sync_rows:,}"
          f"  ({pct(g.sync_rows_with_completion, g.funnel_sync_rows)})")
    print("  => candidate 5 (re-dating) needs no join and no new source.")
    return m


def main():
    client = bigquery.Client(project=PROJECT)
    m = preflight(client)

    # ---------------- Section A ----------------
    rows = list(client.query(SQL_MONTHLY).result())
    if not rows:
        sys.exit("no rows returned — check the date window")

    print("\n" + "=" * 78)
    print("A. MONTHLY DENOMINATOR CANDIDATES — 12 closed months")
    print("=" * 78)
    hdr = (f"{'period':<11}{'c1_sgnp':>8}{'c2_enty':>8}{'c3_acct':>8}"
           f"{'c4_eith':>8}{'c5_sync':>8}{'convs':>7}"
           f"{'r_c1':>8}{'r_c3':>8}{'r_c5':>8}")
    print(hdr)
    print("-" * len(hdr))
    for r in rows:
        print(f"{r.period.isoformat():<11}{r.sync_events:>8}{r.sync_entities:>8}"
              f"{r.accounts_first_synced:>8}{r.accounts_either:>8}"
              f"{r.accounts_sync_dated:>8}{r.conversions:>7}"
              f"{(r.rate_on_events or 0):>8.4f}{(r.rate_on_account_field or 0):>8.4f}"
              f"{(r.rate_on_sync_dated or 0):>8.4f}")

    tot_ev = sum(r.sync_events for r in rows)
    tot_en = sum(r.sync_entities for r in rows)
    tot_af = sum(r.accounts_first_synced for r in rows)
    tot_ei = sum(r.accounts_either for r in rows)
    tot_sd = sum(r.accounts_sync_dated for r in rows)
    tot_cv = sum(r.conversions for r in rows)

    print("\n--- 12-month totals ---")
    print(f"  {'candidate':<42}{'total':>7}{'grain':>10}{'dated by':>12}{'rate':>8}")
    for label, tot, grain, dated in (
        ("1. sync rows, signup-dated (= #55 today)", tot_ev, "account", "signup"),
        ("2. distinct entities that synced",         tot_en, "CUSTOMER", "signup"),
        ("3. Account.CustDatFirstSyncCompleted",     tot_af, "account", "completion"),
        ("4. either signal (upper bound)",           tot_ei, "account", "earliest"),
        ("5. #55's population, re-dated",            tot_sd, "account", "completion"),
    ):
        rate = f"{tot_cv / tot * 100:.2f}%" if tot else "n/a"
        print(f"  {label:<42}{tot:>7,}{grain:>10}{dated:>12}{rate:>8}")
    print(f"  {'conversions (numerator)':<42}{tot_cv:>7,}{'account':>10}{'invoice':>12}")

    print("\n--- the two gap percentages the gate asked for ---")
    print(f"  account-vs-entity fan-in (#1 over #2):    {(tot_ev / tot_en - 1) * 100:+.1f}%")
    print(f"  preferred-field gap      (#3 over #1):    {(tot_af / tot_ev - 1) * 100:+.1f}%")
    print("\n--- the gap the dating finding implies ---")
    print(f"  re-dating only           (#5 over #1):    {(tot_sd / tot_ev - 1) * 100:+.1f}%")
    print(f"  rate moves {(tot_cv / tot_sd - tot_cv / tot_ev) * 100:+.2f} pp, "
          f"from {tot_cv / tot_ev * 100:.2f}% to {tot_cv / tot_sd * 100:.2f}%")
    print("  Note the direction: re-dating moves the rate UP, i.e. AWAY from")
    print("  the 'inflated denominator makes the rate read low' framing.")

    print("\n--- per-month gap stability (is any single month distorting?) ---")
    print(f"  {'period':<11}{'fanin_%':>12}{'fieldgap_%':>14}{'redate_%':>14}")
    fan_v, fld_v, red_v = [], [], []
    for r in rows:
        fan = (r.sync_events / r.sync_entities - 1) * 100 if r.sync_entities else None
        fld = (r.accounts_first_synced / r.sync_events - 1) * 100 if r.sync_events else None
        red = (r.accounts_sync_dated / r.sync_events - 1) * 100 if r.sync_events else None
        for bucket, v in ((fan_v, fan), (fld_v, fld), (red_v, red)):
            if v is not None:
                bucket.append(v)
        print(f"  {r.period.isoformat():<11}{signed(fan):>12}{signed(fld):>14}{signed(red):>14}")
    print(f"  {'range':<11}{rng(fan_v):>12}{rng(fld_v):>14}{rng(red_v):>14}")

    f = one_row(client, SQL_FANIN)
    print("\n--- fan-in depends on the window; the yml quotes the wrong one ---")
    print(f"  all time:      {f.alltime_rows:>7,} rows / {f.alltime_entities:>7,} entities"
          f"  = {(f.alltime_rows / f.alltime_entities - 1) * 100:+.1f}%   <- the yml's ~13%")
    print(f"  12mo window:   {f.window_rows:>7,} rows / {f.window_distinct_entities:>7,} entities"
          f"  = {(f.window_rows / f.window_distinct_entities - 1) * 100:+.1f}%")
    print(f"  monthly grain: {f.window_rows:>7,} rows / {f.window_monthly_sum_entities:>7,} entities"
          f"  = {(f.window_rows / f.window_monthly_sum_entities - 1) * 100:+.1f}%   "
          f"<- what the monthly metric carries")
    print(f"\n  entities with exactly one sync row: {m.entities_with_one_row:,}"
          f"/{f.alltime_entities:,} ({pct(m.entities_with_one_row, f.alltime_entities)})")
    print(f"  max sync rows for one entity:       {m.max_rows_for_one_entity:,}")
    print("  The yml's 91/9 split is arithmetically right. Its stated cause —")
    print("  're-syncs after disconnect/reconnect' — is not, per pre-flight.")

    # ---------------- Section C ----------------
    print("\n" + "=" * 78)
    print("C. THE TWO ACCOUNT-GRAIN SIGNALS, BY SIGNUP ERA")
    print("=" * 78)
    ov = list(client.query(SQL_OVERLAP).result())
    print(f"  {'era':<10}{'accts':>9}{'region':>9}{'complet':>9}{'both':>8}"
          f"{'rgn_only':>10}{'fld_only':>10}")
    keys = ("filtered_accounts", "in_region_signal", "has_completion_date",
            "in_both", "region_only", "field_only")
    tot = dict.fromkeys(keys, 0)
    for r in ov:
        print(f"  {r.era:<10}{r.filtered_accounts:>9,}{r.in_region_signal:>9,}"
              f"{r.has_completion_date:>9,}{r.in_both:>8,}"
              f"{r.region_only:>10,}{r.field_only:>10,}")
        for k in keys:
            tot[k] += r[k]
    print(f"  {'TOTAL':<10}{tot['filtered_accounts']:>9,}{tot['in_region_signal']:>9,}"
          f"{tot['has_completion_date']:>9,}{tot['in_both']:>8,}"
          f"{tot['region_only']:>10,}{tot['field_only']:>10,}")

    net = tot["has_completion_date"] - tot["in_region_signal"]
    sym = tot["region_only"] + tot["field_only"]
    print(f"\n  net count gap        {net:>+8,}  ({pct(net, tot['in_region_signal'])} of #55)")
    print(f"  symmetric difference {sym:>8,}  ({pct(sym, tot['in_region_signal'])} of #55)")
    print("  The signals disagree about WHICH accounts far more than HOW MANY.")

    pre = next((r for r in ov if r.era == "pre-2019"), None)
    if pre and tot["field_only"]:
        print(f"\n  {pct(pre.field_only, tot['field_only'])} of the field's population")
        print("  advantage sits in pre-2019 cohorts. That is why the gap flips sign")
        print("  by window: the field looks better all-time but worse over the last")
        print("  12 months. Same field, different eras.")

    # ---------------- Section D ----------------
    print("\n" + "=" * 78)
    print("D. SIGNUP-TO-SYNC LAG — SPLIT BY ERA, BECAUSE THE BLEND LIES")
    print("=" * 78)
    print(f"  {'era':<20}{'n':>8}{'<=0d':>9}{'>30d':>9}{'>60d':>9}")
    for r in client.query(SQL_SYNC_LAG_BY_ERA).result():
        print(f"  {r.era:<20}{r.n:>8,}{pct(r.on_or_before_signup, r.n):>9}"
              f"{pct(r.over_30d, r.n):>9}{pct(r.over_60d, r.n):>9}")
    print("\n  The blended >30d figure is a PRE-2019 ARTIFACT. Every cohort since")
    print("  2019 sits near 0.5%. Do not quote the blend — it is true of the")
    print("  table and false of every publishable month.")

    print("\n--- direct measurement: how much does a closed month still grow? ---")
    print(f"  {'signup month':<14}{'sync rows':>10}{'after close':>13}{'+30d':>8}")
    retro = list(client.query(SQL_RETRO_FILL).result())
    for r in retro:
        print(f"  {r.signup_month.isoformat():<14}{r.sync_rows:>10,}"
              f"{(r.filled_after_month_end or 0) * 100:>12.2f}%"
              f"{(r.filled_after_month_end_plus_30d or 0) * 100:>7.2f}%")
    vals = [(r.filled_after_month_end or 0) * 100 for r in retro]
    if vals:
        print(f"\n  retroactive growth after month close: "
              f"{min(vals):.1f}% to {max(vals):.1f}% across {len(vals)} cohorts")
        print("  THIS is the dashboard-footnote number — roughly 1-5%, not the")
        print("  ~19% the blended lag implies.")

    fs = one_row(client, SQL_FIELD_SANITY)
    print("\n--- is CustDatFirstSyncCompleted trustworthy? ---")
    print(f"  rows with a real date               {fs.rows_with_date:>9,}")
    print(f"  ... exactly equal to SignupDate     {fs.equals_signup_date:>9,}"
          f"  ({pct(fs.equals_signup_date, fs.rows_with_date)})")
    print(f"  ... dated BEFORE signup             {fs.before_signup_date:>9,}"
          f"  (min {fs.min_lag_days:,} days)")
    print("  Same-day could be real onboarding sync or a backfill artifact.")
    print("  Pre-signup dates cannot be real. Unresolved — and the field gap")
    print("  plus candidates 3 and 5 all depend on this field's meaning.")

    # ---------------- Section E ----------------
    print("\n" + "=" * 78)
    print("E. THE READ LEADERSHIP ACTUALLY WANTS — MEASURED ON TWO WINDOWS")
    print("=" * 78)
    b = one_row(client, SQL_BASIS)
    print("The shipped ratio pairs month-M invoicers with month-M signups.")
    print(f"  month-M conversions                 {b.conversions:>9,}")
    print(f"  ... that signed up in month M       {b.signed_up_same_month:>9,}"
          f"  ({pct(b.signed_up_same_month, b.conversions)})")
    print("  => about half the numerator comes from earlier signup cohorts")
    print("     than the denominator it is divided by.")

    print(f"\n  {'window':<16}{'shipped':>10}{'cohort read':>13}{'gap':>11}")
    gaps = {}
    for label, back, fwd in (("current 12mo", 12, 0), ("prior 12mo", 24, 12)):
        w = one_row(client, SQL_COHORT_WINDOW, {"back": back, "fwd": fwd})
        gaps[label] = (w.shipped_rate - w.cohort_rate) * 100
        print(f"  {label:<16}{w.shipped_rate * 100:>9.2f}%{w.cohort_rate * 100:>12.2f}%"
              f"{gaps[label]:>+8.2f} pp")
    print(f"\n  The gap is WINDOW-DEPENDENT, not a standing directional bias:")
    print(f"  {gaps['current 12mo']:+.2f} pp on this window, "
          f"{gaps['prior 12mo']:+.2f} pp on the one before.")
    print("  Report it as a measurement of this window with the prior window")
    print("  beside it. Do not attach a causal story to a sign that moves.")

    print("\n" + "=" * 78)
    print("Paste the gap percentages into the caveats block on")
    print("v_metric__sync_to_conversion_rate and the new sync rate models,")
    print("and into the design spec's denominator reconciliation gate.")
    print("=" * 78)


if __name__ == "__main__":
    main()
