# Method Metrics — Status

**Last updated:** 2026-04-01

## Current state

App is live on GitHub Pages: https://nickperaltab.github.io/method-metrics/builder/

Ownership model (#36) fully shipped. UX overhaul in progress — All Charts and All Dashboards are now unified pages with chip filters, search, and sortable columns. Chart builder integration working (save, add to dashboard, colors/labels apply correctly).

## What was done today (2026-04-01)

- Replaced all native browser dialogs with custom Dialog component (green confirm, red danger, JetBrains Mono)
- Removed edit mode from dashboards — owners always edit, non-owners see read-only with owner attribution
- Added star, delete, approve to dashboard view header
- Blank canvas empty state with "Add Existing Charts" / "Create New Chart from Scratch"
- Rebuilt chart picker modal: 860px, search, metric chips (multi-select), description, dashboard counts, owner chips
- Unified **All Dashboards**: one list, chip filters (All/Mine/Approved), search, sortable columns, inline approve badge
- Unified **All Charts**: same pattern + metric chips, edit button → chart builder, inline description editing
- Sidebar consolidated: one "All Dashboards" list, "All Charts" link
- Fixed: chart not rendering after add/remove (was wiping caches via full reload)
- Fixed: saved charts not in My Charts (ChatExplorer missing created_by_user)
- Fixed: dashboard colors not applying (gw_spec colors/showLabels not passed to buildEChartsOption)
- Fixed: duplicate dashboard creation (Enter key bubbling in Dialog)
- Added recently viewed tracking (recordView on dashboard load)
- Added auto-suggested chart names (Metric - Time Frame - Dimension)
- Moved approval toggle inline next to name (clickable badge, no separate column)

## What Nic needs to do

1. **Fix Syncs metric** — Sync Count chart has metric_ids pointing to Trials, not Syncs
2. **Chart builder edit experience** — clicking into a saved chart should load the conversation history
3. **Chart descriptions** — populate descriptions on existing charts (search depends on this)

## What's next for Justin

- QA the unified All Dashboards and All Charts pages
- QA recently viewed on Home (should now populate as you visit dashboards)
- Review chart naming convention (auto-suggested on save)

## Key architecture (for Nic)

- **No edit mode**: DashboardView is always editable for owners. `isDraggable={isMine}`, `isResizable={isMine}`. Layout auto-saves on drag/resize stop.
- **Dialog component**: `builder/src/components/Dialog.jsx` — never use window.prompt/confirm.
- **Ownership**: `created_by_user` UUID on charts and dashboards. `canDelete(user, item)` and `isAdmin(user)` in `lib/permissions.js`.
- **Chart save must include `createdByUser: currentUser?.id`** — both ChatExplorer and Explorer now do this.
- **Chart colors**: `gw_spec` stores `colors` and `showLabels` at top level. DashboardView now passes them to `buildEChartsOption`.
- **Metric ID types**: Always use `Number()` when comparing `metric_ids` from charts with metric catalog IDs.

## Deployment

GitHub Pages only. Auto-deploys on push to main via GitHub Actions.

## Remaining tickets

- **#24** — Graduate 13 verified metrics. Blocked on Justin.
- **#36** — Ownership model. Shipped.
- Vector/semantic search — future, once chart descriptions exist.
