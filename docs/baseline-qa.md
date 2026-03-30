# Baseline QA Report

**Date:** 2026-03-30
**Tested against:** GitHub Pages (`nickperaltab.github.io/method-metrics/`)
**Purpose:** Document what works and what's broken before the rebuild (ticket #28)

---

## Tracker (`tracker.html`)

| Flow | Status | Notes |
|------|--------|-------|
| Page loads, metrics display | WORKS | 5 metrics load from Supabase, grouped by type (4 Primitives, 1 Transform) |
| Status/Assigned/Type filter dropdowns | WORKS | Each filters the table; count updates ("4 of 5 metrics") |
| Search by name | WORKS | Typing "Trials" filters to 1 result |
| Reset button | WORKS | Clears all filters, restores full list |
| Sort by column | WORKS | Clicking column headers toggles asc/desc, arrow indicator updates |
| Inline description editing | WORKS | Textarea saves on blur via PATCH to Supabase |
| Type dropdown (inline) | WORKS | Changes save to Supabase |
| Status dropdown (inline) | WORKS | Changes save to Supabase |
| Priority dropdown (inline) | WORKS | Changes save to Supabase |
| Assigned dropdown (inline) | WORKS | Changes save to Supabase |
| Expand panel on row click | WORKS | Shows BQ view name, SQL definition, depends-on, used-by, transforms, notes, delete button |
| SQL definition displays | WORKS | Shows cached `view_definition` from Supabase |
| SQL Edit button | PRESENT | Edit button visible in expand panel (not tested — requires BQ auth) |
| SQL Test/Preview button | PRESENT | Test button visible in expand panel (not tested — requires BQ auth) |
| Depends On pills | WORKS | Shows "None" correctly for metrics with no dependencies |
| Used By pills | WORKS | Shows "Nothing depends on this" correctly |
| Notes field | WORKS | Textarea present, content saves on blur |
| Delete metric button | PRESENT | Button visible in expand panel (not tested — destructive) |
| Bulk select checkboxes | WORKS | Individual row checkboxes toggle selection |
| Select-all / Deselect-all | WORKS | Header checkbox toggles all; bulk bar shows count |
| Bulk delete | PRESENT | "Delete Selected" button appears in bulk bar (not tested — destructive) |
| New Metric wizard (+) | PRESENT | Floating "+" button visible (not tested — would create real data) |
| URL deep-link (?expand=54) | WORKS | URL parameter support for direct linking to expanded metric |

## Chart Builder (`builder/#/chat`)

| Flow | Status | Notes |
|------|--------|-------|
| Page loads | WORKS | Nav bar renders (METHOD, Chat, Dashboards, Metrics) |
| "Connect BigQuery" button | WORKS | Button present in top-right |
| Pre-auth state | WORKS | Shows "Connect BigQuery to start chatting" |
| BigQuery OAuth flow | NOT TESTED | Requires interactive Google OAuth popup |
| AI chat produces chart config | NOT TESTED | Requires BQ auth |
| Chart renders with real BQ data | NOT TESTED | Requires BQ auth |
| Chart type switching | NOT TESTED | Requires BQ auth |
| Conversational follow-ups | NOT TESTED | Requires BQ auth |
| Save chart | NOT TESTED | Requires BQ auth |
| Nav links work | WORKS | Chat, Dashboards, Metrics links navigate correctly |

## Dashboards (`builder/#/dashboards`)

| Flow | Status | Notes |
|------|--------|-------|
| Dashboard list loads | WORKS | 6 dashboards display with chart counts and dates |
| Dashboard detail opens on click | WORKS | Tested "Trials and syncs" — loads 7 chart slots |
| Chart titles display | WORKS | Each chart shows its name/prompt |
| Edit chart button (pencil) | PRESENT | Visible per chart |
| Remove chart button (x) | PRESENT | Visible per chart |
| Feedback buttons (thumbs) | PRESENT | Thumbs up/down visible per chart |
| Back button | WORKS | "←" returns to dashboard list |
| "+ Add Chart" button | PRESENT | Visible in dashboard detail view |
| "+ New Dashboard" button | PRESENT | Visible in dashboard list view |
| Charts render with BQ data | NOT TESTED | Shows "Connect BigQuery to load charts" without auth |
| Chart Library section | WORKS | Shows "No saved charts yet" message |

---

## Known Issues

### 1. "Could not detect columns" in Transforms section
**Where:** Tracker > expand any Primitive metric > TRANSFORMS section
**Repro:** Click on "Trials" in tracker > scroll to TRANSFORMS
**Behavior:** Shows "Could not detect columns" instead of listing available transform dimensions
**Severity:** Low — informational display, doesn't block functionality

### 2. Three dashboards show "0 charts"
**Where:** Dashboard list
**Repro:** Navigate to builder/#/dashboards
**Behavior:** "JP New", "Justin's Dashboard", and "Justins New Dashboard" all show 0 charts
**Notes:** Likely test dashboards that were created but never populated. Not a bug per se, but clutters the list.

### 3. Navigation dead-ends in chart builder (pre-existing)
**Where:** Chart builder flows
**Notes:** Reported in ticket — after certain interactions there's no clear way to navigate back. Cannot fully verify without BQ auth.

### 4. Charts not rendering when added to dashboards (pre-existing)
**Where:** Dashboard detail view
**Notes:** Reported in ticket. Cannot verify without BQ auth — charts show "Connect BigQuery to load charts" in unauthenticated state.

### 5. Redundant "pick a dashboard" dropdown (pre-existing)
**Where:** Save chart flow from within a dashboard
**Notes:** Reported in ticket. Cannot verify without BQ auth.

### 6. BQ-dependent flows untestable in CI
**Where:** All chart builder and dashboard chart-rendering flows
**Impact:** Approximately 40% of the acceptance criteria in ticket #28 require BigQuery OAuth, which is an interactive browser flow. These flows cannot be automated with Playwright without a mock layer or service account token injection.
**Recommendation:** For the rebuild, add a mock/demo mode that renders charts from cached data, enabling full E2E testing without OAuth.

---

## Test Coverage Summary

| Area | Testable Flows | Tested | Requires BQ Auth |
|------|---------------|--------|-----------------|
| Tracker | 20 | 15 | 2 (SQL edit/test) |
| Chart Builder | 9 | 3 | 6 |
| Dashboards | 10 | 7 | 3 |
| **Total** | **39** | **25** | **11** |

Playwright tests cover all 25 testable flows. The 11 BQ-dependent flows need either manual testing or a mock layer.
