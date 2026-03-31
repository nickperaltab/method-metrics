# Code Review — Justin's PRs (2026-03-31)

Review of PRs #6, #11, #13, #14, #15, #31 merged to main.

## Already Fixed

1. **`fetchChartData` fallback removed** — Required `chart_sql` for all metrics, breaking Trials/Syncs/Conversions. Restored `fetchAggregatedData` fallback. Regression test added.
2. **OAuth hardcoded hint** — `hint: 'j.porter@method.me'` + `prompt: 'select_account'` forced account picker for all users. Removed.

## Critical

### 3. `approvedDimensions` wired up but never passed
**Files:** `ai.js` lines 37, 74, 125, 154

Both `buildMetricContext(metrics, approvedDimensions)` and `validateColumns(dc, resolvedMetrics, schemaMap, approvedDimensions)` accept an `approvedDimensions` parameter, but every call site passes only 3 arguments. The AI never sees dimension info, and dimension validation falls back to raw schema columns. Half-shipped feature.

**Fix:** Pass `approvedDimensions` from ChatExplorer/Explorer when calling `generateChartSpecWithHistory`.

### 4. `dashboards.created_by` column type conflict
**File:** `supabase/migrations/20260331000001_create_users.sql` line 29

Migration tries `ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id)` but `created_by` already exists as TEXT. `IF NOT EXISTS` silently skips. FK constraint never applied. Code continues writing text strings. Works by accident.

## Important

### 5. `recordDashboardView` never called
**File:** `supabase.js` line 280

Function exists, `dashboard_views` table exists, Home page reads from `fetchRecentViews` — but DashboardView.jsx never writes a view record. "Recently Viewed" on Home page will always be empty.

### 6. Supabase credentials duplicated in 3 page files
**Files:** `pages/Registry.jsx`, `pages/Dimensions.jsx`, `pages/Charts.jsx` (lines 4-10 each)

All re-declare `SUPABASE_URL`, `SUPABASE_KEY`, and `headers` locally instead of importing from `lib/supabase.js`. Uses raw `fetch()` instead of `fetchWithTimeout` — no timeout protection.

### 7. No error handling on Registry/Charts delete/update
**File:** `pages/Registry.jsx` lines 12-18, 21-27

Inline saves on `onBlur` update local state optimistically. If PATCH fails, user sees updated value but it's not persisted. Same issue in Charts.jsx `handleDelete`.

### 8. `ChartDetails.jsx` references old status `'review'`
**File:** `components/ChartDetails.jsx` line 150

`statusColor` handles `'review'` which no longer exists. Should handle `'queued'` instead. Currently falls through to default gray (works visually, but dead code).

### 9. Migration policies not idempotent
**File:** `supabase/migrations/20260331000002_type_system_redesign.sql` lines 32-35

`CREATE POLICY` without `IF NOT EXISTS` guard. Will fail if run twice.

## Minor

### 10. Double dashboard fetch on Home page
Sidebar.jsx and Home.jsx both call `fetchDashboards()` independently on mount = 2 redundant requests.

### 11. UserPicker has no dismiss fallback
If `users` table is empty or fetch fails, user is stuck on empty picker overlay with no way to close it.

### 12. `dashboard_views` table grows unboundedly
No TTL or cleanup. Will grow without limit.

### 13. `Charts.jsx` imports unused `useCallback`

### 14. `ApprovedDashboards` page is a stub
Routed at `/approved` but contains only placeholder text.
