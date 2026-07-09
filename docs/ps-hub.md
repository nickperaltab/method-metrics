# PS Hub

New screens in the builder app (`/ps-hub`, `/ps-hub/:id`) that consolidate
Method PS call preps, call audits (PPU + Free Hour), and project notes for
every dedicated account — the write side is Claude routines (call-prep,
free-hour-audit, ps-call-audit), the read side is this dashboard.

## Data model

Four tables, migration `supabase/migrations/20260709000000_create_ps_hub_tables.sql`,
extended by `supabase/migrations/20260710000000_ps_hub_board_calendar.sql`:

- `ps_accounts` — `name`, `method_customer_id` (unique), `account_type` (`DEDICATED`/`PPU`/`FREE`), `is_dedicated`, `owner_email` (consultant who owns the account — drives the board's "Mine" filter), `is_active` (default `true` — drives the board's "Active only" filter)
- `ps_call_preps` — one per `(account_id, call_date)`; `summary`, `content`, `dep_score`, `source_doc_url`
- `ps_audits` — one per `(account_id, audit_type, call_date)`; `audit_type` (`PPU`/`FREE_HOUR`), `total_score`, `max_score`, `score_breakdown` (jsonb), `flags` (jsonb), `notes`, `transcript_url`
- `ps_project_notes` — `title`, `status` (`OPEN`/`IN_PROGRESS`/`BLOCKED`/`DONE`), `body`, `due_date`

RLS is enabled on all four. Reads are anon `SELECT USING (true)`, same
convention as the rest of this app's tables. As of the second migration,
anon **UPDATE** is also allowed on `ps_accounts`, `ps_call_preps`, and
`ps_audits`, and anon **INSERT/UPDATE/DELETE** on `ps_project_notes` — this
is what lets the board/detail UI edit cards directly from the browser. That
matches how the rest of this repo does RLS (wide open by convention;
`dashboards`/`saved_charts`/`metrics` all allow anon writes) — the real gate
is the app's Google OAuth sign-in wall, not RLS. Routine-driven writes
(call-prep, free-hour-audit, ps-call-audit) still go exclusively through the
`ps-hub-ingest` Edge Function with the service-role key; this only opened up
human edits from the frontend.

**Manual backfill needed:** `owner_email` is not populated by the ingest
function. Someone with Supabase access needs to backfill it once (e.g. by
matching `ps_accounts.method_customer_id` against Alocet
`CustomerMethodAccount.MethodRepName` → an email) so the board's "Mine"
filter has something to filter on. Until that's done, accounts show up
under "Everyone" only.

## ps-hub-ingest Edge Function

`supabase/functions/ps-hub-ingest/index.ts` — a single POST endpoint,
authenticated by a static shared secret (not per-user; routines run
unattended with no Google account to check):

```
Authorization: Bearer <PS_HUB_ROUTINE_KEY>
Content-Type: application/json
```

Body shape: `{ "resource": "account" | "call_prep" | "audit" | "project_note", ... }`.
Call preps, audits, and accounts (when `method_customer_id` is given) are
upserts, keyed on the table's unique constraint. Accounts are targeted by
either `account_id` or `method_customer_id`.

```jsonc
// resource: "account"
{ "resource": "account", "name": "Acme Co", "method_customer_id": "123", "account_type": "DEDICATED", "is_dedicated": true }

// resource: "call_prep"
{ "resource": "call_prep", "method_customer_id": "123", "call_date": "2026-07-09", "summary": "...", "content": "...", "dep_score": 82 }

// resource: "audit"
{ "resource": "audit", "method_customer_id": "123", "audit_type": "PPU", "call_date": "2026-07-09", "total_score": 540, "max_score": 625 }

// resource: "project_note" (create)
{ "resource": "project_note", "method_customer_id": "123", "title": "Migrate custom fields", "status": "OPEN" }

// resource: "project_note" (update, by id)
{ "resource": "project_note", "id": "<uuid>", "status": "DONE" }

// resource: "project_note" (delete, by id)
{ "resource": "project_note", "id": "<uuid>", "action": "delete" }
```

## Deploying (manual — no CI wired up for this yet)

Whoever has Supabase CLI access to this project needs to:

1. Apply the migration: `supabase db push` (or run the SQL file directly in
   the Supabase SQL editor).
2. Set the new function secret: `supabase secrets set PS_HUB_ROUTINE_KEY=<random value>`
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already set for the
   other functions).
3. Deploy the function: `supabase functions deploy ps-hub-ingest`.
4. Give the routines (call-prep, free-hour-audit, ps-call-audit) the
   function URL (`<SUPABASE_URL>/functions/v1/ps-hub-ingest`) and the same
   `PS_HUB_ROUTINE_KEY` value so they can POST into it.

## Frontend

- `builder/src/lib/psHub.js` — reads (`fetchPsAccounts`, `fetchPsBoard`, `fetchPsAccount`) and writes (`updatePsAccount`, `updateCallPrep`, `updateAudit`, `createProjectNote`, `updateProjectNote`, `deleteProjectNote`), all anon key, same pattern as `lib/supabase.js`
- `builder/src/pages/PsHub.jsx` — the "day snapshot" screen:
  - **Today panel** — today's calendar events (see Calendar module below), each matched to a `ps_accounts` row when possible
  - **Board** — card grid of accounts, filterable by owner (Mine / Everyone / pick a consultant), active-only toggle, account type (defaults to `DEDICATED`, i.e. "managed billable"), and free-text search. Each card shows latest DEP score, latest audit score, and open project-note count.
- `builder/src/pages/PsHubAccount.jsx` — account detail, now editable in place: call prep summary/content/DEP score, audit notes/scores, project notes (full CRUD), account owner/active status
- Nav: "PS Hub" link in `Sidebar.jsx`, visible to all signed-in users (no role gate)

## Calendar module

`builder/src/lib/calendar.js` + `builder/src/hooks/useCalendarAuth.js` — a
**separate** Google OAuth connection scoped to `calendar.readonly`, opt-in
from inside PS Hub only (a "Connect Calendar" button in the Today panel).
Deliberately not folded into the main app-wide "Connect Google Account"
button (`lib/bigquery.js`, scoped to BigQuery + email) — that one is shared
by Nic/Justin for unrelated rev-ops work, and they shouldn't see a calendar
consent prompt just to open the metrics dashboard.

- Token stored under a separate `localStorage` key (`ps_hub_calendar_token`), independent of the BQ token.
- Fetches today's events from the signed-in user's **primary** calendar (`calendar/v3/calendars/primary/events`, local-day `timeMin`/`timeMax`).
- `matchEventToAccount()` strips the `Method Consulting Booked:` / `Method Free Hour Booked:` prefixes (same convention as the call-prep/team-call-prep routines) and substring-matches the remainder against `ps_accounts.name`. Events with no match still show, just without an account link.
- **One-time setup needed:** the Google Cloud OAuth consent screen for this app's client ID needs the `calendar.readonly` scope enabled (it currently only has `bigquery` + `userinfo.email`) before the "Connect Calendar" button will work.
