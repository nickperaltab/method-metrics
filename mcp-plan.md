# Method Metrics MCP — Technical Plan

**Goal:** Let Claude Desktop answer metric questions against live BQ data through a constrained, read-only interface. No SQL exposure to users. No access to raw tables.

## Decisions

| Question | Choice | Reason |
|---|---|---|
| Client | Claude Desktop | User target |
| Transport | **Remote (SSE) via Supabase Edge Function** | Matches existing `ai-chart` edge-function pattern. One deploy, everyone connects. No local install per user. |
| Auth | **Shared service account** (BQ read-only) + **per-user bearer token** on the MCP endpoint | Per-user OAuth ruled out. One token per user = usage attribution + individual revocation without disrupting others. |
| Permissions | Read-only | Confirmed |

## Architecture

```
Claude Desktop
   │  (MCP over SSE + bearer token)
   ▼
Supabase Edge Function (mcp-metrics)
   ├─► Supabase REST (metrics catalog — anon key, same as app)
   └─► BigQuery REST (service account — read-only, dataViewer on revenue)
```

BQ service account (`mcp-reader@...`) has `dataViewer` on the `revenue` dataset.
The **MCP tool surface is the security boundary** — no tool ever references raw tables or runs free-form SQL. All queries are parameterized from the metric catalog.
Authorized-view isolation considered and rejected for v1 (overkill for trusted 2-3 person pilot); upgrade path documented in "When to harden" below.

## Tools Exposed

1. `list_metrics(status?, group?, search?)`
   Returns: `[{id, name, description, group, formula}]`
   Source: Supabase `metrics` table, `status='live'` by default.

2. `get_metric(id)`
   Returns: full metric def — view, formula, available dimensions, date column, example values.
   Source: Supabase.

3. `query_metric(id, time_range, grain?, group_by?, filters?)`
   Returns: `[{period, value, ...}]` rows.
   Implementation: reuse `buildSemanticSql` from `builder/src/lib/`. Hard cap `maximumBytesBilled=1GB`. Row limit 10k.

4. `list_dimensions(id)`
   Returns: available breakdowns for that metric.
   Source: metric's `semantic_dimensions` field.

5. `list_dashboards()`
   Returns: `[{id, title, description, group}]` — Sales, Marketing, Customers, Funnel, etc.
   Source: `builder/src/config/scorecards/` (ported to shared config).

6. `get_dashboard(id)`
   Returns: full scorecard — sections, KPIs with current values, charts with data.
   Runs all underlying `query_metric` calls server-side and assembles the response.

7. `query_chart(spec)` *(optional, phase 2)*
   Returns: chart-ready series + ECharts option JSON.

## Guardrails

- **BQ:** `maximumBytesBilled=1_000_000_000` on every query. Service account = `dataViewer` on `revenue` dataset only.
- **Row limit:** 10,000 rows per response. Cursor for more.
- **Rate limit:** 60 req/min per bearer token (Edge Function middleware).
- **Job labels:** `mcp=true, token_id=<hash>` on every BQ job → cost attribution.
- **Logging:** every tool call → Supabase `mcp_audit` table (tool, args, token_id, bytes_billed, duration).
- **BQ Data Access audit logs** enabled on `revenue` dataset (catches any access pattern).
- **Error sanitization:** never echo raw BQ errors to the client — prompt injection can use table/column names leaked in errors to escalate. Return generic "metric unavailable"; log full error server-side.
- **SA key management:** stored in Supabase Edge Function secrets (encrypted at rest). Rotation cadence: every 90 days. Revocation runbook documented.

## When to Harden Beyond v1

Upgrade to authorized views / per-view GRANTs when any of these becomes true:
- MCP exposed to untrusted consumers (external LLMs, contractors, customers)
- PII lands in the dataset
- Any write tools are added
- SA credential ever leaks (incident response)

## Observability — PostHog

Use PostHog for product analytics; keep `mcp_audit` for cost/compliance truth. Complementary.

**Events fired from the Edge Function:**

| Event | Properties |
|---|---|
| `mcp_tool_called` | tool, latency_ms, bytes_billed, success, token_id, metric_id?, time_range? |
| `mcp_tool_errored` | tool, error_code, error_message, token_id |
| `mcp_session_started` | token_id, client (Claude Desktop) |

**Dashboards to build:**
- Tool adoption: calls per tool per week
- Error rate by tool
- Top metrics queried
- Latency p50 / p95 per tool
- Users (by `token_id`) active last 7/30 days

Use `token_id` as the PostHog `distinct_id` so we get cohorts without attaching real identities. SDK: `posthog-node` (Deno-compatible via npm:).

## Phased Delivery (~5-6 days)

### Day 0 — Setup (0.5 day)
- Create `mcp-reader` service account in GCP
- Grant it `bigquery.dataViewer` + `bigquery.jobUser` on the `revenue` dataset
- Enable BQ Data Access audit logs on `revenue`
- Create SA key, store in Supabase Edge Function secret `MCP_BQ_SA_KEY`
- Create `mcp_tokens` table in Supabase: `{id, user_email, token_hash, created_at, revoked_at}`
- Generate one token per pilot user, store hashed; share the plaintext via 1Password

### Day 1 — Skeleton (1 day)
- New edge function `supabase/functions/mcp-metrics/`
- MCP SDK (TypeScript, Deno-compatible)
- SSE transport + bearer-token middleware
- Health-check tool

### Day 2-3 — Core tools (2 days)
- Port `fetchMetrics` / semantic SQL builder from `builder/src/lib/` to Deno
- Implement `list_metrics`, `get_metric`, `query_metric`, `list_dimensions`
- Port scorecard configs from `builder/src/config/scorecards/`; implement `list_dashboards`, `get_dashboard`
- `mcp_audit` table + logging middleware
- PostHog SDK + event firing (`mcp_tool_called`, `mcp_tool_errored`)

### Day 4 — Eval (1 day)
- Port chart-builder eval suite
- Adversarial tests: raw-table names, PII fields, all-time queries, nonexistent metrics
- Target: 95% pass rate before shipping

### Day 5 — Ship (0.5 day)
- Internal docs: "add this to Claude Desktop config"
- Nightly CI: run `query_metric` on every live metric, alert on failures
- Pilot with 2-3 users

## What Updates Itself vs. What Requires a Deploy

**Self-updating** (no code changes):
- New metric added to Supabase → `list_metrics` sees it instantly
- BQ view SQL changes → `query_metric` uses new SQL on next call
- Formula/dimension changes in Supabase → live

**Requires MCP deploy:**
- New tool (e.g., CSV export)
- New guardrail (e.g., PII detection)
- SDK upgrades

## Risk Register

| Risk | Mitigation |
|---|---|
| Column renamed in BQ view → silent metric failure | Nightly CI that calls `query_metric` on every live metric |
| Bearer token leaked | Store hashed, short-lived (90d), one-token-per-user so rotation is scoped |
| Claude writes bad filters → expensive query | `maximumBytesBilled` hard cap + row limit |
| Someone adds raw-table access to SA "for convenience" | SA locked via Terraform or documented IAM policy; CI check that SA permissions haven't drifted |

## Open Questions

*(All resolved — ready to build.)*
