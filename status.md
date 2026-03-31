# Method Metrics — Status

**Last updated:** 2026-03-31

## Current state

App is live on GitHub Pages: https://nickperaltab.github.io/method-metrics/builder/#/chat

13 tickets shipped and merged to main. Supabase migrations applied. GitHub Pages CI deploys automatically on push to main.

## What Nic is doing now

1. **Push to Vercel** — the app needs to be on Vercel (Pro plan) so both Nic and Justin can collaborate. The Vercel domain also needs to be added to the Google OAuth client's authorized JavaScript origins (client ID: `546732685010-nojjfak7esmun2taour8r5pakrsrg3aq`) so BigQuery connect works.
2. **Get chart builder working** — the AI chat flow, chart rendering, and save-to-dashboard flow need to work within the new app shell.

## What Justin is doing now

QA on the UX — testing all flows on the live GitHub Pages URL.

## Key architecture changes (for Nic)

- **Vite base path**: `vite.config.js` uses `process.env.VITE_BASE || '/'`. GitHub Pages CI sets `VITE_BASE=/method-metrics/builder/`. Vercel should leave it unset (defaults to `/`).
- **2 metric types only**: Primitive and Derived. Old types (foundational, transform, etc.) are gone. `getType()` in tracker.html and `groupMetrics()` in supabase.js updated.
- **Auto-generated queries killed**: `fetchChartData()` in bigquery.js no longer falls back to `fetchAggregatedData()`. Every metric needs `chart_sql`.
- **User system**: `UserProvider` wraps the app. `useUser()` hook gives `currentUser`. User picker on first visit, stored in localStorage. Users table in Supabase with Justin and Nic seeded.
- **App shell**: `Layout.jsx` + `Sidebar.jsx` replaced `TopBar.jsx`. Sidebar has Home, Chart Builder, My Charts, My Dashboards, Admin (Registry, Dimensions).
- **New pages**: `pages/Home.jsx`, `pages/Registry.jsx`, `pages/Dimensions.jsx`, `pages/Charts.jsx`, `pages/ApprovedDashboards.jsx`
- **Dashboard features**: Stars (`dashboard_stars` table), folders (`dashboard_folders` table), recently viewed (`dashboard_views` table). DashboardList.jsx rewritten with sort/star/folder support.
- **Dashboard edit mode**: DashboardView.jsx has an Edit toggle. Charts are draggable/resizable in edit mode. Edit/remove controls only show in edit mode.
- **BQ OAuth**: Added `hint: 'j.porter@method.me'` and `prompt: 'select_account'` to `connectBq()`.

## Supabase tables added

- `users` — id, name, email, role. Seeded with Justin + Nic.
- `approved_dimensions` — metric_id, dimension_name, column_name, verified_at. Seeded for trials/syncs/conversions/churn.
- `dashboard_stars` — dashboard_id, user_id. Unique per pair.
- `dashboard_folders` — name, user_id, sort_order.
- `dashboard_views` — dashboard_id, user_id, viewed_at. For recently viewed.

## Remaining tickets

- **#24** — Graduate 13 verified metrics. Blocked on Justin's approval.
- **#27** — Future: Metric solver as in-app feature.
- **#30** — Future: Retire method-data-modelling repo.

## File map (new/changed files)

```
builder/src/
  App.jsx                    — Rewired: Layout wrapper, new routes
  contexts/UserContext.jsx   — NEW: user provider + useUser hook
  components/
    Layout.jsx               — NEW: sidebar + content area wrapper
    Sidebar.jsx              — NEW: persistent left nav with favorites
    UserPicker.jsx           — NEW: first-visit "Who are you?" picker
    TopBar.jsx               — Updated: shows user name + switch button
    DashboardList.jsx        — Rewritten: stars, folders, sort
    DashboardView.jsx        — Updated: edit mode toggle, drag/resize
  pages/
    Home.jsx                 — NEW: favorites, recents, recommended
    Registry.jsx             — NEW: full metric registry (replaces tracker.html)
    Dimensions.jsx           — NEW: approved dimensions management
    Charts.jsx               — NEW: chart library with search/rename/delete
    ApprovedDashboards.jsx   — NEW: placeholder
  lib/
    supabase.js              — Added: fetchUsers, stars, folders, views, dimensions APIs
    bigquery.js              — Changed: killed auto-gen, added login hint
    ai.js                    — Changed: 2 types, approved dimensions in context
```
