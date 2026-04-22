# 2026-04-21 — metrics RLS SELECT opened to all

Follows the earlier `2026-04-21-metrics-rls.md`. Paul (CEO, newly auto-created as viewer then promoted to admin) saw "No data" on the Customers scorecard because metrics 373–377 were `status='queued'` — the prior SELECT policy (`status='live' or is_admin_request()`) also hid them from other pages (scorecards, chart builder, dashboards), not just the Registry.

## Change

```sql
drop policy if exists metrics_select_live_or_admin on public.metrics;

create policy metrics_select_all
  on public.metrics
  for select
  to anon, authenticated
  using (true);
```

## Why

The status field is a lifecycle signal for metric *editing* (queued → live), not a privacy boundary. Every consumer of the metrics table (scorecards, chart builder, dashboard rendering) needs all definitions regardless of status. Filtering by status belongs in the Registry UI (which already hides the Queued tab for non-admins via client-side role check).

## What stayed admin-only

- `metrics_insert_admin` — INSERT requires admin
- `metrics_update_admin` — UPDATE requires admin (protects against non-admin edits/status changes)
- `metrics_delete_admin` — DELETE requires admin
- `publish_scorecard_snapshot()` RPC — service-role only

## Rollback

```sql
drop policy if exists metrics_select_all on public.metrics;

create policy metrics_select_live_or_admin
  on public.metrics
  for select
  to anon, authenticated
  using (status = 'live' or public.is_admin_request());
```
