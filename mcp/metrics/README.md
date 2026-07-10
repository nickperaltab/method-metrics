# method-metrics MCP server

Read-only MCP server (stdio locally, streamable HTTP on Vercel) that serves dbt metric definitions from `target/manifest.json`. It is the first consumer of the consolidated definitions described in the design spec: [`docs/superpowers/specs/2026-07-10-metrics-mcp-design.md`](../../docs/superpowers/specs/2026-07-10-metrics-mcp-design.md).

No warehouse connection, no writes, no secrets — it only projects content already in this repo.

## Tools

| Tool | Input | Output |
|---|---|---|
| `list_metrics` | `status?` (e.g. `live`) | Every `v_metric__*` model: name, metric_id, status label, one-line description. Sorted by name. |
| `get_metric` | `metric` — model name (with/without `v_metric__` prefix), metric_id, or fuzzy name | Full definition: description, `meta` block, labels, model path. Unknown names get an error with the 3 closest matches. |
| `get_lineage` | `metric` — same resolution as `get_metric` | Indented dependency tree walked via the manifest `parent_map` down to `sources.*`. Cycle-safe. |
| `get_sql` | `model` — exact model name (any model, intermediates included) | Raw SQL read from the `.sql` file on disk (manifest `raw_code` can be a placeholder and is never served), plus compiled SQL from `target/compiled/` when present, labeled separately. |

## Build & run

```sh
cd mcp/metrics
npm install
npm run build     # tsc → dist/
npm start         # node dist/index.js (stdio transport)
npm test          # vitest
```

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `DBT_MANIFEST_PATH` | `<repo root>/target/manifest.json` | Path to the dbt manifest. |
| `REPO_ROOT` | the actual repo root (`../..` from here) | Base dir for resolving model `.sql` files and the default manifest path. The deployed function points this at its `bundle/` copy. |

The manifest is loaded lazily on the first tool call. On every call the file is re-stat'ed and reloaded if its mtime changed, so a fresh `dbt parse` is picked up without restarting the server. If the file is missing, tools return: `manifest not found at <path> — run 'dbt parse' in the repo root`.

## Registration

Registered in the repo's `.mcp.json` as `metrics` (`node mcp/metrics/dist/index.js`). Run `npm install && npm run build` here once before first use.

## Remote endpoint

The same 4 tools are deployed as a remote streamable-HTTP MCP server on Vercel:

```
https://method-metrics-mcp.vercel.app/api/mcp
```

- **Transport:** streamable HTTP only (SSE is disabled — no Redis).
- **Auth:** none. The endpoint is intentionally unauthenticated: it serves only metric definitions and model SQL that are already public in this public repo. Read-only, no warehouse connection, no secrets.
- **How it works:** `api/mcp.ts` wraps the same `registerTools()` used by the stdio entry point with Vercel's [`mcp-handler`](https://github.com/vercel/mcp-handler) adapter. The deployed function can't read `../../target/manifest.json` at runtime, so `npm run prepare-deploy` copies the manifest plus all model `.sql` files (raw and compiled) into `bundle/`, and the function defaults `DBT_MANIFEST_PATH`/`REPO_ROOT` to that bundle. `bundle/` is generated, gitignored, and deliberately not `.vercelignore`d.

**Redeploy** (from `mcp/metrics/`, after a fresh `dbt parse` if definitions changed):

```sh
npm run prepare-deploy && vercel deploy --prod
```

Smoke test:

```sh
curl -sS -X POST https://method-metrics-mcp.vercel.app/api/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
