# Net SaaS Drilldown — Phase 1: Data Layer Validation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three data models the Net SaaS drilldown dashboard depends on (`int_customer_mrr`, `int_mrr_movement_decomposed`, `int_customer_mrr_lines`) trustworthy enough to ship a dashboard against. Migrate the orphaned `int_customer_mrr` BQ view into dbt with parity, validate the two DRAFT decomposition models against their stated invariants and against the migrated `int_customer_mrr`, then promote all three from DRAFT to verified.

**Architecture:** Snapshot-then-parity workflow throughout. For each change: capture current output → make the change → re-query → diff row-by-row. Validation lives in Python parity scripts under `scripts/` (matching repo convention — `parity_v_channel_arr.py` is the existing exemplar). dbt models land under `models/intermediate/` with column-level docs in adjacent `_*.yml` files. No new dbt unit-test framework introduced; we use schema-level generic tests (`not_null`, `unique`, `accepted_values`) plus Python reconciliation scripts.

**Tech Stack:** dbt-bigquery (existing), Python 3 with `google-cloud-bigquery` (existing pattern in `scripts/`), BigQuery views, JSON snapshots under `scripts/audit/`.

**Companion design doc:** `docs/superpowers/specs/2026-06-03-net-saas-drilldown-dashboard-design.md`

**Gate for Phase 2 (UI plan):** all tasks in this plan committed, all parity scripts passing, `_mrr_decomposition.yml` flipped from DRAFT to validated, `int_customer_mrr` materialized as a dbt model in `revenue` schema and the orphaned view dropped.

---

## Schema Reality (discovered during Task 1 — replaces earlier assumptions in this doc)

The orphaned `int_customer_mrr` view's actual schema differs from the early draft of this plan. **All subsequent tasks should use these names.** Where the plan body still shows snake_case names, treat them as legacy text and use the names below.

**Actual columns** (17 total, native grain = one row per Month × EntityRecordID):

| Column | Type | Notes |
|---|---|---|
| `Month` | DATE | First day of the month |
| `EntityRecordID` | INTEGER | Stable customer ID (use for joins) |
| `Company` | STRING | Display name (drifts when renamed; don't use as key) |
| `p1_saas` | NUMERIC | Prior month's SaaS total |
| `p2_saas` | NUMERIC | Current month's SaaS total (canonical customer-month MRR) |
| `StartMRR` | NUMERIC | Start-of-month MRR |
| `Cancellations` | NUMERIC | Cancellation MRR (positive value) |
| `Downgrades` | NUMERIC | Downgrade MRR (positive value) |
| `Expansions` | NUMERIC | Expansion MRR (positive value) |
| `NewMRR` | NUMERIC | New MRR (positive value) |
| `Segment`, `UserTier`, `HasDEP`, `AttributionChannel`, `SignupCountry`, `Vertical`, `SyncType` | STRING / BOOL | Customer dim attributes |

**Key facts that change downstream tasks:**

1. **No `movement_kind` dimension exists.** Movements are *parallel columns* (NewMRR, Expansions, Downgrades, Cancellations). A customer-month with all four = 0 is a flat/no-movement row.
2. **No `end_mrr` column.** The closest equivalent is `p2_saas` (current-month SaaS total). For the lines-rollup parity in Task 10, `int_customer_mrr_lines.saas` should sum to **`p2_saas`** at the customer-month level.
3. **Grain is already customer-month** — no `GROUP BY` needed in the snapshot or parity SQL.
4. **PascalCase, not snake_case** — column-name references in code must match the view exactly.

### KNOWN ISSUE (discovered Task 5): non-deterministic dimension attribution

The MRR math in `int_customer_mrr` is bit-identical between the legacy orphaned view and the dbt port (0 numeric mismatches across 87,923 customer-months). **However**, dimension attributes (`Vertical`, `AttributionChannel`, `SyncType`) drift for ~12 entities (~57–194 customer-month cells depending on run).

**Root cause:** the final `LEFT JOIN` against upstream `int_customers` is non-deterministic — `int_customers` has duplicate rows per `(EntityRecordID, Month)` for those entities, and the join has no tiebreaker (`ORDER BY ... LIMIT 1` or `QUALIFY`). Each query execution may pick a different duplicate row. This non-determinism exists in BOTH the legacy view and the faithful dbt port; it is an upstream `int_customers` data-quality issue, not a migration defect.

**Decision (2026-06-03):** Accepted as a tracked known issue. It does NOT gate migration parity (the parity script gates on numeric columns only and reports dim drift as a warning). Impact on the dashboard: drill-by-channel / drill-by-segment / drill-by-vertical may show ~12 customers flickering between labels run-to-run — a tiny share of accounts, footnote-level. To be fixed by deduplicating `int_customers` (add a deterministic tiebreaker) in a future phase. Tracked via a spawned follow-up task.

Task-by-task impact:
- **Task 5** (parity script) — key is `(Month, EntityRecordID)`, not `(month, entity_record_id, movement_kind)`. Compare all 6 numeric columns: `StartMRR, Cancellations, Downgrades, Expansions, NewMRR, p1_saas, p2_saas` (+ string compare for dims if desired).
- **Task 9** (reconciliation) — instead of grouping by `movement_kind`, aggregate `int_customer_mrr` by `(Month)` summing each parallel column, and compare to the decomposition model's aggregates per `movement_kind`. The decomposed model DOES have a `movement_kind` column; `int_customer_mrr` does not. So the join is on Month only, and the comparison is column-by-kind.
- **Task 10** (lines rollup) — `int_customer_mrr_lines.saas` per `(month, entity_record_id)` should equal `int_customer_mrr.p2_saas` per `(Month, EntityRecordID)`. Mind the case mismatch in column names between the two models.
- **Task 11** (schema tests) — the schema doc columns must use the PascalCase names above. There's no `movement_kind` `accepted_values` test on `int_customer_mrr` (column doesn't exist). The decomposition models DO have `movement_kind` — that's where the `accepted_values` test belongs.

---

## File Structure

**New files (created in this plan):**

- `scripts/snapshot_int_customer_mrr.py` — captures pre/post snapshots of `int_customer_mrr` keyed by (month, entity_record_id), writes to `scripts/audit/`. Reusable for the migration.
- `scripts/audit/snapshot-int-customer-mrr-pre-migration.json` — pre-migration snapshot (output)
- `scripts/audit/snapshot-int-customer-mrr-post-migration.json` — post-migration snapshot (output)
- `scripts/parity_int_customer_mrr.py` — diffs pre vs post snapshots row-by-row, fails non-zero on any mismatch beyond float tolerance.
- `scripts/parity_mrr_decomposition_identity.py` — verifies the identity `seat_mrr + app_mrr + price_mrr == p2_saas - p1_saas` per (month, entity_record_id) within float tolerance.
- `scripts/parity_mrr_decomposition_vs_customer_mrr.py` — aggregates `int_mrr_movement_decomposed` by (month, movement_kind), compares against `int_customer_mrr` movement totals.
- `scripts/parity_customer_mrr_lines.py` — sums `int_customer_mrr_lines.saas` per (month, entity_record_id), compares against `int_customer_mrr.saas` (or equivalent column).
- `models/intermediate/int_customer_mrr.sql` — ports the orphaned BQ view definition into a dbt model.
- `models/intermediate/_int_customer_mrr.yml` — schema docs for the migrated model.
- `docs/metric-definitions/net-saas-movement-decomposition.md` — definition entry per CLAUDE.md rule ("Define every metric before flipping it `live`").

**Modified files:**

- `models/_sources.yml` — remove `int_customer_mrr` from `sources:` (it becomes a model, not a source).
- `models/intermediate/_mrr_decomposition.yml` — add column descriptions, add schema tests, flip header from DRAFT to validated, add validation evidence section.
- `models/intermediate/int_mrr_movement_decomposed.sql` — any references to `source('revenue', 'int_customer_mrr')` switch to `ref('int_customer_mrr')`.
- `models/intermediate/int_customer_mrr_lines.sql` — same ref switch if applicable.
- `CLAUDE.md` — update the "MRR Movement Decomposition" memory ref or its target file to note validation complete.

---

## Task 1: Reusable snapshot script for `int_customer_mrr`

**Files:**
- Create: `scripts/snapshot_int_customer_mrr.py`

The migration needs pre/post snapshots. Build the snapshot tool first so it's reusable: pre-migration run hits the orphaned view, post-migration run hits the dbt model. Same script, different `--source` flag.

- [ ] **Step 1: Look at existing snapshot pattern**

Read `scripts/parity_v_channel_arr.py` and `scripts/revenue_arch_snapshot.py` to understand auth / client setup pattern. Use the same `from google.cloud import bigquery` + service account or ADC pattern they use.

- [ ] **Step 2: Write the snapshot script**

```python
# scripts/snapshot_int_customer_mrr.py
"""Snapshot int_customer_mrr to JSON for pre/post migration parity.

Usage:
    python scripts/snapshot_int_customer_mrr.py --source view --out scripts/audit/snapshot-int-customer-mrr-pre-migration.json
    python scripts/snapshot_int_customer_mrr.py --source model --out scripts/audit/snapshot-int-customer-mrr-post-migration.json

--source view  -> queries project-for-method-dw.revenue.int_customer_mrr (the orphaned view)
--source model -> queries the same fully qualified name (after migration, it's the dbt model)
                  Both point at the same BQ object; the flag is documentation, not routing.
"""
import argparse
import json
import sys
from decimal import Decimal
from google.cloud import bigquery

PROJECT = "project-for-method-dw"
DATASET = "revenue"
TABLE = "int_customer_mrr"
TRAILING_MONTHS = 24

SQL = f"""
SELECT
  FORMAT_DATE('%Y-%m-01', month) AS month,
  CAST(entity_record_id AS STRING) AS entity_record_id,
  movement_kind,
  ROUND(SUM(start_mrr), 4) AS start_mrr,
  ROUND(SUM(end_mrr), 4) AS end_mrr,
  ROUND(SUM(new_mrr), 4) AS new_mrr,
  ROUND(SUM(expansion_mrr), 4) AS expansion_mrr,
  ROUND(SUM(downgrade_mrr), 4) AS downgrade_mrr,
  ROUND(SUM(cancellation_mrr), 4) AS cancellation_mrr,
  COUNT(*) AS row_count
FROM `{PROJECT}.{DATASET}.{TABLE}`
WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL {TRAILING_MONTHS} MONTH)
  AND month < DATE_TRUNC(CURRENT_DATE(), MONTH)
GROUP BY month, entity_record_id, movement_kind
ORDER BY month, entity_record_id, movement_kind
"""

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["view", "model"], required=True,
                        help="Documentation only; both query the same FQN")
    parser.add_argument("--out", required=True, help="Output JSON path")
    args = parser.parse_args()

    client = bigquery.Client(project=PROJECT)
    rows = list(client.query(SQL).result())
    out = [dict(r.items()) for r in rows]
    # Convert any Decimal/Date types to JSON-safe
    for r in out:
        for k, v in r.items():
            if isinstance(v, Decimal):
                r[k] = float(v)
    with open(args.out, "w") as f:
        json.dump({"source": args.source, "row_count": len(out), "rows": out}, f, indent=2)
    print(f"Snapshot written: {args.out} ({len(out)} rows)")

if __name__ == "__main__":
    main()
```

**IMPORTANT — column-name assumption:** the SQL above assumes column names `month`, `entity_record_id`, `movement_kind`, `start_mrr`, `end_mrr`, `new_mrr`, `expansion_mrr`, `downgrade_mrr`, `cancellation_mrr`. If the actual orphaned view uses different names (e.g. `StartMRR` mixed-case, or `Cancellations` vs `cancellation_mrr`), inspect first via:

```bash
bq show --format=prettyjson project-for-method-dw:revenue.int_customer_mrr | jq '.schema.fields[] | .name'
```

and update the SQL before running. The Step 3 run will surface mismatches as errors — fix and re-run if so.

- [ ] **Step 3: Run the snapshot against the current orphaned view**

```bash
cd /Users/nicolas/Desktop/method-metrics
python scripts/snapshot_int_customer_mrr.py --source view --out scripts/audit/snapshot-int-customer-mrr-pre-migration.json
```

Expected: `Snapshot written: scripts/audit/snapshot-int-customer-mrr-pre-migration.json (N rows)` where N is in the tens of thousands (24 months × thousands of customers × multiple movement_kinds).

- [ ] **Step 4: Sanity-check the snapshot**

```bash
jq '.row_count' scripts/audit/snapshot-int-customer-mrr-pre-migration.json
jq '.rows[0]' scripts/audit/snapshot-int-customer-mrr-pre-migration.json
jq '[.rows[].movement_kind] | unique' scripts/audit/snapshot-int-customer-mrr-pre-migration.json
```

Expected: row_count > 0, first row has all 9 declared fields, unique movement_kind values are a small set (e.g. `["cancellation","downgrade","expansion","flat","new"]`).

- [ ] **Step 5: Commit**

```bash
git add scripts/snapshot_int_customer_mrr.py scripts/audit/snapshot-int-customer-mrr-pre-migration.json
git commit -m "feat(validation): snapshot int_customer_mrr pre-migration baseline"
```

---

## Task 2: Capture the orphaned view's DDL

**Files:**
- Create: `knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql` (reference copy of what we're porting)

We need the canonical SQL of the orphaned view to port. It's not in the repo (it was authored outside dbt). Pull it from BQ INFORMATION_SCHEMA.

- [ ] **Step 1: Pull the view DDL from BQ**

```bash
bq query --use_legacy_sql=false --format=prettyjson "
  SELECT view_definition
  FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEWS\`
  WHERE table_name = 'int_customer_mrr'
" | jq -r '.[0].view_definition' > /tmp/int_customer_mrr_ddl.sql
```

Expected: non-empty file containing a `SELECT ... FROM ...` body (BQ INFORMATION_SCHEMA.VIEWS returns just the body, not `CREATE VIEW`).

- [ ] **Step 2: Save a reference copy**

```bash
cp /tmp/int_customer_mrr_ddl.sql knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql
```

Add a header comment manually identifying when it was captured and from where:

```sql
-- Pre-migration DDL snapshot of project-for-method-dw.revenue.int_customer_mrr
-- Captured: 2026-06-03
-- Reason: orphaned BQ view (built outside dbt; owner left). Used as source-of-truth
-- text when porting to models/intermediate/int_customer_mrr.sql.
-- Do not edit this file — it's a historical capture.

-- [original DDL below]
[paste the contents of /tmp/int_customer_mrr_ddl.sql here]
```

- [ ] **Step 3: Commit**

```bash
git add knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql
git commit -m "docs(validation): capture orphaned int_customer_mrr DDL for porting"
```

---

## Task 3: Port the orphaned view into a dbt model

**Files:**
- Create: `models/intermediate/int_customer_mrr.sql`
- Modify: `models/_sources.yml:37-41` (remove `int_customer_mrr` source entry)

- [ ] **Step 1: Create the dbt model**

```sql
-- models/intermediate/int_customer_mrr.sql
--
-- Migrated from the orphaned BQ view of the same name.
-- Original DDL captured in knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql.
-- Parity-verified via scripts/parity_int_customer_mrr.py.
--
-- Methodology: CEO-confirmed symmetric Prepay Expiry exclusion (2026-04-28).
-- See memory: project_annual_retention.

{{ config(materialized='view') }}

[paste the body of knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql,
 replacing any hardcoded `project-for-method-dw.revenue.<source_table>` references
 with `{{ source('revenue', '<source_table>') }}` calls]
```

**Replacement rule:** every `project-for-method-dw.revenue.X` where X is a non-model source (TransLineFlattened, Account, Funnel, method_forecast, etc.) becomes `{{ source('revenue', 'X') }}`. Cross-reference against `models/_sources.yml` to confirm each is already declared as a source; declare any missing ones in that file.

- [ ] **Step 2: Remove `int_customer_mrr` from sources**

Open `models/_sources.yml` and delete the entry that declares `int_customer_mrr` as a source (around lines 37-41 per research). It's a model now, not a source.

- [ ] **Step 3: Compile to check syntax**

```bash
cd /Users/nicolas/Desktop/method-metrics
dbt compile --select int_customer_mrr
```

Expected: `Done. PASS=1 WARN=0 ERROR=0 SKIP=0 TOTAL=1` and a compiled SQL file at `target/compiled/.../int_customer_mrr.sql`. If compile fails on missing `source()` declarations, add them to `_sources.yml` and re-run.

- [ ] **Step 4: Inspect the compiled SQL**

```bash
cat target/compiled/method_metrics/models/intermediate/int_customer_mrr.sql | head -50
```

Confirm `source()` macros expanded to `project-for-method-dw.revenue.X` references.

- [ ] **Step 5: Commit**

```bash
git add models/intermediate/int_customer_mrr.sql models/_sources.yml
git commit -m "feat(validation): port int_customer_mrr from orphaned view to dbt model"
```

---

## Task 4: Build the dbt model into a non-prod schema, snapshot it

**Files:**
- Create: `scripts/audit/snapshot-int-customer-mrr-dbtdev.json`

Build into a dev/staging schema (NOT replacing the prod view yet) and snapshot from there. This lets us parity-check before touching prod.

- [ ] **Step 1: Run dbt against a dev schema**

```bash
cd /Users/nicolas/Desktop/method-metrics
dbt run --select int_customer_mrr --target dev
```

Expected: `Completed successfully` with one model created at `project-for-method-dw.revenue_dev_<user>.int_customer_mrr` (or whatever the dev schema convention is — check `profiles.yml` if uncertain).

- [ ] **Step 2: Snapshot the dev model**

Temporarily modify `scripts/snapshot_int_customer_mrr.py` to accept a `--fqn` override flag, OR run a one-off SQL via `bq query` against the dev FQN. Quickest:

```bash
DEV_FQN=$(dbt run-operation get_target_fqn --args "{model: int_customer_mrr}" 2>/dev/null || echo "project-for-method-dw.revenue_dev_nicolas.int_customer_mrr")
echo "Dev FQN: $DEV_FQN"

# Then a quick SQL snapshot, mirroring the snapshot script's query but against DEV_FQN:
python -c "
import json
from google.cloud import bigquery
from decimal import Decimal
client = bigquery.Client(project='project-for-method-dw')
sql = open('scripts/snapshot_int_customer_mrr.py').read().split('SQL = f\"\"\"')[1].split('\"\"\"')[0]
sql = sql.replace('project-for-method-dw.revenue.int_customer_mrr', '$DEV_FQN')
rows = [dict(r.items()) for r in client.query(sql).result()]
for r in rows:
    for k,v in r.items():
        if isinstance(v, Decimal): r[k]=float(v)
with open('scripts/audit/snapshot-int-customer-mrr-dbtdev.json','w') as f:
    json.dump({'source':'dbt-dev','row_count':len(rows),'rows':rows}, f, indent=2)
print(f'Dev snapshot: {len(rows)} rows')
"
```

If that's too fragile, just add a `--fqn` arg to `snapshot_int_customer_mrr.py` and re-run cleanly. (Probably worth doing — recommended.)

Expected: `Dev snapshot: N rows` where N matches (within a small delta) the pre-migration snapshot row count.

- [ ] **Step 3: Commit the dev snapshot**

```bash
git add scripts/audit/snapshot-int-customer-mrr-dbtdev.json
git commit -m "chore(validation): snapshot dbt-dev int_customer_mrr"
```

---

## Task 5: Parity script — pre-migration view vs dbt-dev model

**Files:**
- Create: `scripts/parity_int_customer_mrr.py`

- [ ] **Step 1: Write the parity script**

```python
# scripts/parity_int_customer_mrr.py
"""Row-by-row diff of int_customer_mrr snapshots.

Loads two snapshots (pre = orphaned view, post = dbt model) and compares row by row
on the (month, entity_record_id, movement_kind) key. Reports any rows that:
  - Exist in one but not the other
  - Have a numeric column differing by more than TOLERANCE

Exit code: 0 if identical within tolerance, 1 if any mismatch.

Usage:
    python scripts/parity_int_customer_mrr.py \\
        --pre scripts/audit/snapshot-int-customer-mrr-pre-migration.json \\
        --post scripts/audit/snapshot-int-customer-mrr-dbtdev.json
"""
import argparse
import json
import sys

TOLERANCE = 0.01  # cents-level tolerance on MRR sums

NUMERIC_COLS = ["start_mrr", "end_mrr", "new_mrr", "expansion_mrr",
                "downgrade_mrr", "cancellation_mrr", "row_count"]

def key(row):
    return (row["month"], row["entity_record_id"], row["movement_kind"])

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--pre", required=True)
    p.add_argument("--post", required=True)
    args = p.parse_args()

    pre = {key(r): r for r in json.load(open(args.pre))["rows"]}
    post = {key(r): r for r in json.load(open(args.post))["rows"]}

    only_pre = set(pre) - set(post)
    only_post = set(post) - set(pre)
    common = set(pre) & set(post)

    mismatches = []
    for k in common:
        for col in NUMERIC_COLS:
            v_pre = pre[k].get(col, 0) or 0
            v_post = post[k].get(col, 0) or 0
            if abs(v_pre - v_post) > TOLERANCE:
                mismatches.append((k, col, v_pre, v_post))

    print(f"Pre rows:  {len(pre):,}")
    print(f"Post rows: {len(post):,}")
    print(f"Only in pre:  {len(only_pre):,}")
    print(f"Only in post: {len(only_post):,}")
    print(f"Common:        {len(common):,}")
    print(f"Mismatches > {TOLERANCE}: {len(mismatches):,}")

    if only_pre or only_post or mismatches:
        print("\nSample mismatches:")
        for m in mismatches[:10]:
            print(f"  {m[0]} | {m[1]}: pre={m[2]} post={m[3]} (Δ={m[2]-m[3]:.4f})")
        for k in list(only_pre)[:5]:
            print(f"  ONLY PRE:  {k}")
        for k in list(only_post)[:5]:
            print(f"  ONLY POST: {k}")
        sys.exit(1)

    print("\n✓ Parity: identical within tolerance")
    sys.exit(0)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run parity check**

```bash
python scripts/parity_int_customer_mrr.py \
    --pre scripts/audit/snapshot-int-customer-mrr-pre-migration.json \
    --post scripts/audit/snapshot-int-customer-mrr-dbtdev.json
```

Expected: exit 0, last line `✓ Parity: identical within tolerance`. If exit 1, **STOP** and investigate before promoting to prod. Common causes: type mismatch (Date vs Timestamp), filter drift (the dbt port has a slightly different WHERE clause), null handling diff. Read the mismatches; fix `int_customer_mrr.sql`; re-run from Task 4 Step 1.

- [ ] **Step 3: Commit the parity script**

```bash
git add scripts/parity_int_customer_mrr.py
git commit -m "test(validation): parity script for int_customer_mrr migration"
```

---

## Task 6: Promote dbt model to prod schema, replace orphaned view

**Files:**
- Modify: `models/intermediate/int_customer_mrr.sql` (no change to content, just promote target)

- [ ] **Step 1: Drop the orphaned view**

```bash
bq rm -f -t project-for-method-dw:revenue.int_customer_mrr
```

Expected: `Table 'project-for-method-dw:revenue.int_customer_mrr' deleted.`

This is destructive but necessary: dbt will refuse to create a view where a non-dbt object already exists. We've already proven parity; the dev snapshot is our safety net (we can recreate from the captured DDL in `knowledge/verified-queries/` if anything goes sideways).

- [ ] **Step 2: Run dbt against prod**

```bash
dbt run --select int_customer_mrr --target prod
```

Expected: `Completed successfully`. View now lives at `project-for-method-dw.revenue.int_customer_mrr` as a dbt-managed view.

- [ ] **Step 3: Snapshot the prod model**

```bash
python scripts/snapshot_int_customer_mrr.py --source model --out scripts/audit/snapshot-int-customer-mrr-post-migration.json
```

- [ ] **Step 4: Final parity check, prod model vs original view snapshot**

```bash
python scripts/parity_int_customer_mrr.py \
    --pre scripts/audit/snapshot-int-customer-mrr-pre-migration.json \
    --post scripts/audit/snapshot-int-customer-mrr-post-migration.json
```

Expected: exit 0. If it fails after dev parity passed, something env-specific broke (dev/prod schema config drift). Don't move on until this passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/audit/snapshot-int-customer-mrr-post-migration.json
git commit -m "feat(validation): promote int_customer_mrr to prod dbt model, parity confirmed"
```

---

## Task 7: Switch decomposition models to `ref()` instead of source

**Files:**
- Modify: `models/intermediate/int_mrr_movement_decomposed.sql`
- Modify: `models/intermediate/int_customer_mrr_lines.sql`

Now that `int_customer_mrr` is a dbt model, downstream references should use `ref()` not `source()`. This builds the DAG correctly so dbt knows to build it first.

- [ ] **Step 1: Grep for current references**

```bash
grep -n "int_customer_mrr" models/intermediate/int_mrr_movement_decomposed.sql models/intermediate/int_customer_mrr_lines.sql
```

- [ ] **Step 2: Replace source('revenue', 'int_customer_mrr') with ref('int_customer_mrr')**

In each file, find `{{ source('revenue', 'int_customer_mrr') }}` (or hardcoded `project-for-method-dw.revenue.int_customer_mrr`) and replace with `{{ ref('int_customer_mrr') }}`. There may be zero matches if these models don't currently depend on it — that's fine, skip the file.

- [ ] **Step 3: Compile to verify DAG**

```bash
dbt compile --select +int_mrr_movement_decomposed +int_customer_mrr_lines
```

Expected: both compile cleanly. The `+` prefix means "include upstream" — `int_customer_mrr` should appear in the compile if either references it.

- [ ] **Step 4: Run both downstream models**

```bash
dbt run --select int_mrr_movement_decomposed int_customer_mrr_lines --target prod
```

Expected: both complete. They're already-built models so this is a rebuild against the (now dbt-managed) upstream.

- [ ] **Step 5: Commit**

```bash
git add models/intermediate/int_mrr_movement_decomposed.sql models/intermediate/int_customer_mrr_lines.sql
git commit -m "refactor(validation): switch decomposition models to ref(int_customer_mrr)"
```

---

## Task 8: Identity parity — seat + app + price = total movement

**Files:**
- Create: `scripts/parity_mrr_decomposition_identity.py`

The DRAFT model declares: `seat_mrr + app_mrr + price_mrr` should sum to the movement (`p2_saas - p1_saas`) per (month, entity_record_id). Prove this row-by-row.

- [ ] **Step 1: Write the parity script**

```python
# scripts/parity_mrr_decomposition_identity.py
"""Verify int_mrr_movement_decomposed identity:
   seat_mrr + app_mrr + price_mrr == (p2_saas - p1_saas)
per (month, entity_record_id), within float tolerance.

Exit 0 if all rows pass; exit 1 otherwise.
"""
import sys
from google.cloud import bigquery

TOLERANCE = 0.01
PROJECT = "project-for-method-dw"

SQL = f"""
SELECT
  month,
  entity_record_id,
  movement_kind,
  p1_saas,
  p2_saas,
  app_mrr,
  seat_mrr,
  price_mrr,
  (p2_saas - p1_saas) AS expected_total,
  (app_mrr + seat_mrr + price_mrr) AS decomposed_total,
  ABS((p2_saas - p1_saas) - (app_mrr + seat_mrr + price_mrr)) AS abs_diff
FROM `{PROJECT}.revenue.int_mrr_movement_decomposed`
WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  AND ABS((p2_saas - p1_saas) - (app_mrr + seat_mrr + price_mrr)) > {TOLERANCE}
ORDER BY abs_diff DESC
LIMIT 100
"""

def main():
    client = bigquery.Client(project=PROJECT)
    rows = list(client.query(SQL).result())
    if not rows:
        print(f"✓ Identity holds within {TOLERANCE} on all rows (trailing 24 months)")
        sys.exit(0)
    print(f"✗ {len(rows)} rows violate identity (showing top 100 by abs_diff):")
    for r in rows[:20]:
        print(f"  {r.month} | {r.entity_record_id} | {r.movement_kind} | "
              f"expected={r.expected_total:.4f} decomposed={r.decomposed_total:.4f} "
              f"diff={r.abs_diff:.4f}")
    sys.exit(1)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

```bash
python scripts/parity_mrr_decomposition_identity.py
```

**Expected outcome (uncertain):** ideally 0 violations. Realistically: the DRAFT model may have edge cases (mid-month price changes that interact with volume changes; rounding boundaries). If violations are < 0.1% of rows AND concentrated on small-dollar edge cases, document them in the schema yml as known-tolerance and proceed. If violations are systematic (e.g. all DOWNGRADE rows off by a constant factor), **STOP** — the model logic has a bug; fix `int_mrr_movement_decomposed.sql` before continuing.

This is the **first place** the plan may produce unexpected results. Don't push through a failure here.

- [ ] **Step 3: If violations found, investigate and document**

Use the Python decomposition script as ground truth:

```bash
python scripts/decompose_mrr_movements.py  # the existing reconciliation tool
```

Compare its output to dbt model output for a specific violating customer-month. Either fix the SQL or document the known edge case in `_mrr_decomposition.yml`.

- [ ] **Step 4: Commit (only after Step 2 passes or Step 3 documents the gap)**

```bash
git add scripts/parity_mrr_decomposition_identity.py
git commit -m "test(validation): identity parity for mrr_movement_decomposition"
```

---

## Task 9: Reconciliation parity — decomposed totals vs `int_customer_mrr` movements

**Files:**
- Create: `scripts/parity_mrr_decomposition_vs_customer_mrr.py`

The decomposed model's totals per (month, movement_kind) must reconcile to `int_customer_mrr`'s movement totals. Different grain (the decomposed model is per-customer; `int_customer_mrr` is aggregated by movement kind), same dollars.

- [ ] **Step 1: Write the parity script**

```python
# scripts/parity_mrr_decomposition_vs_customer_mrr.py
"""Reconcile int_mrr_movement_decomposed aggregate vs int_customer_mrr per
(month, movement_kind). Both should sum to the same total movement dollars.

NOTE: this assumes int_customer_mrr exposes per-movement-kind columns
(new_mrr, expansion_mrr, downgrade_mrr, cancellation_mrr) — confirm via:
    bq show --format=prettyjson project-for-method-dw:revenue.int_customer_mrr
If the schema differs, adjust the CASE statement in `expected` below.
"""
import sys
from google.cloud import bigquery

TOLERANCE = 1.00  # $1 tolerance per (month, movement_kind) aggregate

SQL = """
WITH decomposed AS (
  SELECT
    month,
    LOWER(movement_kind) AS movement_kind,
    SUM(p2_saas - p1_saas) AS decomposed_total
  FROM `project-for-method-dw.revenue.int_mrr_movement_decomposed`
  WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY month, LOWER(movement_kind)
),
customer AS (
  SELECT
    month,
    'new' AS movement_kind, SUM(new_mrr) AS expected
  FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY month
  UNION ALL
  SELECT month, 'expansion', SUM(expansion_mrr)
  FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY month
  UNION ALL
  SELECT month, 'downgrade', -SUM(downgrade_mrr)  -- decomposed_total is negative for downgrades
  FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY month
  UNION ALL
  SELECT month, 'cancellation', -SUM(cancellation_mrr)
  FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY month
)
SELECT
  d.month,
  d.movement_kind,
  d.decomposed_total,
  c.expected,
  d.decomposed_total - c.expected AS diff
FROM decomposed d
JOIN customer c USING (month, movement_kind)
WHERE ABS(d.decomposed_total - c.expected) > {tolerance}
ORDER BY ABS(d.decomposed_total - c.expected) DESC
""".format(tolerance=TOLERANCE)

def main():
    client = bigquery.Client(project="project-for-method-dw")
    rows = list(client.query(SQL).result())
    if not rows:
        print(f"✓ Reconciliation within ${TOLERANCE} per (month, movement_kind)")
        sys.exit(0)
    print(f"✗ {len(rows)} (month, movement_kind) pairs fail reconciliation:")
    for r in rows[:30]:
        print(f"  {r.month} | {r.movement_kind:12s} | "
              f"decomposed={r.decomposed_total:>14,.2f} "
              f"expected={r.expected:>14,.2f} "
              f"diff={r.diff:>+12,.2f}")
    sys.exit(1)

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

```bash
python scripts/parity_mrr_decomposition_vs_customer_mrr.py
```

Expected: exit 0 if the decomposed model is a true rollup of the same source data `int_customer_mrr` uses. **Schema-name caveat:** if the actual column names on `int_customer_mrr` differ from `new_mrr / expansion_mrr / downgrade_mrr / cancellation_mrr`, the script will fail at SQL compile — fix the column names from the Task 1 schema inspection.

If exit 1, the decomposed model and the movement classifier disagree on what counts as expansion/downgrade. **This is a meaningful methodology divergence — STOP and resolve before continuing.** Likely fix: align the movement_kind logic in `int_mrr_movement_decomposed.sql` to match `int_customer_mrr`.

- [ ] **Step 3: Commit**

```bash
git add scripts/parity_mrr_decomposition_vs_customer_mrr.py
git commit -m "test(validation): reconcile decomposition vs int_customer_mrr movements"
```

---

## Task 10: Lines parity — `int_customer_mrr_lines` rolls up to `int_customer_mrr`

**Files:**
- Create: `scripts/parity_customer_mrr_lines.py`

`int_customer_mrr_lines` is line-level (one row per item per customer-month). Sum its `saas` per (month, entity_record_id) should match `int_customer_mrr`'s customer-month SaaS total.

- [ ] **Step 1: Inspect both schemas first**

```bash
bq show --format=prettyjson project-for-method-dw:revenue.int_customer_mrr_lines | jq '.schema.fields[] | {name, type}'
bq show --format=prettyjson project-for-method-dw:revenue.int_customer_mrr | jq '.schema.fields[] | {name, type}'
```

Confirm which column on `int_customer_mrr` holds the customer-month SaaS total. Per Task 1 SQL, the candidates are `end_mrr` (most likely) or a column literally named `saas`. Update the script below accordingly.

- [ ] **Step 2: Write the parity script**

```python
# scripts/parity_customer_mrr_lines.py
"""Verify int_customer_mrr_lines rolls up to int_customer_mrr per (month, entity_record_id).

Assumes int_customer_mrr exposes an `end_mrr` column that represents the
customer-month SaaS total. If the column is named differently, adjust below.
"""
import sys
from google.cloud import bigquery

TOLERANCE = 0.01

SQL = """
WITH lines_rollup AS (
  SELECT month, entity_record_id, SUM(saas) AS lines_total
  FROM `project-for-method-dw.revenue.int_customer_mrr_lines`
  WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
  GROUP BY 1, 2
),
customer_view AS (
  SELECT month, entity_record_id, end_mrr AS customer_total
  FROM `project-for-method-dw.revenue.int_customer_mrr`
  WHERE month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 24 MONTH)
)
SELECT
  COALESCE(l.month, c.month) AS month,
  COALESCE(l.entity_record_id, c.entity_record_id) AS entity_record_id,
  l.lines_total,
  c.customer_total,
  l.lines_total - c.customer_total AS diff
FROM lines_rollup l
FULL OUTER JOIN customer_view c
  USING (month, entity_record_id)
WHERE ABS(IFNULL(l.lines_total, 0) - IFNULL(c.customer_total, 0)) > 0.01
ORDER BY ABS(IFNULL(l.lines_total, 0) - IFNULL(c.customer_total, 0)) DESC
LIMIT 200
"""

def main():
    client = bigquery.Client(project="project-for-method-dw")
    rows = list(client.query(SQL).result())
    if not rows:
        print(f"✓ Lines roll up to customer-month within {TOLERANCE}")
        sys.exit(0)
    print(f"✗ {len(rows)} (month, entity_record_id) pairs fail rollup:")
    for r in rows[:30]:
        l_tot = r.lines_total if r.lines_total is not None else 0
        c_tot = r.customer_total if r.customer_total is not None else 0
        print(f"  {r.month} | {r.entity_record_id} | "
              f"lines={l_tot:>12,.4f} customer={c_tot:>12,.4f} diff={r.diff:>+10,.4f}")
    sys.exit(1)

if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run it**

```bash
python scripts/parity_customer_mrr_lines.py
```

Expected: exit 0. If exit 1 with the diffs concentrated on customer-months where one side is null (one model has rows the other doesn't), that's a filter mismatch — likely `int_customer_mrr` excludes some customer-months (e.g. PE-excluded) that `int_customer_mrr_lines` includes. Document or fix.

- [ ] **Step 4: Commit**

```bash
git add scripts/parity_customer_mrr_lines.py
git commit -m "test(validation): line-level rollup parity vs int_customer_mrr"
```

---

## Task 11: Add dbt schema tests for all three models

**Files:**
- Create: `models/intermediate/_int_customer_mrr.yml`
- Modify: `models/intermediate/_mrr_decomposition.yml`

Add lightweight `not_null`, `unique`, `accepted_values` tests. These run on every `dbt build` and catch regressions cheaply.

- [ ] **Step 1: Create schema doc for int_customer_mrr**

```yaml
# models/intermediate/_int_customer_mrr.yml
version: 2

models:
  - name: int_customer_mrr
    description: |
      Per-customer per-month MRR with movement classification.
      Migrated from orphaned BQ view 2026-06-03 — see knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql for original DDL.
      Parity-verified via scripts/parity_int_customer_mrr.py.
      Methodology: CEO-confirmed symmetric Prepay Expiry exclusion (2026-04-28).
    columns:
      - name: month
        description: First day of the month (DATE).
        tests:
          - not_null
      - name: entity_record_id
        description: Stable numeric customer ID (use this for temporal joins, not CompanyAccount string).
        tests:
          - not_null
      - name: movement_kind
        description: Customer-month movement classification.
        tests:
          - not_null
          - accepted_values:
              values: ['new', 'expansion', 'downgrade', 'cancellation', 'flat']
              # Note: case-sensitive; update if the model emits different casing.
      # Add other columns as discovered during Task 1 schema inspection.
```

**Note:** column list is partial — add the rest after running the Task 1 `bq show` to see actual schema. Don't merge a yml that lists columns the model doesn't expose.

- [ ] **Step 2: Update _mrr_decomposition.yml with tests**

Open `models/intermediate/_mrr_decomposition.yml` and add tests under each column:

```yaml
# (append/edit existing entries — don't replace the file wholesale)
models:
  - name: int_mrr_movement_decomposed
    description: |
      Per-customer per-month movement decomposed into seat/app/price components.
      VALIDATED 2026-06-03: identity (seat+app+price=total) parity confirmed via
      scripts/parity_mrr_decomposition_identity.py; reconciles to int_customer_mrr
      movement totals via scripts/parity_mrr_decomposition_vs_customer_mrr.py.
    columns:
      - name: month
        tests: [not_null]
      - name: entity_record_id
        tests: [not_null]
      - name: movement_kind
        tests:
          - not_null
          - accepted_values:
              values: ['new', 'expansion', 'downgrade', 'cancellation', 'flat']
      # ... etc

  - name: int_customer_mrr_lines
    description: |
      Per-customer per-month per-line-item SaaS detail.
      VALIDATED 2026-06-03: rolls up to int_customer_mrr customer-month totals
      via scripts/parity_customer_mrr_lines.py.
    columns:
      - name: month
        tests: [not_null]
      - name: entity_record_id
        tests: [not_null]
      - name: item
        tests: [not_null]
```

- [ ] **Step 3: Run dbt test**

```bash
dbt test --select int_customer_mrr int_mrr_movement_decomposed int_customer_mrr_lines
```

Expected: all tests pass. If a test fails (e.g. an unexpected `movement_kind` value), either fix the model or expand the `accepted_values` list to match reality.

- [ ] **Step 4: Commit**

```bash
git add models/intermediate/_int_customer_mrr.yml models/intermediate/_mrr_decomposition.yml
git commit -m "test(validation): add schema tests for the three Net SaaS data models"
```

---

## Task 12: Define each metric per `docs/metric-definitions.md` rule

**Files:**
- Modify: `docs/metric-definitions.md` (append new entries — DO NOT replace the file)

Per CLAUDE.md: "A metric does not flip to `status: live` in dbt or Supabase until it has a filled-in entry in `docs/metric-definitions.md`." We're not promoting any of these as Supabase-registered metrics in this plan (they're intermediate models, not consumer-facing metrics), but the decomposition components (Seats $ / Apps $ / Price $) become consumer-facing in the upcoming dashboard. Document them now so Phase 2 doesn't get stuck behind this.

- [ ] **Step 1: Open and inspect the existing format**

```bash
head -100 docs/metric-definitions.md
```

Match the existing template exactly. Pay attention to the required fields per CLAUDE.md: "What it answers in one sentence", "Grain", "Filters / exclusions", "Methodology source", "Parity-verified against", "Known caveats".

- [ ] **Step 2: Append three new entries**

Append to the end of `docs/metric-definitions.md`:

```markdown
---

## MRR Movement Decomposition — Seats Component

**What it answers in one sentence:** Of a customer-month's net MRR change, how much was driven by changes in seat count (license quantity) at constant per-seat price.

**Grain:** customer-month (one value per entity_record_id × month, attributed to movement_kind).

**Filters / exclusions:** Inherits all `int_customer_mrr` filters (CEO-confirmed symmetric PE exclusion 2026-04-28); current incomplete month excluded.

**Methodology source:** Price-volume-mix decomposition; see `scripts/decompose_mrr_movements.py` for canonical logic.

**Parity-verified against:** `scripts/parity_mrr_decomposition_identity.py` (identity: seats + apps + price = total movement) and `scripts/parity_mrr_decomposition_vs_customer_mrr.py` (aggregate reconciliation), both passing as of 2026-06-03.

**Known caveats:** Allocation method may differ from per-seat ARR if customer has multi-tier seat pricing on the same plan; mid-month plan changes are bucketed into whichever side of the month boundary the line falls in.

---

## MRR Movement Decomposition — Apps Component

[same template, swap "seats" for "apps", describe as "changes in attached app count"]

---

## MRR Movement Decomposition — Price Component

[same template, "changes in per-unit price holding seat count and app count constant"]

---
```

Fill in the bracketed sections by analogy.

- [ ] **Step 3: Commit**

```bash
git add docs/metric-definitions.md
git commit -m "docs(validation): define seats/apps/price decomposition metrics"
```

---

## Task 13: Promote DRAFT → validated; update memory + cross-references

**Files:**
- Modify: `models/intermediate/_mrr_decomposition.yml` (flip DRAFT header)
- Modify: `models/intermediate/int_mrr_movement_decomposed.sql` (remove DRAFT comment header)
- Modify: `models/intermediate/int_customer_mrr_lines.sql` (remove DRAFT comment header)
- Update memory file referenced by `[MRR Movement Decomposition memory]` in CLAUDE.md

- [ ] **Step 1: Flip the yml header**

In `models/intermediate/_mrr_decomposition.yml`, find the DRAFT header and replace it with:

```yaml
# Net SaaS MRR movement decomposition models
# Status: VALIDATED 2026-06-03
# Validation evidence:
#   - scripts/parity_mrr_decomposition_identity.py — identity holds within $0.01/row
#   - scripts/parity_mrr_decomposition_vs_customer_mrr.py — aggregates reconcile within $1/(month,kind)
#   - scripts/parity_customer_mrr_lines.py — lines roll up to customer-month within $0.01
#   - dbt schema tests passing (not_null, accepted_values on movement_kind)
```

- [ ] **Step 2: Remove DRAFT headers from the SQL files**

In `int_mrr_movement_decomposed.sql` and `int_customer_mrr_lines.sql`, remove the "⚠ DRAFT" warning comments at the top. Replace with a short "Validated 2026-06-03; see _mrr_decomposition.yml for evidence" line.

- [ ] **Step 3: Update the memory file**

Open `/Users/nicolas/.claude/projects/-Users-nicolas-Desktop-method-metrics/memory/project_mrr_movement_decomposition.md` and update the body to reflect:
- `int_customer_mrr` now dbt-managed (resolves "orphaned" status)
- Decomposition models validated 2026-06-03; identity + reconciliation parity confirmed
- Cross-link to the parity scripts

Keep the entry short — the index line in MEMORY.md doesn't change.

- [ ] **Step 4: Final dbt build and test**

```bash
dbt build --select int_customer_mrr+ --target prod
```

The `+` after the model name means "this model and everything downstream." Expected: all models build, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add models/intermediate/_mrr_decomposition.yml \
        models/intermediate/int_mrr_movement_decomposed.sql \
        models/intermediate/int_customer_mrr_lines.sql
# Memory file is outside the repo — not committed here.
git commit -m "feat(validation): promote MRR decomposition models from DRAFT to validated"
```

- [ ] **Step 6: Verify push permissions and push**

Per memory `project_public_repo_exposure`: "push requires gh account `nickperaltab`."

```bash
gh auth status  # confirm logged in as nickperaltab
git push origin <current-branch>
```

---

## Self-Review

**1. Spec coverage** — checked against `docs/superpowers/specs/2026-06-03-net-saas-drilldown-dashboard-design.md` §3 (data model) and §7 (P0 phase):

| Spec requirement | Covered by |
|---|---|
| Migrate orphaned `int_customer_mrr` to dbt | Tasks 1-6 |
| Validate `int_mrr_movement_decomposed` | Tasks 8-9 |
| Validate `int_customer_mrr_lines` | Task 10 |
| Entity-level vs company-level rollup parity (Spec §6 Open Q #4) | Task 10 covers entity-level; **company-level rollup is NOT in this plan** — see gap note below |
| Annual-decomposition parity (Spec §6 Open Q #3) | Deferred per design — month-grain V1 |

**Gap: company-level rollup parity (Open Q #4).** The spec calls this out as part of validation. It's not in this plan because all three models are at `entity_record_id` (customer) grain — the rollup to `CompanyAccount` happens in downstream views per CLAUDE.md retention-grouping rule. If the dashboard ever displays company-level numbers, that view needs its own parity check. Not blocking for this phase; flagging.

**2. Placeholder scan:** Searched for "TBD", "TODO", "implement later" — none. Two instances of intentional bracketed instructions where the exact content depends on schema inspection (Task 3 Step 1, Task 11 Step 1, Task 12 Step 2) — these are real "fill in based on observed schema" steps, not vague placeholders.

**3. Type consistency:** `scripts/snapshot_int_customer_mrr.py`'s `NUMERIC_COLS` matches the SQL SELECT list (start_mrr, end_mrr, new_mrr, expansion_mrr, downgrade_mrr, cancellation_mrr, row_count). `parity_int_customer_mrr.py` uses the same column names. Decomposition scripts reference `p1_saas, p2_saas, app_mrr, seat_mrr, price_mrr, movement_kind, month, entity_record_id` — these match the schema in `_mrr_decomposition.yml` (per research summary). One known column-name uncertainty: which column on `int_customer_mrr` holds the customer-month SaaS total (Task 10 Step 1 inspects this before the script runs). Flagged inline.
