# 2026-04-20 — scorecard_snapshots

Applied via Supabase MCP. SQL lives in `docs/superpowers/plans/2026-04-20-scorecard-snapshot-cache.md` Task 1.

Objects created:
- table: `public.scorecard_snapshots`
- indexes: `scorecard_snapshots_published_uniq` (unique partial on `scorecard_id` where `status='published'`), `scorecard_snapshots_scorecard_status_idx`
- policy: `read_published` (SELECT anon/authenticated where `status='published'`)
- function: `public.publish_scorecard_snapshot(uuid, jsonb)` — atomic supersede+publish in a single transaction

Status lifecycle: `building` → `published` → `superseded`. Failed runs: `building` → `failed`.
