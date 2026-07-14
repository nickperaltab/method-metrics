# Free Hours → Paid Services: Scored Calls, Findings Layer, and UI — Design

**Date:** 2026-07-14
**Status:** Draft for review
**Owner:** Nic
**Upstream:** `customer_signals` dataset (Nic), Zoom transcript ingestion (exists)

## Problem

Professional Services delivers free consulting hours, but we measure volume
(hours delivered), not outcomes (conversion to paid services: pay-per-use
hours or the Dedicated Enhancement Plan). Session content is recorded
(Zoom transcripts, ingested to `customer_signals.conversations`) but not
queryable: we can't answer "what happens in these sessions, what's missing,
and what correlates with conversion" without reading transcripts by hand.

The deliverable is a verdict, not a dashboard: is the free hour a
high-leverage surface to improve PPU/DEP conversion, and if so, via session
structure (coaching), targeting (who gets hours), or ownership (who makes
the paid-services close)?

## Decisions already made

- **Analysis frame:** sequenced, anchored on each account's first attended
  free hour. Outcome = first PPU or DEP purchase *after* the anchor, with
  conversion curves at 30/90/180/365 days. Accounts already paying before
  their first free hour are reported as a separate segment (free time
  consumed by already-paying accounts), never mixed into conversion math.
- **Primary KPI:** close rate (free hour → PPU/DEP). Supporting: offer rate
  (was paid work proposed in the session). Show rate is measured but not an
  optimization target in v1.
- **Drivers analyzed:** consultant, account profile (size, MRR tier,
  industry via `int_customer_firmographics`), timing (account age at free
  hour, speed to convert). Dose-response (hours count) is out of scope v1.
- **Secondary outcome:** churn/survival of non-converters (ties to the
  established billing-help retention ladder).
- **History floor:** January 2025 (start of `conversations` transcript
  coverage). Pre-2025 sessions exist in `revenue.Activity` and contribute
  to base rates only, with no session-content scoring.
- **Storage:** everything content-bearing lives in BigQuery
  (`customer_signals`), never in this repo. The repo holds rendering code
  and SQL only.
- **Comparison corpus (phase 2, design for it now):** `conversations` also
  holds `customization` (paid session) and `demo` calls. The scores table
  is keyed generically on `conversation_id` so these can be scored with the
  same machinery later. v1 scores `free_hour` calls only.

## Architecture: five layers, pointer-not-copy

```
L1  customer_signals.conversations      transcripts (EXISTS, Nic's pipeline)
L2  customer_signals.call_scores        rubric scores + evidence quotes (NEW)
L3  customer_signals.findings           claims with citations + chart specs (NEW)
L4  builder/ UI                         findings doc, call browser, call detail (NEW)
L5  static exports                      dated snapshots of L4, cite finding IDs
```

Each layer points down; nothing copies up. Outcomes (PPU/DEP), firmographics,
and consultant book are joined at query time, never stored in L2/L3 — scores
are facts about a call, outcomes change over time.

## Data contract

### Exists: `customer_signals.conversations`

Keyed `conversation_id`. Fields used: `account_id`, `call_type`,
`occurred_at`, `transcript_text`, `participants`, `company_account`.
Coverage: ~8.3K calls 2025–present; `free_hour` = 946 (2025) + 493 (2026 YTD),
~97% with transcript text, ~96% account-linked.

### New: `customer_signals.call_scores`

One row per (conversation, rubric_version). Append-only; re-scoring under a
new rubric adds rows, never updates. Clustered by `conversation_id`.

| Column | Type | Notes |
|---|---|---|
| `conversation_id` | STRING | FK to `conversations` |
| `transcript_hash` | STRING | pins the transcript version scored |
| `call_type` | STRING | denormalized for cheap filtering |
| Rubric dimensions (one group per dimension) | | score + rationale each |
| `problem_diagnosed` | BOOL | a specific problem named and confirmed |
| `discovery_questions` | INT64 | count of substantive discovery questions |
| `past_attempts_explored` | BOOL | prior attempts/workarounds discussed |
| `paid_work_proposed` | BOOL | paid engagement raised at all |
| `proposal_specificity` | STRING | none / generic_mention / scoped_proposal |
| `session_mode` | STRING | diagnostic / build / troubleshoot / mixed |
| `objections_handled` | STRING | none_raised / raised_unaddressed / raised_addressed |
| `next_step_owner` | STRING | consultant / customer / csm / none |
| `*_rationale` | STRING | one per dimension, model's one-line justification |
| `evidence` | ARRAY<STRUCT<dimension STRING, quote STRING>> | verbatim transcript quotes |
| `model_id` | STRING | provenance (mirrors `signals_by_call`) |
| `prompt_version` | STRING | |
| `rubric_version` | STRING | |
| `run_id` | STRING | |
| `scored_at` | TIMESTAMP | |
| `input_token_count` / `output_token_count` | INT64 | cost tracking |

### New: `customer_signals.findings`

One row per claim. Append-only with lifecycle status.

| Column | Type | Notes |
|---|---|---|
| `finding_id` | STRING | stable ID, cited by exports |
| `section` | STRING | verdict / current_state / correlation / methodology |
| `sort_order` | INT64 | document assembly order |
| `title` | STRING | |
| `body_md` | STRING | narrative markdown |
| `metric_value` | STRING | headline number as displayed |
| `as_of` | DATE | when the number was computed |
| `sql` | STRING | query that produced the number (reproducibility) |
| `chart_spec` | STRING (JSON) | optional; renderer draws it live via ECharts |
| `evidence` | ARRAY<STRING> | conversation_ids exemplifying the claim |
| `status` | STRING | draft / confirmed / retired |
| `superseded_by` | STRING | finding_id, when retired |
| `author` | STRING | human or model+run |
| `created_at` | TIMESTAMP | |

## Scoring pipeline (NOT in this repo)

A batch job (Python + Claude API) that: selects `conversations` rows lacking
a `call_scores` row at the current `rubric_version`, scores each transcript
against the rubric, and appends rows. Historical backfill ~1.4K free-hour
transcripts (one-time), then incremental on a schedule.

It lives alongside the `customer_signals` ingestion code, not in
method-metrics: it needs an API key (can't run in the browser), and the
prompt text stays out of the public repo. This repo consumes `call_scores`
read-only. The rubric dimension *names* are public via the schema above;
the prompt wording is not.

## Conversion analysis definitions

- **Anchor:** account's first attended free hour (`conversations.call_type
  = 'free_hour'`, fallback `revenue.Activity` for pre-2025 base rates,
  dated by `DueDateStart` — `CreatedDate` is null on ~4K historical rows).
- **PPU outcome:** first professional-services transaction after the anchor
  (exact TransLine definition to be confirmed during recon — see Open
  items).
- **DEP outcome:** DEP enrollment after the anchor (flag source confirmed
  during recon).
- **Segments:** (A) no paid services before anchor → conversion cohort;
  (B) paid services before anchor → cost segment, reported separately.
- All analysis SQL lives in this repo (public-safe: queries only, no data).

## UI (builder/, method-metrics)

New section following the call-prep pattern: React + Vite + HashRouter,
per-user Google OAuth → BigQuery REST (`builder/src/lib/bigquery.js`),
deployed via GitHub Pages on push to main. Viewers need BQ IAM read on
`customer_signals` plus the joined datasets.

Routes:

- `#/free-hours` — **findings document.** Renders `findings` rows
  (status != retired) as a structured report: sections in `sort_order`,
  markdown bodies, live charts from `chart_spec` (existing EChart wrapper +
  Method theme), citation chips linking to call detail. This is the live
  artifact; there is no static file to go stale.
- `#/free-hours/calls` — **call browser.** `call_scores` joined to
  `conversations` + outcomes at query time. Filter by consultant, rubric
  dimension, converted y/n, date.
- `#/free-hours/call/:conversationId` — **call detail.** Scores with
  rationales, evidence quotes highlighted, transcript view, account context,
  outcome status.

Privacy model: the repo ships an empty shell. All content (transcripts,
scores, findings text) is fetched at view time behind BQ IAM. A visitor
without access sees permission errors, not data.

## Error handling

- Scoring job: per-transcript failures recorded with `extraction_status`
  -style error columns (mirror `signals_by_call`), never block the batch.
- UI: missing `call_scores` row → call renders with "not yet scored";
  malformed `chart_spec` → finding renders body without chart; BQ
  permission failure → existing builder auth-error surface.
- Findings with `as_of` older than a threshold render a staleness badge
  rather than silently presenting old numbers as current.

## Testing

- Scoring job: golden-transcript fixtures (one per session_mode) asserting
  stable rubric outputs across prompt tweaks; schema validation on append.
- UI: unit tests for findings assembly (section ordering, retired
  filtering, citation link building) and chart_spec parsing, following
  existing `builder/tests/unit` patterns.
- Analysis SQL: parity spot-checks of anchor/outcome joins against known
  accounts before any number is published to `findings`.

## Open items (recon, no user decisions required)

1. `conversations.account_id` grain — confirm it's
   `CustomerMethodAccount.RecordID` and map to `EntityRecordID` for joins
   to firmographics/MRR.
2. Exact PPU transaction definition in TransLine data; DEP flag source.
3. Ingestion freshness — latest `occurred_at` observed 2026-06-24; confirm
   batch cadence vs stalled.
4. Proposal records in Alocet as a secondary offer-rate signal (partial
   coverage; transcripts are primary).
5. Historical backfill cost estimate at chosen model before running.

## Out of scope (v1)

- Scoring `customization`/`demo` calls (schema supports; phase 2).
- Show-rate optimization; dose-response analysis.
- Supabase involvement of any kind; Alocet writes.
- Automated finding generation — v1 findings are authored (with model
  assistance) and reviewed before `status = confirmed`.
