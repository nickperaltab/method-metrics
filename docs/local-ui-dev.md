# Local UI dev — offline mock mode

Design and iterate on the builder's screens with **no Google sign-in and no
network**. Intended for PS work (`/ps`, `/call-prep`, `/handoffs`, and new
screens like the project tracker) where the blocker is the auth gate, not the
data.

```bash
npm run dev:mock          # from the repo root, or from builder/
```

That runs `vite --mode mock`, which loads `builder/.env.mock`. The app opens
straight onto the screens with a **Mock data** badge in the top bar, signed in
as `VITE_MOCK_EMAIL` (default `b.saltzman@method.me`).

`npm run dev` is unchanged: real Google OAuth, real BigQuery, real Supabase.

## What gets faked

| Layer | Real path | Mock path |
|---|---|---|
| Sign-in gate | Google OAuth token client | `useBqAuth` reports connected + `VITE_MOCK_EMAIL` |
| BigQuery | `queryBq()` → BQ REST | `src/dev/mockBq.js` routes the SQL to fixtures |
| Supabase REST | `fetchWithTimeout()` | `src/dev/mockSupabase.js` (`users` table only; other reads return `[]`, writes are swallowed) |
| PostHog | real client | no-op stub, so fake sessions never hit the real project |

Everything is gated on `MOCK_MODE` in `src/dev/mockMode.js`, which requires
**both** `VITE_MOCK_DATA=true` **and** `import.meta.env.DEV`. `vite build` sets
`DEV` false, so a production bundle cannot serve fixtures even if the env var
leaks in — and the fixture module tree-shakes out of it entirely. Verify after a
build with:

```bash
cd builder && npm run build
grep -c Northwind dist/assets/index-*.js   # expect 0
```

## Fixture data

`builder/src/dev/fixtures/ps.js` — ten invented accounts with snapshot history,
TimeTracking sessions, Cases, `int_accounts` overviews, and handoff packets.

- **It must stay fake.** This repo is public; real account names and per-customer
  MRR are gitignored for that reason. Never paste a live BQ result in here.
- Dates are **relative to today**, so the `/ps` Today panel always has rows.
- Accounts deliberately cover the states the UI has to render: failing sync,
  open cases, a cold (30+ days idle) account, DEP accounts with signals, a
  multi-entity child, a churned account, and clean accounts.
- Consultant names mix `Brandon Saltzman` and `B. Saltzman` on purpose — the real
  snapshots feed writes both, and `consultantPatternFromEmail()` exists to unify
  them. Fixtures with one spelling would hide a regression there.
- Rows are shaped like the **BigQuery REST response**: every scalar is a string,
  repeated fields are `[{ v }]` arrays. So fixtures run through the same
  `normalize*Row()` coercion as production data.

## Adding a screen

`mockBq.js` is a router, not a SQL engine: it reads the table name, the record
id, the consultant regex and the `QUALIFY` clause out of the query and returns
the matching fixture slice. To support a new screen:

1. Add a table to `build()` in `src/dev/fixtures/ps.js` (or a new fixture module).
   Keep it inside the function — module-level `.flatMap()` calls read as side
   effects to Rollup and get pinned into the production bundle.
2. Add one entry to `ROUTES` in `src/dev/mockBq.js`. Order matters: a query that
   joins two tables must be routed before the single-table catch-all.
3. Extend `builder/tests/unit/mockBq.test.js` — it feeds the real SQL builders
   through the router and the results through the real normalizers, so a renamed
   column fails a test instead of silently blanking a panel.

Until a route exists, the query returns zero rows and logs
`[mock] unrouted query — add a fixture route in src/dev/mockBq.js` with the SQL,
so a blank new screen tells you exactly what's missing. Every mock query also
logs its matched route and row count at `console.debug`.

## Knobs (`builder/.env.mock`)

| Var | Default | Effect |
|---|---|---|
| `VITE_MOCK_DATA` | `true` | Master switch. Without it, mock mode is off. |
| `VITE_MOCK_EMAIL` | `b.saltzman@method.me` | Who you're signed in as. Needs a `first.last` shape — the PS scoping derives a consultant-name regex from it. |
| `VITE_MOCK_SUPABASE` | `true` | `false` keeps the **real** Supabase catalog and dashboards (anon key, no login needed) while BigQuery stays faked. Useful when you want a real metric list. |
| `VITE_MOCK_LATENCY` | `140` | Fake per-query latency in ms, so loading states are visible. `0` = instant. |

## The project tracker is fixture-only — and writable

The `/projects` screens have **no backing store yet**: the tables
`lib/projects.js` queries don't exist in BigQuery. Mock mode is currently the only
way to use them, which is why the Projects nav link is gated on `MOCK_MODE`.

Unlike the read-only PS screens, the tracker has create/edit/log-work flows, so
mock mode keeps a **mutable** copy of the fixtures in `localStorage`
(`src/dev/mockStore.js`, key `method_metrics_mock_store`):

- Edits survive a page reload — you can't design an editing flow against data that
  resets on every render.
- **Reset sample data** on the board throws it away and reseeds.
- Bump `STORAGE_VERSION` in `mockStore.js` when you change a row shape; a stale
  saved store is discarded rather than half-migrated.
- The mock SQL routes read from the store rather than the fixtures, so writes are
  visible on the next read **while still travelling through the real SQL builders
  and normalizers**. The write path is fake; the read contract stays honest.

Fixtures live in `src/dev/fixtures/projects.js`; that shape is the draft schema.
See `docs/ps-project-tracker.md`.

The customer page (`/accounts/:recordId`) is different: its tables **do** exist in
BigQuery, so `src/dev/fixtures/customer.js` mirrors their real shape *and their
uneven coverage* (an account with no calls, most calls with no summary, audits on
only some accounts) rather than standing in for a missing store. See
`docs/ps-customer-page.md`.

## Limits

- Screens driven by the Supabase metric catalog (Chat, Explorer, Dashboards,
  Scorecards, Registry) render **empty** in full-offline mode — there are no
  metric fixtures. Set `VITE_MOCK_SUPABASE=false` (with a connection) to work on
  those.
- Mock mode never writes anywhere. Save/edit actions that PATCH Supabase are
  swallowed with a `[mock] swallowed PATCH …` warning, so an editing flow will
  look like it succeeded without persisting.
- `VITE_BYPASS_AUTH=true` still exists as the older, narrower flag: it opens the
  sign-in gate but leaves BigQuery real, so PS pages error with
  "Not connected to BigQuery". Prefer `npm run dev:mock`.
