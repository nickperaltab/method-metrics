# PS Hub

New screens in the builder app (`/ps-hub`, `/ps-hub/:id`) that consolidate
Method PS call preps, call audits (PPU + Free Hour), and project notes for
every dedicated account — the write side is Claude routines (call-prep,
free-hour-audit, ps-call-audit), the read side is this dashboard.

## Data model

Four tables, migration `supabase/migrations/20260709000000_create_ps_hub_tables.sql`:

- `ps_accounts` — `name`, `method_customer_id` (unique), `account_type` (`DEDICATED`/`PPU`/`FREE`), `is_dedicated`
- `ps_call_preps` — one per `(account_id, call_date)`; `summary`, `content`, `dep_score`, `source_doc_url`
- `ps_audits` — one per `(account_id, audit_type, call_date)`; `audit_type` (`PPU`/`FREE_HOUR`), `total_score`, `max_score`, `score_breakdown` (jsonb), `flags` (jsonb), `notes`, `transcript_url`
- `ps_project_notes` — `title`, `status` (`OPEN`/`IN_PROGRESS`/`BLOCKED`/`DONE`), `body`, `due_date`

RLS is enabled on all four with **read-only** anon policies (`SELECT USING (true)`,
same convention as the rest of this app's tables). There are deliberately no
anon insert/update/delete policies — all writes go through the
`ps-hub-ingest` Edge Function using the service-role key, so the anon key
(which ships in the frontend bundle) can never be used to write PS Hub data.

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

- `builder/src/lib/psHub.js` — `fetchPsAccounts()`, `fetchPsAccount(id)` (reads, anon key, same pattern as `lib/supabase.js`)
- `builder/src/pages/PsHub.jsx` — account list
- `builder/src/pages/PsHubAccount.jsx` — account detail (latest call prep, recent audits, project notes)
- Nav: "PS Hub" link in `Sidebar.jsx`, visible to all signed-in users (no role gate)
