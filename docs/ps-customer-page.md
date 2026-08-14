# Customer page (`/accounts/:recordId`)

Everything known about one account on one screen: who they are, what we're
delivering, what they've told us, how our calls have been scored, and a merged
timeline of every call, prep, audit, billed session, case and work-log entry.

**Unlike the rest of the project tracker, most of this reads real BigQuery
tables** — so it works outside mock mode. Only the projects section depends on the
tracker's not-yet-chosen store.

## Where it sits next to the call-prep brief

Both are "the customer page", read at different moments, so they're cross-linked
rather than merged:

| Screen | Question it answers |
|---|---|
| `/accounts/:recordId` | "What is going on with this customer?" — all projects, full history, feedback |
| `/call-prep/account/:recordId` | "What do I need in the next ten minutes?" — one dated pre-call brief |

Account names across the tracker now link to `/accounts/:recordId`; the brief is
one click away from there, and the brief's top bar has a **Customer view →** link
back. The brief was deliberately left alone — it's a working daily-use screen.

## Sources, and what they actually contain

Verified 2026-08-05. The coverage is wildly uneven, and the page is built around
that fact rather than assuming it away.

| Table | Key | Rows | Accounts | Range |
|---|---|---|---|---|
| `customer_signals.v_conversations` | `account_id` | 7,935 | 3,306 | 2025-01-02 → 2026-07-27 |
| `call_audits.ps_call_audit` | `account` (name) | 505 | 370 | 2026-05-27 → **2026-07-15** |
| `call_audits.free_hour_audit` | `account` (name) | 54 | 54 | 2026-06-04 → **2026-07-15** |
| `customer_signals.signals_by_call` | `account_id` | 87 | 76 | 2025-01-02 → 2026-06-24 |
| `customer_signals.call_summaries` | `company_account_record_id` | 25 | 22 | **2026-06-10 only** |
| `call_prep.snapshots` | `account_record_id` | 143 | 104 | current |
| `call_prep.brief_content` | `account_record_id` | 24 | 23 | **stopped 2026-07-16** |
| `revenue.TimeTracking` / `Cases` / `int_accounts` | `account_record_id` | — | all | current |

Consequences designed for, not papered over:

- **Every section loads independently** (`Promise.allSettled`). A missing source
  leaves that section empty and names the failure in a "Partial view" banner
  instead of blanking the page. Only a missing account header is fatal.
- An account with **no calls at all** is normal (Cedarline in the fixtures).
- Most calls have **no AI summary** and **no extracted signals**; the panels say
  so rather than implying nothing was discussed.
- Preps after 2026-07-16 have **no agenda or scheduled time**, because
  `brief_content` stopped being written.

## ⚠️ Two data problems worth fixing upstream

**1. The audit tables can't be joined reliably.** They key on `account`, a STRING.
118 distinct values are subdomain-shaped and match `int_accounts.company_account`
exactly; **303 contain spaces** — they're display names, and `revenue.Account` has
no display-name column to resolve them against. Joining by subdomain therefore
reaches roughly **28% of PPU-audit accounts** and **81% of free-hour ones**.

Because of that, "no audits" is genuinely ambiguous, so `auditCoverageCaveat()`
says as much on the page rather than implying a clean record. **The fix is in the
audit routines: write `account_record_id`, or at least the subdomain
consistently.** That single change makes this section trustworthy.

**2. Reading transcripts scans 291 MB.** `customer_signals.conversations` is
9,045 rows / 291 MB, almost all `transcript_text`, and it is **neither partitioned
nor clustered**. A `WHERE account_id = N` still scans the whole column — measured
at 290 MB for a single account — and the largest single transcript is 141,333
characters.

Mitigated in the app: the call index selects **no** transcript column, and
excerpts load only when someone opens one — fetching every excerpt for the
account in one query, since the scan costs the same either way and `queryBq`
caches it for the session. **The real fix is clustering `conversations` by
`account_id`, or moving transcripts to a side table.**

## Key indicators: last activity and escalation flags

Both appear on the **account list** (`/projects` → By account) and on the customer
page, from the same rules in `lib/customer.js`.

**Last activity logged, and by whom.** The newest touch across work log, project
events, billed sessions, calls and call preps — rendered as "3d ago by
B. Saltzman · work log".

- **Audits are not activity.** An audit is our review of a call, not a touch on
  the account; counting one would make a silent account look alive.
- On the list it's one batched query for every account on screen
  (`buildAccountActivitySql`), not N+1. The customer page computes the same answer
  from data it already loaded, so the two screens can't disagree.
- ⚠️ **"By whom" can't always be answered.** `TimeTracking` carries only
  `AssignedToRecordID`, and there is no staff/user table in `revenue` to resolve it
  (checked 2026-08-05 — only customer-side `Contacts`). Those rows render as
  `consultant #434` rather than a guessed name. Work log, project events and preps
  all carry real names.
- Ties on the same date break toward the source that names a person.

**Escalation flags**, ranked critical → warn → info, then by recency:

| Flag | Severity | Source |
|---|---|---|
| Escalation risk on call | critical | `escalation_risk` on an audit, with its evidence |
| Blocked project | critical | project tracker |
| No activity for 60+ days | critical | all sources |
| Past target date | warn | project tracker |
| Overdue work items | warn | project tracker |
| 2+ flagged calls | warn | call audits |
| QuickBooks sync failing | warn | latest prep snapshot |
| Quiet for 30+ days | warn | all sources |
| Open cases / churned | info | Method cases / account record |

Two calibrations that come from the real distribution, not taste:

- **`flagged` is not an escalation.** It's true on **191 of 505** PPU audits (38%)
  and 32 of 54 free-hour ones, so badging it would light up most of the list. The
  account list only shows it at `FLAGGED_PATTERN_THRESHOLD` (2) and above — a
  pattern, not a call. `escalation_risk` fires on **19 of 505** (3.8%) and always
  carries evidence, so one is enough to go critical.
- **A low score alone is not an escalation** either. A 55% on one call is coaching
  for the consultant, not a problem with the account.

**`Skipped` audits are excluded from every score.** The rating vocabulary is
`Excellent / Meets Expectations / Needs Coaching / Unsatisfactory / Skipped`, and a
skipped audit carries `overall_pct = 0` — averaging it in would invent a
catastrophic call. It still appears in the timeline; it just never scores. Both the
SQL (`buildAccountEscalationSql`) and `summarizeAudits` filter it.

## Layout

- **Header** — subdomain, vertical/sector, account age, active/churned, pay type,
  DEP, record id. Links to the pre-call brief.
- **Stat row** — MRR run-rate, licences, health, days since last call (amber past
  30), open cases, average call score.
- **Projects** — every project on the account with phase, status, open/overdue
  items, logged vs promised hours and efficiency. Rows link to the project.
- **What they've told us** — the extracted signals: situation, pain, impact,
  critical event, decision process, stated goals, whitespace. Shown as a
  **per-field latest**, each dated, because an older call often carries a field a
  newer one never mentioned. Verbatim evidence quoted underneath.
- **Call feedback** — average audit score, latest vs previous, weakest rubric
  section (averaged across audits, so it's a pattern not one bad call), plus every
  escalation risk with its evidence. Section averages sort worst-first.
- **Timeline** — all seven kinds on one spine, grouped by day, filterable by kind,
  each entry expandable to its detail (summary + transcript, prep agenda, audit
  sections and insights, session write-up, case status, work-log markdown).

**Calls, sessions and audits are not deduplicated.** A Zoom call, the time entry
billed for it and the audit scored from it are three rows from three systems
describing the same hour of work — each carries something the others don't, so
they're grouped by day and left distinct. Undated rows are dropped rather than
floated to the top, where they'd read as the most recent thing that happened.

Audit percentages are **0–100, not fractions** — don't run them through
`formatRatio()` from `lib/efficiency.js`, which multiplies by 100.

## Files

```
builder/src/lib/customer.js                      SQL + normalizers + timeline merge + rollups
builder/src/pages/CustomerPage.jsx               the page (per-section loading)
builder/src/components/customer/Timeline.jsx     merged feed, day grouping, lazy transcripts
builder/src/components/customer/FeedbackPanel.jsx  audit scores and escalations
builder/src/components/customer/SignalsPanel.jsx   per-field latest signals
builder/src/dev/fixtures/customer.js             synthetic calls/summaries/signals/audits/briefs
builder/tests/unit/customer.test.js              37 tests
```

Account-scoped project queries (`buildAccountProjectsSql`,
`buildAccountWorkLogSql`, `buildAccountProjectEventsSql`) live in
`lib/projects.js` — one query each rather than N+1 over the account's projects.

The fixtures mirror the real unevenness on purpose: an account with no calls, most
calls with no summary, audits only on some accounts and none after mid-July. They
must stay synthetic — this is the one fixture file whose real equivalent is
customer conversation transcripts and scored consultant performance.
