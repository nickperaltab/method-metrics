# Changelog — shared BigQuery objects

Changes to anything in `revenue.*` that people or reports read. One entry per
change, newest first.

**What belongs here:** a change to a view's row count, grain, column set or
classification logic. Anything that moves a number someone has already
published or quoted.

**What does not:** code that only touches `customer_signals.*`, comments,
docs, tests. Git covers those.

Base tables in `revenue` (`Account`, `Activity`, `Contacts`, `int_demos`) are
owned elsewhere and are read-only from this repo. If an entry below ever
describes writing to one, that is a mistake.

Columns: what changed, who it reaches, and how to undo it.

---

## 2026-09-18 — `revenue.v_demo_transcripts` and `revenue.int_demo_calls`

**Change:** the account bridge join went from INNER to LEFT, so demos with no
CRM account now appear instead of vanishing. New `zone` value `unlinked`.

**Blast radius:** 4,369 → 5,436 rows, **+24%**. Any previously published demo
count is now low by roughly that much.

The pre-existing zone buckets summed to exactly 4,369 after the change, so no
previously visible row was reclassified. The growth is entirely new rows
carrying `zone = 'unlinked'`.

**Who reads this:** Sarah Trimble's demo coaching report. She reported the gap
(her CRM roster found 9 demos for Monday where the view held 4). She had NOT
yet been told the view had changed when it went live at ~16:00 ET.

**Why it was wrong:** the INNER join came from the hand-written BigQuery view
and was carried over unexamined during the dbt port in #61. It required a call
to already have a Method account, so partner-led and IT-partner demos — 1,055
of them, 50-100 a month back to February — were invisible rather than shown as
unlinked.

**Undo:** `git revert` on PR #62, then `dbt run --select int_demo_calls
v_demo_transcripts`. Views only, no data written.

**PR:** nickperaltab/method-metrics#62

**Note on `unlinked`:** it means no row in `revenue.Account`, i.e. the prospect
never became a customer. It does NOT mean the person is unknown — Method's
Activity record carries their name and email. Do not use it as a lifecycle
stage; exclude it from pre/post-subscription breakdowns.

---

## 2026-09-15 — `revenue.v_demo_transcripts`, source filter and live zone

**Change:** added `WHERE source = 'zoom'`; switched `zone` from the frozen
`int_demos` snapshot to a live computation; changed `call_date` from UTC to
America/Toronto.

**Blast radius:** removed 2,052 Intercom support chats (32.7% of the view) that
had been reaching the demo coaching report as if they were sales calls.
Restored 362 transcripts that had been invisible since 28 August because an
INNER JOIN to a frozen table deleted unclassified calls outright.

**Who reads this:** same report. Judgements made against the old output were
partly made against support tickets.

**Undo:** revert #61. Ported from hand-written DDL, so there is no earlier
version in git — the prior definition is in the PR description.

**PR:** nickperaltab/method-metrics#61

**Validation:** `knowledge/validations/2026-09-15-revenue-funnel.md`
