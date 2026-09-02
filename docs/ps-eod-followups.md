# EOD follow-through (`/eod`)

> **Not reachable in the app.** The `/eod` route and its nav link were removed on
> 2026-08-13. `pages/Eod.jsx`, `lib/eod.js` and their tests are still in the tree
> and still pass; nothing renders them. The screen lists findings and offers no
> way to act on them, because Draft and Dismiss are both blocked — see
> **Status: what is and isn't built** below. To put it
> back: restore the `<Route path="/eod">` in `App.jsx`, add it to `PS_ITEMS` in
> `Sidebar.jsx`, and add `/eod` to `PS_PATH_PREFIXES` in `permissions.js` if PS
> users should see it.

The end-of-day screen: what a consultant committed to today that hasn't been
finished yet, ranked oldest-first.

## Where the data comes from

The screen is the read side of the **`/time-killer`** routine
(`PS_Claude Projects/method-ps-time-killer/`). The routine reconstructs a
consultant's day — Zoom meetings, logged time, Gmail, Alocet activity — and
appends one row per gap to `project-for-method-dw.call_prep.time_killer_findings`.
`builder/src/lib/eod.js` reads that table; nothing in the app writes to it.

Three checks, in the order the screen ranks them:

| `finding_type` | Raised when | Screen label |
|---|---|---|
| `followup_missing` | A meeting or ≥0.5h logged, and the follow-up email lacks a recap, a time estimate, or a delivery date | Follow-up incomplete |
| `email_not_logged` | Real mail or a call today with no matching Alocet Activity | Not logged in Alocet |
| `mia` | A book account untouched for ≥7 days | Gone quiet |

### The table is append-only

A finding keeps its identity across runs via a deterministic
`finding_id` = `{consultant_slug}-{account_record_id}-{finding_type}-{anchor_date}`.
Every read **must** dedupe to the newest row per `finding_id`
(`QUALIFY ROW_NUMBER() OVER (PARTITION BY finding_id ORDER BY created_at DESC) = 1`).
Reading it raw shows one row per day a finding survived.

Note this partitions on `finding_id`, not `account_record_id` the way
`callPrep.js` and `handoffs.js` do. One account can legitimately carry a
follow-up gap, a logging gap and an MIA finding at the same time, and
partitioning by account throws two of the three away.

### Scoping to a consultant

By name pattern, via `consultantPatternFromEmail` from `psOverview.js` — the
same fuzzy first-initial + surname match the call-prep book uses.
`consultant_email` looks like the obvious key but is null on rows from runs
where the routine resolved the consultant out of Alocet rather than the Google
profile.

## Ranking

Age leads, measured from `first_seen` rather than `run_date`: a gap first raised
eight days ago and re-confirmed this afternoon is eight days old, not zero. Ties
break on check type (client-facing before bookkeeping), then DEP before PPU.

## Known upstream data problems

Both are live in `call_prep.time_killer_findings` today and the data layer
compensates for them. Fixing them belongs in the routine.

1. **Two spellings for one missing element.** The routine has written both
   `hours_estimate` and `time_estimate` for the same check — its prose says
   "hours estimate", its own worked example says "time estimate". Left alone,
   one gap renders as two chips. `canonicalMissingElement()` folds them onto
   `time_estimate`. **Fix at the source** in `commands/time-killer.md` so the
   normalizer can eventually drop the special case.

2. **`days_since_touch` is null, not zero, on some MIA rows.** An account with
   no `TimeTracking` on record at all has no touch to count days from. Coercing
   that to 0 would render "last touch 0d ago" on the coldest account on the
   book. It stays null and the screen omits the line.

## Status: what is and isn't built

**Built** — the read path. `lib/eod.js`, `pages/Eod.jsx`, the mock route in
`dev/mockBq.js`, fixtures in `dev/fixtures/ps.js`, and tests in
`tests/unit/eod.test.js` + the round-trip cases in `tests/unit/mockBq.test.js`.
Works against real BigQuery and under `npm run dev:mock`.

**Not built** — the two write actions the screen is laid out for. Both buttons
sit behind `canAct = false` in `Eod.jsx`.

### Blocker 1 — the app has no BigQuery write path

`lib/bigquery.js` only ever issues read queries; nothing in `builder/src`
writes to BQ. "Dismiss" and "Done" need somewhere to persist. Two options:

- **BQ DML** from the browser on the user's own OAuth token. Keeps one source
  of truth, and the routine already reads `status` to suppress dismissed
  findings. Needs a write grant on `call_prep` for every rep, and the table is
  append-only so a dismiss is an INSERT, not an UPDATE.
- **Supabase**, which the app already writes to. No new grants, but the routine
  would have to read dismissals from a second store.

Undecided. BQ DML is the smaller conceptual change.

### Blocker 2 — Gmail scopes

Per-item "Draft" and the live in-browser refresh both need Gmail scopes the
OAuth client doesn't request today. `bigquery.js` already does incremental
consent for `calendar.readonly` (see `connectWithCalendar`), so the mechanism
exists — add `gmail.readonly` for the refresh and `gmail.compose` for drafting.

**The gating question is not code.** Both are Google *restricted* scopes. If
OAuth client `546732685010-…` is published **Internal** to the method.me
Workspace, restricted scopes need no verification and this is a config change.
If it's **External**, it needs Google app verification and possibly a CASA
security assessment before any rep can grant them. Confirm the publishing
status in the GCP console before building against these.

### Planned change to the routine

Once per-item drafting works, `/time-killer` Step 5 should stop drafting
everything automatically and leave findings `open` for the rep to action from
this screen. **Don't make that change first** — until the screen can create a
draft, it would leave no drafts anywhere.

## Related

- `PS_Claude Projects/method-ps-time-killer/commands/time-killer.md` — the write side
- `docs/local-ui-dev.md` — the mock-mode harness
- `builder/.claude/skills/ui-review/SKILL.md` — copy and a11y standards
