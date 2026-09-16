# Validation: `revenue.Funnel`

Run 2026-09-15. Prompted by a question that turned out to be the right one:
`int_demo_calls` was about to depend on `Funnel` for lifecycle fences, and
nobody could point to evidence that `Funnel` had ever been validated.

Prior evidence found: `int_syncs.yml:84` records that the Syncs metric
"Matches Supabase's COUNT(\*)", and `knowledge/snapshots/` holds a metric-values
regression baseline. Both validate the **Syncs metric**. Neither validates
`Funnel` itself — not its grain, completeness, freshness, or column meanings.

## What it is

Not an event stream. It is `revenue.Account` unpivoted into three rows per
account, with account-level exclusions applied once at the top:

```sql
WHERE IsConversionException = FALSE
  AND Partner != 'Method Integration'
```

| EventType | `Date` is | emitted when |
|---|---|---|
| `Trial` | `SignupDate` | `SignupDate != '0001-01-01'` |
| `Sync` | **`SignupDate`** | `SyncTypeRegion != ""` |
| `Conversion` | `FirstSaaSInvoiceTxnDate` | `FirstSaaSInvoiceTxnDate != '0001-01-01'` |

`0001-01-01` is the null sentinel throughout. Any aggregate that does not
`NULLIF` it will silently take the sentinel as the minimum — this dragged one
fence match from 99% to 30% during the demo work.

## Findings

### PASS — freshness

All three event types current as of the run: Trial and Sync to 2026-09-15,
Conversion to 2026-09-14. No null dates on any event type. `Funnel` is a view,
so it cannot go stale independently of `Account`.

### PASS — exclusions are applied once, at source

`IsConversionException` and `Partner = 'Method Integration'` are filtered in the
base CTE, so every event type inherits them. An entity excluded from Method
funnel reporting has **no rows at all** in `Funnel` — it does not appear with a
flag. Consumers must treat absence as exclusion, not as missing data.

### FAIL — `Sync` events carry the signup date, not the sync date

`Date` for a `Sync` row is `SignupDate`. The actual first-sync timestamp,
`CustDatFirstSyncCompleted`, is carried as a separate passthrough column and is
never used as the event date.

**26,870 of 67,498 Sync rows (39.8%) have `Date != CustDatFirstSyncCompleted`.**

So `MIN(Date) WHERE EventType='Sync'` does not mean "when they first synced".
It means "the signup date of an account that has synced". Anything treating it
as a sync date is wrong for 2 rows in 5.

### FAIL — 3,743 Sync events where no sync is recorded

`SyncTypeRegion != ""` is the emission test, but 3,743 of those rows have
`CustDatFirstSyncCompleted = '0001-01-01'` — the sentinel for never. The account
is flagged with a sync region but has no sync date.

Either `SyncTypeRegion` is populated before a sync completes, or the sync date
is not always backfilled. Not resolved here.

### NOTE — grain is account, not entity

| EventType | rows | distinct EntityRecordID |
|---|---|---|
| Trial | 112,574 | 97,952 |
| Sync | 67,498 | 59,838 |
| Conversion | 19,865 | 17,665 |

A multi-account customer contributes one row per account per event type.
`EntityRecordID` is **not** unique. Aggregating to entity grain requires an
explicit `MIN`/`GROUP BY`, which is what the demo fences do.

## Impact

**On the demo work (`int_demo_calls`): none.** The zone classification uses only
the Trial and Conversion fences. `first_sync` is carried as context and is not
referenced by any `classification_reason`. The Sync defect is inherited into
`int_demos.first_sync`, which is therefore also mislabelled, but nothing
classifies on it.

**On `v_metric__syncs` (a verified metric): needs a decision.** `int_syncs`
takes `CAST(Date AS DATE) AS SyncDate` straight from `Funnel`, so the Syncs
metric buckets a sync into the month the account **signed up**, not the month it
synced. That may well be deliberate — a signup-cohort view of syncs — and it
matches Supabase, which is what `int_syncs.yml` reconciled against. But it is
not what the column name says, and nothing in the docs states the intent.

**Not changed here.** Flagging it rather than editing a verified metric.

## Reproducing

```sql
-- the Sync date defect
SELECT
  COUNTIF(EventType='Sync' AND Date != DATE(CustDatFirstSyncCompleted)) AS sync_date_wrong,
  COUNTIF(EventType='Sync' AND DATE(CustDatFirstSyncCompleted) = DATE '0001-01-01') AS flagged_never_synced,
  COUNTIF(EventType='Sync') AS sync_rows
FROM `project-for-method-dw.revenue.Funnel`;

-- grain
SELECT EventType, COUNT(*) rows_, COUNT(DISTINCT EntityRecordID) entities
FROM `project-for-method-dw.revenue.Funnel` GROUP BY EventType;
```

## Verdict

Safe to use for **Trial and Conversion fences** — fresh, complete, exclusions
applied consistently, sentinel handling understood.

**Not** safe to use for sync timing. Use `Account.CustDatFirstSyncCompleted`
directly if a real sync date is needed, and guard the `0001-01-01` sentinel.

`Funnel` is still a BigQuery view outside dbt — declared as a source
(`models/_sources.yml:146`) but its definition is not in version control. That
is a separate gap from this validation; it is one of 16 such orphans in
`revenue`.
