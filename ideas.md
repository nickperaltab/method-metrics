# Ideas

Parking lot for things we've considered but not committed to. Not a roadmap, not a ticket backlog — exploration notes.

When an idea graduates to "we're doing this," move it to `roadmap.md` or file it in `TICKETS.md`.

---

## Competitive Research

### Cube / Lightdash / Metabase — 2026-04-17

Comparison of open-source/commercial semantic-layer + BI tools against method-metrics.

**Cube** — closest architectural match to what we've built.
- Pipeline: NL prompt → LLM → JSON "Cube Query" → validated against semantic layer → SQL → warehouse. Identical to `builder/src/lib/ai.js`.
- Semantic layer in YAML/JS (`cubes/` + `views/`), not a database row.
- Has a dedicated **Meta API** for agent discovery of metrics.
- Has **value search** — LLM can fuzzy-match dimension values before writing filters.
- Has a **Views layer** — facades pre-joining multiple cubes into consumer-facing shapes.
- AI API is Cube Cloud only ($40–80/dev/month). Semantic core is OSS.

**Lightdash** — BI frontend with semantic layer.
- Since 2024, metrics can live in Lightdash YAML without dbt (previously dbt was mandatory).
- Strong git-versioning and governance story.
- No built-in AI chart builder.
- Very explore/dashboard-oriented.

**Metabase** — general-purpose BI.
- Pro/Enterprise has "verified" badges on metrics — same concept as our `verified_at`, but permission-based rather than workflow-based.
- 2025 "Data Studio / Metrics Explorer" is a semantic layer retrofitted onto the BI tool.
- Visual query builder, not code-first.

**Verdict:** don't migrate. Our verification-against-spreadsheet workflow is the moat and none of these have an equivalent. Supabase-as-registry (instead of YAML) is also a real ergonomic advantage for non-engineer editing.

**What's worth stealing** (in priority order):
1. **Value search / dimension value indexing** — precompute `SELECT DISTINCT` per dimension, expose as a tool to Claude so it never guesses filter values
2. **Views layer** — facades that pre-join 2–3 cubes so the AI never has to think about joins; gradually retire `chart_sql`
3. **YAML snapshot to git** — keep Supabase as the edit surface, but emit a YAML snapshot on every metric change for version control and disaster recovery
4. **Formalize the Meta API** — `buildMetricContext()` is already this; make it a versioned, cacheable endpoint so evals can diff catalogs between runs
5. **Expire verifications** — "needs re-verification if view_definition changed" or "verified_at older than N days"

**What's not worth stealing:**
- Cube's full YAML data model (lose inline editing + non-engineer ergonomics)
- Lightdash's dashboard UI (we already have DashboardView.jsx, AI-native)
- Metabase's visual query builder (orthogonal; users want NL prompts)

---

## Ideas to Steal (prioritized)

- **Value search** — biggest accuracy unlock, ~1 day of work
- **Views layer** on top of cubes — retire `chart_sql` gradually
- **YAML git snapshot** of Supabase metric registry — free version control + DR
- **Verification expiry** — mark verifications stale when upstream view SQL changes

## Ideas Considered and Rejected

- **Migrate to Cube Cloud** — would delete ~1,200–1,500 lines of our code and give us battle-tested SQL generation + RLS + caching. But costs $40–80/dev/month, forces YAML for metric definitions, loses inline editing, and has no answer for verification workflow. Verification is the moat; don't trade it.
- **Adopt dbt for metric definitions** (Lightdash-style) — non-engineers can't edit dbt models inline. Supabase-as-registry is deliberate.
