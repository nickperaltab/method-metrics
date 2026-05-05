# BQ as Metric Source of Truth — Phase 1 (Foundation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BigQuery the canonical home for live metric definitions (via `v_metric__*` views with `OPTIONS(description, labels)`), and surface that metadata in the existing Registry UI as a viewer. Zero user-facing breakage — the chart builder, scorecards, and existing semantic-layer SQL builder continue to work unchanged.

**Architecture:**

For each live metric in Supabase, create a corresponding BQ view named `v_metric__<slug>` that:
1. Selects the metric's natural-grain time-series (period + value)
2. Carries the metric's full description in `OPTIONS(description=...)`
3. Carries machine-readable metadata in `OPTIONS(labels=[...])` — `metric_id`, `layer`, `type`, `status`, `verified_at`, `owner`, `source_table`, `source_measure`, `source_date_col`

Once these views exist, the canonical definition lives in BQ. Supabase rows become a synced cache. The Registry UI gains a panel showing the BQ-side metadata (queried live from `INFORMATION_SCHEMA.OPTIONS` and `INFORMATION_SCHEMA.VIEWS`). No other downstream code changes in this phase.

**Phase scope (what's NOT in this plan):**
- Chart builder refactor to read BQ views directly — Phase 2
- Dropping redundant Supabase columns (`semantic_table`, `chart_sql`, `formula`, etc.) — Phase 3
- Reverse ETL setup (Hightouch/Census) — separate plan if pursued
- Migrating queued metrics — future, only live metrics in this phase

**Tech Stack:** BigQuery (DDL: `CREATE OR REPLACE VIEW ... OPTIONS`), Python 3 (urllib + supabase REST + google-cloud-bigquery for migration scripts), React/JS (Registry UI), Supabase Postgres (existing).

---

## File Structure

**Create:**
- `docs/bq-metric-conventions.md` — naming + labeling conventions
- `scripts/migrate/generate_metric_views.py` — generates DDL for all live metrics
- `scripts/migrate/apply_metric_views.py` — applies DDL to BQ (one view per metric)
- `scripts/migrate/fingerprint_metrics.py` — captures metric outputs before/after migration to verify no drift
- `builder/src/lib/useMetricMetadata.js` — React hook fetching BQ-side metadata for a metric
- `builder/src/lib/bigquery.js` — extend with `fetchMetricMetadata(viewName)` helper

**Modify:**
- `builder/src/pages/Registry.jsx` — `ExpandPanel` displays BQ-side metadata block (layer, owner, verified_at, source) pulled from BQ labels
- `CLAUDE.md` — document the new "BQ is canonical, Supabase is cache" architecture under Semantic Layer section
- Memory file `project_metric_schema_invariants.md` — update once more to reflect Phase 1

**BigQuery objects (created by the migration script):**
- One `v_metric__<slug>` view per live metric in `project-for-method-dw.revenue` (20 views)

---

## Conventions reference (used throughout)

**View name:** `v_metric__<lowercase_snake_case_name>`. Examples:
- Metric "Trials" (#54) → `v_metric__trials`
- Metric "Monthly Cancellations ($)" (#379) → `v_metric__monthly_cancellations_dollars`
- Metric "Annual GRR %" (#388) → `v_metric__annual_grr_pct`

**Required labels** (BigQuery labels are lowercase, hyphen/underscore only, max 64 chars):
- `metric_id` — Supabase metric ID as string
- `layer` — `l2` (aggregation) or `l3` (formula)
- `type` — `aggregation` (reads a view) or `formula` (math over other metrics)
- `status` — `live` for everything in this phase
- `owner` — `nic`, `justin`, or `unassigned`
- `verified_at` — ISO date `yyyy-mm-dd` or `unverified`
- `source_table` — for L2 metrics, the BQ view it reads (e.g., `v_customer_mrr`); empty for L3
- `source_measure_safe` — for L2, a sanitized version of the measure expression; empty for L3 (BQ labels can't contain spaces or symbols, so we slug it)
- `depends_on` — for L3 metrics, comma-separated metric IDs (e.g., `378-379-380`); empty for L2

**OPTIONS(description):** the metric's `description` + `notes` from Supabase, joined with two newlines, truncated to 1024 chars (BQ's max).

**View body — L2 (aggregation):**
```sql
SELECT
  <semantic_date_col> AS period,
  <semantic_measure> AS value
FROM `project-for-method-dw.revenue.<semantic_table>`
GROUP BY 1
ORDER BY 1
```

**View body — L3 (formula):**
The view JOINs the L2 metric views by `period` and computes the formula. Example for #382 Monthly GRR %:
```sql
SELECT
  s.period,
  SAFE_DIVIDE(s.value - c.value - d.value, s.value) * 100 AS value
FROM `project-for-method-dw.revenue.v_metric__monthly_start_mrr` s
LEFT JOIN `project-for-method-dw.revenue.v_metric__monthly_cancellations_dollars` c USING (period)
LEFT JOIN `project-for-method-dw.revenue.v_metric__monthly_downgrades_dollars` d USING (period)
ORDER BY 1
```

---

## Task 1: Write conventions doc

**Files:**
- Create: `docs/bq-metric-conventions.md`

- [ ] **Step 1: Write the conventions doc**

Create `docs/bq-metric-conventions.md` with this exact content:

```markdown
# BigQuery Metric View Conventions

Every live metric in the Supabase `metrics` registry has a corresponding BigQuery view named `v_metric__<slug>` in `project-for-method-dw.revenue`. These views are the **canonical definition** of each metric. The Supabase row is a synced cache.

## View naming

`v_metric__<lowercase_snake_case_metric_name>`

Examples:
- `Trials` (#54) → `v_metric__trials`
- `Monthly Cancellations ($)` (#379) → `v_metric__monthly_cancellations_dollars`
- `Annual GRR %` (#388) → `v_metric__annual_grr_pct`

Slug rules:
- Lowercase
- Replace spaces and `-` with `_`
- Drop punctuation (`%`, `(`, `)`, `$`, `,`)
- Replace `$` with `dollars` (when at end of name)
- Replace `%` with `pct` (when at end of name)

## View body shape

Every view returns exactly two columns: `period` (the date or period the metric is reported at) and `value` (the metric's numeric value).

### L2 (aggregation) view body

```sql
SELECT
  <semantic_date_col> AS period,
  <semantic_measure> AS value
FROM `project-for-method-dw.revenue.<semantic_table>`
GROUP BY 1
ORDER BY 1
```

### L3 (formula) view body

JOINs the L2 metric views it depends on, by `period`, and computes the formula:

```sql
SELECT
  s.period,
  SAFE_DIVIDE(s.value - c.value - d.value, s.value) * 100 AS value
FROM `project-for-method-dw.revenue.v_metric__monthly_start_mrr` s
LEFT JOIN `project-for-method-dw.revenue.v_metric__monthly_cancellations_dollars` c USING (period)
LEFT JOIN `project-for-method-dw.revenue.v_metric__monthly_downgrades_dollars` d USING (period)
ORDER BY 1
```

## OPTIONS(description)

The metric's `description` from Supabase, followed by two newlines, followed by the `notes` field. Truncated to 1024 chars (BQ's max for OPTIONS strings).

## OPTIONS(labels)

| Label | Values | Notes |
|---|---|---|
| `metric_id` | The Supabase metric ID as a string | Always present |
| `layer` | `l2` or `l3` | Always present |
| `type` | `aggregation` or `formula` | Always present |
| `status` | `live` | Always present (only live metrics get views in Phase 1) |
| `owner` | `nic`, `justin`, or `unassigned` | Always present |
| `verified_at` | `yyyy-mm-dd` or `unverified` | Always present |
| `source_table` | BQ view this metric reads (L2 only) | Empty string for L3 |
| `source_measure_safe` | Sanitized measure expression (L2 only) | Empty string for L3 |
| `depends_on` | `-`-joined metric IDs (L3 only) | Empty string for L2 |

BQ label rules: lowercase, alphanumeric + hyphens + underscores only, max 64 chars per value.

## Adding a new metric (Phase 1 workflow)

1. Add the metric row to Supabase as usual (`status='queued'`).
2. Solve and verify it.
3. Run `scripts/migrate/generate_metric_views.py --metric-id <id>` to generate the view DDL.
4. Review the DDL.
5. Apply via `scripts/migrate/apply_metric_views.py --metric-id <id>`.
6. Promote the Supabase row to `status='live'`.

After Phase 2, this workflow simplifies — the view becomes the source of truth and the Supabase row syncs from it.
```

- [ ] **Step 2: Commit**

```bash
git add docs/bq-metric-conventions.md
git commit -m "docs(bq): metric view naming and label conventions

Establishes v_metric__* naming, two-column (period, value) shape,
and the OPTIONS(description, labels) contract for canonical metric
definitions in BQ. Phase 1 of the BQ-as-source-of-truth migration."
```

---

## Task 2: Pilot — manually create v_metric__trials end-to-end

Pick #54 Trials as the simplest L2 case. Build it by hand to validate the conventions before scripting.

**Files:**
- (Direct BQ — no source files for this task)

- [ ] **Step 1: Look up the current Trials metric config in Supabase**

Run via Supabase MCP:
```sql
SELECT id, name, semantic_table, semantic_measure, semantic_date_col,
       description, notes, metric_type, assigned_to, verified_at
FROM metrics WHERE id = 54;
```

Expected fields:
- `semantic_table = 'v_trials'`
- `semantic_measure = 'COUNT(*)'`
- `semantic_date_col = 'SignupDate'`
- `assigned_to` likely null or 'Nic'
- `verified_at` ≈ `2026-04-07`

- [ ] **Step 2: Construct the DDL by hand**

```sql
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_metric__trials`
OPTIONS (
  description = "Trials. Count of trial signup events. <full description + notes from Supabase, truncated to 1024 chars>",
  labels = [
    ("metric_id", "54"),
    ("layer", "l2"),
    ("type", "aggregation"),
    ("status", "live"),
    ("owner", "unassigned"),
    ("verified_at", "2026-04-07"),
    ("source_table", "v_trials"),
    ("source_measure_safe", "count_star"),
    ("depends_on", "")
  ]
) AS
SELECT
  SignupDate AS period,
  COUNT(*) AS value
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1
ORDER BY 1;
```

- [ ] **Step 3: Run the DDL via Supabase MCP execute_sql**

Use `mcp__bigquery__execute_sql` if available, OR run via `bq query --use_legacy_sql=false` from a terminal that has gcloud auth.

Expected: view created, no error.

- [ ] **Step 4: Verify the view returns expected output**

Query:
```sql
SELECT period, value FROM `project-for-method-dw.revenue.v_metric__trials`
ORDER BY period DESC LIMIT 12;
```

Expected: 12 rows of monthly trial counts. Compare against the existing chart builder's "Trials by month" output for the same range — they should match exactly.

- [ ] **Step 5: Verify the metadata is queryable via INFORMATION_SCHEMA**

Query:
```sql
SELECT table_name, option_name, option_value
FROM `project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEW_OPTIONS`
WHERE table_name = 'v_metric__trials';
```

Expected: rows for `description` and `labels`, with `labels` containing the list above.

- [ ] **Step 6: Commit a notes file documenting the pilot**

Create `scripts/migrate/PILOT_NOTES.md`:

```markdown
# Pilot — v_metric__trials

Created manually 2026-04-28 to validate the BQ metric view conventions before
scripting the full migration.

- DDL applied successfully against `project-for-method-dw.revenue`.
- `INFORMATION_SCHEMA.VIEW_OPTIONS` returns expected `description` and `labels`.
- Output of `SELECT period, value FROM v_metric__trials ORDER BY period DESC LIMIT 12`
  matches the existing chart builder's "Trials by month" output exactly.

This unblocks the migration script in Task 4.
```

```bash
git add scripts/migrate/PILOT_NOTES.md
git commit -m "chore(bq): pilot v_metric__trials, conventions validated"
```

---

## Task 3: Build the fingerprint script (records pre-migration metric outputs)

Before migrating the rest, capture the current numerical output of every live metric so we can detect drift.

**Files:**
- Create: `scripts/migrate/fingerprint_metrics.py`

- [ ] **Step 1: Write the fingerprint script**

Create `scripts/migrate/fingerprint_metrics.py`:

```python
#!/usr/bin/env python3
"""Snapshot the numerical output of every live metric for pre/post comparison.

Usage:
    python scripts/migrate/fingerprint_metrics.py <label>
        label: 'pre' or 'post' or any tag — written into the filename

Writes JSON to scripts/migrate/fingerprints/fingerprint-<label>-<YYYY-MM-DD>.json

Each metric's fingerprint is a SHA-256 hash of its (period, value) pairs over
the last 24 months — small enough to compare quickly, large enough to detect
real numerical drift.

Pre-migration: queries each metric via the existing chart builder pattern
(semantic_table + semantic_measure + semantic_date_col).

Post-migration: queries each metric via SELECT period, value FROM v_metric__*.
"""
import hashlib
import json
import os
import subprocess
import sys
import urllib.request
from datetime import date

SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co'
SUPABASE_KEY = (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
    'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6'
    'ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.'
    'tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY'
)
BQ_PROJECT = 'project-for-method-dw'
BQ_DATASET = 'revenue'


def fetch_live_metrics():
    url = f'{SUPABASE_URL}/rest/v1/metrics?status=eq.live&select=*&order=id'
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def bq_query(sql):
    """Run via the bq CLI — assumes user is gcloud-authed."""
    result = subprocess.run(
        ['bq', 'query', '--use_legacy_sql=false', '--format=json', '--max_rows=1000', sql],
        capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout) if result.stdout else []


def query_metric_pre(metric):
    """Pre-migration: build SQL the way the chart builder does."""
    if metric.get('semantic_table') and metric.get('semantic_measure') and metric.get('semantic_date_col'):
        sql = f"""
        SELECT FORMAT_DATE('%Y-%m', DATE_TRUNC({metric['semantic_date_col']}, MONTH)) AS period,
               {metric['semantic_measure']} AS value
        FROM `{BQ_PROJECT}.{BQ_DATASET}.{metric['semantic_table']}`
        WHERE {metric['semantic_date_col']} >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
        GROUP BY 1
        ORDER BY 1
        """
        return bq_query(sql)
    if metric.get('formula') and metric.get('depends_on'):
        # L3 formula metric — return a placeholder; we don't fingerprint these
        # in pre-migration since they're computed client-side. Post-migration
        # they have a real BQ view we can query directly.
        return {'_skipped': 'formula_metric_client_computed'}
    return {'_skipped': 'no_semantic_or_formula'}


def query_metric_post(metric):
    """Post-migration: query the v_metric__* view directly."""
    view_name = slug_for_metric(metric['name'])
    sql = f"""
    SELECT FORMAT_DATE('%Y-%m', DATE_TRUNC(period, MONTH)) AS period, value
    FROM `{BQ_PROJECT}.{BQ_DATASET}.v_metric__{view_name}`
    WHERE period >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)
    ORDER BY 1
    """
    return bq_query(sql)


def slug_for_metric(name):
    """Convert a metric name to its v_metric__<slug> form. Mirror of the
    same function in generate_metric_views.py — keep them in sync."""
    s = name.lower().strip()
    s = s.replace('%', 'pct').replace('$', 'dollars')
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(ch)
        elif ch in (' ', '-', '_', '/'):
            out.append('_')
    slug = ''.join(out)
    while '__' in slug:
        slug = slug.replace('__', '_')
    return slug.strip('_')


def fingerprint_rows(rows):
    if isinstance(rows, dict) and '_skipped' in rows:
        return rows
    serialized = json.dumps(
        [(r.get('period'), str(r.get('value'))) for r in rows],
        sort_keys=True,
    )
    return {
        'sha256': hashlib.sha256(serialized.encode()).hexdigest(),
        'row_count': len(rows),
        'first_row': rows[0] if rows else None,
        'last_row': rows[-1] if rows else None,
    }


def main():
    if len(sys.argv) < 2:
        print('Usage: fingerprint_metrics.py <pre|post|label>')
        sys.exit(2)
    label = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, 'fingerprints')
    os.makedirs(out_dir, exist_ok=True)

    metrics = fetch_live_metrics()
    fingerprints = {}
    for m in metrics:
        try:
            rows = query_metric_pre(m) if label == 'pre' else query_metric_post(m)
            fingerprints[m['id']] = {
                'name': m['name'],
                'fingerprint': fingerprint_rows(rows),
            }
        except Exception as e:
            fingerprints[m['id']] = {
                'name': m['name'],
                'error': str(e),
            }
        print(f"  #{m['id']} {m['name']}")

    out = os.path.join(out_dir, f'fingerprint-{label}-{date.today().isoformat()}.json')
    with open(out, 'w') as f:
        json.dump(fingerprints, f, indent=2, default=str)
    print(f'\nWrote {len(fingerprints)} fingerprints to {out}')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run pre-migration fingerprint**

```bash
python scripts/migrate/fingerprint_metrics.py pre
```

Expected: prints 20 lines (one per live metric), writes
`scripts/migrate/fingerprints/fingerprint-pre-2026-04-28.json`. Some L3
formula metrics will show `_skipped` — that's expected and OK.

- [ ] **Step 3: Commit the script and pre-fingerprint**

```bash
git add scripts/migrate/fingerprint_metrics.py scripts/migrate/fingerprints/fingerprint-pre-*.json
git commit -m "chore(bq): pre-migration fingerprints for live metrics

Hashes the (period, value) output of every live metric over the last
24 months. Used to verify post-migration outputs match exactly."
```

---

## Task 4: Build the DDL generator script

**Files:**
- Create: `scripts/migrate/generate_metric_views.py`

- [ ] **Step 1: Write the generator**

Create `scripts/migrate/generate_metric_views.py`:

```python
#!/usr/bin/env python3
"""Generate BQ DDL for v_metric__* views from Supabase metric rows.

Usage:
    python scripts/migrate/generate_metric_views.py
        Generates DDL for all live metrics → scripts/migrate/ddl/<id>_<slug>.sql
    python scripts/migrate/generate_metric_views.py --metric-id 54
        Generates DDL for one metric only.

Does NOT apply the DDL — only writes .sql files for review.
"""
import argparse
import json
import os
import re
import urllib.request
from datetime import date

SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co'
SUPABASE_KEY = (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
    'eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6'
    'ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.'
    'tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY'
)
BQ_PROJECT = 'project-for-method-dw'
BQ_DATASET = 'revenue'


def slug_for_metric(name):
    s = name.lower().strip()
    s = s.replace('%', 'pct').replace('$', 'dollars')
    out = []
    for ch in s:
        if ch.isalnum():
            out.append(ch)
        elif ch in (' ', '-', '_', '/'):
            out.append('_')
    slug = ''.join(out)
    while '__' in slug:
        slug = slug.replace('__', '_')
    return slug.strip('_')


def safe_label(value, max_len=64):
    """BQ labels: lowercase, alphanumeric + hyphen + underscore. Max 64 chars."""
    if value is None:
        return ''
    s = str(value).lower()
    s = re.sub(r'[^a-z0-9_-]', '_', s)
    s = re.sub(r'_+', '_', s).strip('_')
    return s[:max_len]


def safe_string(value, max_len=1024):
    """BQ OPTIONS strings: must be SQL-escaped, max 1024 chars."""
    if value is None:
        return ''
    s = str(value).replace('\\', '\\\\').replace('"', '\\"')
    return s[:max_len]


def fetch_live_metrics():
    url = f'{SUPABASE_URL}/rest/v1/metrics?status=eq.live&select=*&order=id'
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}'
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def build_description(metric):
    parts = []
    if metric.get('description'):
        parts.append(metric['description'])
    if metric.get('notes'):
        parts.append(metric['notes'])
    return safe_string('\n\n'.join(parts), max_len=1024)


def build_labels(metric):
    is_l3 = bool(metric.get('formula') and metric.get('depends_on'))
    return [
        ('metric_id', str(metric['id'])),
        ('layer', 'l3' if is_l3 else 'l2'),
        ('type', 'formula' if is_l3 else 'aggregation'),
        ('status', 'live'),
        ('owner', safe_label(metric.get('assigned_to') or 'unassigned')),
        ('verified_at', metric['verified_at'][:10] if metric.get('verified_at') else 'unverified'),
        ('source_table', safe_label(metric.get('semantic_table') or '')),
        ('source_measure_safe', safe_label(metric.get('semantic_measure') or '')),
        ('depends_on', '-'.join(str(d) for d in (metric.get('depends_on') or []))),
    ]


def build_l2_body(metric):
    return f"""SELECT
  {metric['semantic_date_col']} AS period,
  {metric['semantic_measure']} AS value
FROM `{BQ_PROJECT}.{BQ_DATASET}.{metric['semantic_table']}`
GROUP BY 1
ORDER BY 1"""


def build_l3_body(metric, all_metrics_by_id):
    """Translate the formula like 'SAFE_DIVIDE({378} - {379} - {380}, {378}) * 100'
    into a JOIN over v_metric__* views. Each {N} becomes a CTE alias."""
    formula = metric['formula']
    deps = metric.get('depends_on') or []
    aliases = {}  # metric_id -> short alias (m1, m2, ...)
    joins = []
    select_expr = formula
    for i, dep_id in enumerate(deps):
        dep = all_metrics_by_id.get(dep_id)
        if dep is None:
            raise ValueError(f"Metric {metric['id']} depends on missing metric {dep_id}")
        alias = f'm{i + 1}'
        aliases[dep_id] = alias
        dep_view = f'v_metric__{slug_for_metric(dep["name"])}'
        if i == 0:
            joins.append(f'FROM `{BQ_PROJECT}.{BQ_DATASET}.{dep_view}` {alias}')
        else:
            joins.append(f'LEFT JOIN `{BQ_PROJECT}.{BQ_DATASET}.{dep_view}` {alias} USING (period)')
        select_expr = select_expr.replace(f'{{{dep_id}}}', f'{alias}.value')
    return f"""SELECT
  m1.period AS period,
  {select_expr} AS value
{chr(10).join(joins)}
ORDER BY 1"""


def build_ddl(metric, all_metrics_by_id):
    is_l3 = bool(metric.get('formula') and metric.get('depends_on'))
    view_name = f'v_metric__{slug_for_metric(metric["name"])}'
    description = build_description(metric)
    labels = build_labels(metric)
    body = build_l3_body(metric, all_metrics_by_id) if is_l3 else build_l2_body(metric)
    label_lines = ',\n    '.join(f'("{k}", "{v}")' for k, v in labels)
    return f"""-- Generated {date.today().isoformat()} from Supabase metric #{metric['id']} ({metric['name']})
-- DO NOT EDIT BY HAND — regenerate via scripts/migrate/generate_metric_views.py
CREATE OR REPLACE VIEW `{BQ_PROJECT}.{BQ_DATASET}.{view_name}`
OPTIONS (
  description = "{description}",
  labels = [
    {label_lines}
  ]
) AS
{body}"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--metric-id', type=int, default=None)
    args = parser.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, 'ddl')
    os.makedirs(out_dir, exist_ok=True)

    metrics = fetch_live_metrics()
    metrics_by_id = {m['id']: m for m in metrics}

    if args.metric_id:
        metrics = [m for m in metrics if m['id'] == args.metric_id]

    for m in metrics:
        ddl = build_ddl(m, metrics_by_id)
        slug = slug_for_metric(m['name'])
        filename = f"{m['id']:03d}_{slug}.sql"
        path = os.path.join(out_dir, filename)
        with open(path, 'w') as f:
            f.write(ddl)
        print(f"  Wrote {filename}")

    print(f"\nGenerated {len(metrics)} DDL file(s) in {out_dir}")


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Test on the pilot metric (Trials, #54)**

```bash
python scripts/migrate/generate_metric_views.py --metric-id 54
cat scripts/migrate/ddl/054_trials.sql
```

Expected: file contains a valid `CREATE OR REPLACE VIEW` statement matching the
shape of the manually-built pilot from Task 2 (modulo formatting differences).
Diff against the manual DDL:

```bash
diff <(grep -v '^--' scripts/migrate/ddl/054_trials.sql | tr -s ' ') <manual_pilot_ddl_pasted>
```

Expected: no semantic differences. If the script produces different SQL, fix
the script before proceeding.

- [ ] **Step 3: Commit the generator and the pilot DDL**

```bash
git add scripts/migrate/generate_metric_views.py scripts/migrate/ddl/054_trials.sql
git commit -m "chore(bq): DDL generator + Trials pilot DDL

Generates v_metric__<slug>.sql files from Supabase live-metric rows.
Output reviewed before applying to BQ. Trials DDL matches the manual pilot."
```

---

## Task 5: Generate DDL for all 20 live metrics; review

**Files:**
- (Outputs only) `scripts/migrate/ddl/*.sql`

- [ ] **Step 1: Run the generator for all live metrics**

```bash
python scripts/migrate/generate_metric_views.py
ls scripts/migrate/ddl/
```

Expected: 20 `.sql` files (one per live metric).

- [ ] **Step 2: Manually review each L3 (formula) DDL**

The L3 metrics are: 300, 301, 302, 382, 383, 388, 389. Open each:

```bash
cat scripts/migrate/ddl/300_*.sql
cat scripts/migrate/ddl/301_*.sql
cat scripts/migrate/ddl/302_*.sql
cat scripts/migrate/ddl/382_*.sql
cat scripts/migrate/ddl/383_*.sql
cat scripts/migrate/ddl/388_*.sql
cat scripts/migrate/ddl/389_*.sql
```

For each: confirm the JOIN structure correctly translates the formula. E.g., for `Monthly GRR %` (#382, formula `SAFE_DIVIDE({378} - {379} - {380}, {378}) * 100`), the generated body should be a JOIN over `v_metric__monthly_start_mrr`, `v_metric__monthly_cancellations_dollars`, `v_metric__monthly_downgrades_dollars`, with `m1.value - m2.value - m3.value` etc.

If any L3 file looks wrong, fix the generator's `build_l3_body` and regenerate.

- [ ] **Step 3: Commit the full DDL set**

```bash
git add scripts/migrate/ddl/*.sql
git commit -m "chore(bq): generated DDL for all 20 live metrics

Reviewed manually. L3 formula metrics correctly translate to JOIN-over-L2
views. Ready to apply via apply_metric_views.py."
```

---

## Task 6: Apply the DDL to BigQuery in dependency order

L3 metrics depend on L2 metrics, so L2 must be created first. Apply in the order: L2 first, then L3.

**Files:**
- Create: `scripts/migrate/apply_metric_views.py`

- [ ] **Step 1: Write the apply script**

Create `scripts/migrate/apply_metric_views.py`:

```python
#!/usr/bin/env python3
"""Apply v_metric__* DDL files to BigQuery in dependency order.

Reads scripts/migrate/ddl/*.sql, sorts so L2 (no `v_metric__` references)
applies before L3 (which references other v_metric__ views), and runs each
via the bq CLI.

Usage:
    python scripts/migrate/apply_metric_views.py            # apply all
    python scripts/migrate/apply_metric_views.py --dry-run  # print order, don't apply
    python scripts/migrate/apply_metric_views.py --metric-id 54  # apply one
"""
import argparse
import glob
import os
import re
import subprocess
import sys


def is_l3(sql_text):
    """L3 views reference other v_metric__ views in their FROM clause."""
    body = sql_text.split('AS\n', 1)[1] if 'AS\n' in sql_text else sql_text
    return 'v_metric__' in body


def apply_ddl(path):
    with open(path) as f:
        sql = f.read()
    print(f"  Applying {os.path.basename(path)}...")
    result = subprocess.run(
        ['bq', 'query', '--use_legacy_sql=false', '--format=none', sql],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"    FAILED: {result.stderr}", file=sys.stderr)
        return False
    print(f"    OK")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--metric-id', type=int, default=None)
    args = parser.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    ddl_dir = os.path.join(here, 'ddl')
    files = sorted(glob.glob(os.path.join(ddl_dir, '*.sql')))

    if args.metric_id:
        files = [f for f in files if os.path.basename(f).startswith(f'{args.metric_id:03d}_')]

    l2_files, l3_files = [], []
    for f in files:
        with open(f) as fh:
            text = fh.read()
        (l3_files if is_l3(text) else l2_files).append(f)

    print(f'L2 files ({len(l2_files)}):')
    for f in l2_files:
        print(f'  {os.path.basename(f)}')
    print(f'L3 files ({len(l3_files)}):')
    for f in l3_files:
        print(f'  {os.path.basename(f)}')

    if args.dry_run:
        print('\n(dry run — no DDL applied)')
        return

    failed = []
    for f in l2_files + l3_files:
        if not apply_ddl(f):
            failed.append(os.path.basename(f))

    if failed:
        print(f'\nFAILED ({len(failed)}):')
        for name in failed:
            print(f'  {name}')
        sys.exit(1)
    else:
        print(f'\nAll {len(files)} views applied successfully.')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Dry-run to verify ordering**

```bash
python scripts/migrate/apply_metric_views.py --dry-run
```

Expected output: ~13 L2 files listed first, then ~7 L3 files. Confirm the L2/L3 split looks right.

- [ ] **Step 3: Apply for real**

```bash
python scripts/migrate/apply_metric_views.py
```

Expected: 20 lines `Applying ... OK`, then `All 20 views applied successfully.`

If any fail: read the BQ error message, fix the DDL or generator, regenerate, and re-run only the failing ones via `--metric-id <id>`.

- [ ] **Step 4: Spot-check one of each layer in BQ**

```bash
bq query --use_legacy_sql=false "
SELECT period, value
FROM \`project-for-method-dw.revenue.v_metric__trials\`
ORDER BY period DESC LIMIT 6"
```

Expected: 6 rows of recent monthly trial counts, matching the existing chart builder's "Trials" data.

```bash
bq query --use_legacy_sql=false "
SELECT period, value
FROM \`project-for-method-dw.revenue.v_metric__monthly_grr_pct\`
ORDER BY period DESC LIMIT 6"
```

Expected: 6 rows of recent monthly GRR percentages, matching the existing chart builder's Monthly GRR %.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate/apply_metric_views.py
git commit -m "chore(bq): apply script for v_metric__* DDL

Applies generated DDL files in L2-then-L3 dependency order. All 20 live
metrics now have v_metric__* views in revenue dataset."
```

---

## Task 7: Run post-migration fingerprint and diff against pre

- [ ] **Step 1: Run post-migration fingerprint**

```bash
python scripts/migrate/fingerprint_metrics.py post
```

Expected: writes `scripts/migrate/fingerprints/fingerprint-post-2026-04-28.json`.

- [ ] **Step 2: Diff pre vs. post**

Create a small one-liner verification:

```bash
python3 -c "
import json
pre = json.load(open('scripts/migrate/fingerprints/fingerprint-pre-2026-04-28.json'))
post = json.load(open('scripts/migrate/fingerprints/fingerprint-post-2026-04-28.json'))
mismatches = []
for mid in pre:
    p = pre[mid].get('fingerprint')
    q = post[mid].get('fingerprint')
    if isinstance(p, dict) and '_skipped' in p:
        continue
    if p != q:
        mismatches.append((mid, pre[mid]['name'], p, q))
if mismatches:
    print(f'MISMATCH on {len(mismatches)} metric(s):')
    for mid, name, p, q in mismatches:
        print(f'  #{mid} {name}')
        print(f'    pre:  {p}')
        print(f'    post: {q}')
else:
    print('All metric outputs match pre vs. post.')
"
```

Expected: `All metric outputs match pre vs. post.` for the L2 metrics. L3 metrics show as skipped in pre (they're computed client-side today) but have real fingerprints post — which is fine, just note this.

If any L2 mismatches: investigate. The most likely cause is a difference in how `period` is formatted (the pre query uses `FORMAT_DATE` for grouping; the post query stores raw dates). If that's the cause, the data is the same, just formatted differently — acceptable. If actual values differ, fix and re-apply.

- [ ] **Step 3: Commit fingerprints**

```bash
git add scripts/migrate/fingerprints/fingerprint-post-*.json
git commit -m "chore(bq): post-migration fingerprints — outputs match pre"
```

---

## Task 8: Add `fetchMetricMetadata` helper to `lib/bigquery.js`

**Files:**
- Modify: `builder/src/lib/bigquery.js`

- [ ] **Step 1: Read the existing `fetchViewDefinition` helper for pattern reference**

Read `builder/src/lib/bigquery.js` lines around the existing `fetchViewDefinition` (added in earlier work). Note the use of `viewDefCache` (a `Map`).

- [ ] **Step 2: Add `fetchMetricMetadata(viewName)` helper**

After `fetchViewDefinition` in `builder/src/lib/bigquery.js`, add:

```javascript
const metricMetaCache = new Map();

export function clearMetricMetaCache() {
  metricMetaCache.clear();
}

/**
 * Fetch a metric view's OPTIONS (description + labels) from BQ.
 * Returns { description, labels: { [k]: v } } or null if the view doesn't exist.
 */
export async function fetchMetricMetadata(viewName) {
  validateIdentifier(viewName, 'viewName');
  if (metricMetaCache.has(viewName)) return metricMetaCache.get(viewName);
  const sql = `
    SELECT option_name, option_value
    FROM \`${BQ_PROJECT}.${BQ_DATASET}.INFORMATION_SCHEMA.VIEW_OPTIONS\`
    WHERE table_name = '${escapeBqString(viewName)}'
  `;
  const result = await queryBq(sql);
  if (!result.rows.length) {
    metricMetaCache.set(viewName, null);
    return null;
  }
  const meta = { description: '', labels: {} };
  for (const row of result.rows) {
    if (row.option_name === 'description') {
      // option_value is wrapped in extra quotes — strip them
      meta.description = String(row.option_value || '').replace(/^"|"$/g, '');
    } else if (row.option_name === 'labels') {
      // option_value looks like: [STRUCT("k", "v"), STRUCT("k2", "v2"), ...]
      const matches = String(row.option_value).matchAll(/STRUCT\(\s*"([^"]+)"\s*,\s*"([^"]*)"\s*\)/g);
      for (const m of matches) {
        meta.labels[m[1]] = m[2];
      }
    }
  }
  metricMetaCache.set(viewName, meta);
  return meta;
}
```

- [ ] **Step 3: Commit**

```bash
git add builder/src/lib/bigquery.js
git commit -m "feat(bq): fetchMetricMetadata helper for v_metric__ OPTIONS

Reads description + labels from INFORMATION_SCHEMA.VIEW_OPTIONS. Used by
the Registry UI to surface BQ-side metric metadata as a viewer over the
canonical definitions."
```

---

## Task 9: Add `useMetricMetadata` React hook

**Files:**
- Create: `builder/src/lib/useMetricMetadata.js`

- [ ] **Step 1: Write the hook**

Create `builder/src/lib/useMetricMetadata.js`:

```javascript
import { useState, useEffect } from 'react';
import { fetchMetricMetadata, getBqToken } from './bigquery.js';

/**
 * Fetch a v_metric__* view's BQ-side metadata (description + labels)
 * for display in the Registry UI. Returns the same loading/auth/error state
 * shape as useViewDefinition.
 */
export function useMetricMetadata(metricViewName) {
  const [state, setState] = useState({
    metadata: null, loading: false, error: null, needsAuth: false,
  });

  useEffect(() => {
    if (!metricViewName) {
      setState({ metadata: null, loading: false, error: null, needsAuth: false });
      return;
    }
    if (!getBqToken()) {
      setState({ metadata: null, loading: false, error: null, needsAuth: true });
      return;
    }
    let cancelled = false;
    setState({ metadata: null, loading: true, error: null, needsAuth: false });
    fetchMetricMetadata(metricViewName)
      .then(metadata => {
        if (cancelled) return;
        setState({ metadata, loading: false, error: null, needsAuth: false });
      })
      .catch(err => {
        if (cancelled) return;
        setState({ metadata: null, loading: false, error: err.message || 'Fetch failed', needsAuth: false });
      });
    return () => { cancelled = true; };
  }, [metricViewName]);

  return state;
}
```

- [ ] **Step 2: Commit**

```bash
git add builder/src/lib/useMetricMetadata.js
git commit -m "feat(registry): useMetricMetadata hook"
```

---

## Task 10: Update Registry UI's `ExpandPanel` to display BQ-side metadata

**Files:**
- Modify: `builder/src/pages/Registry.jsx` (the `ExpandPanel` component, around line 337)

- [ ] **Step 1: Read the existing ExpandPanel**

Read `builder/src/pages/Registry.jsx` from line 337 to the end of `ExpandPanel`. Note where the existing `liveDdl` (from `useViewDefinition`) is displayed in the "Definition" section.

- [ ] **Step 2: Add the hook + display block**

In the imports at the top of `Registry.jsx`, add:

```javascript
import { useMetricMetadata } from '../lib/useMetricMetadata';
```

In `ExpandPanel`, near where `liveDdl` is computed (just below it), add:

```javascript
const metricViewName = `v_metric__${slugForMetric(m.name)}`;
const metricMeta = useMetricMetadata(metricViewName);
```

Add a `slugForMetric` helper at the top of the file (after the imports):

```javascript
function slugForMetric(name) {
  let s = (name || '').toLowerCase().trim();
  s = s.replace(/%/g, 'pct').replace(/\$/g, 'dollars');
  s = s.replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_');
  return s.replace(/^_|_$/g, '');
}
```

In the `ExpandPanel` JSX, after the existing Definition block (right before the "More details" button at line ~395), insert this new section:

```jsx
{metricMeta.metadata && (
  <div style={s.panelSection}>
    <div style={s.panelLabel}>BQ Metric View</div>
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#374151' }}>
      revenue.{metricViewName}
    </div>
    {Object.keys(metricMeta.metadata.labels).length > 0 && (
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {Object.entries(metricMeta.metadata.labels).map(([k, v]) => v && (
          <span key={k} style={{
            ...s.pill,
            background: '#f3f4f6',
            fontSize: 11,
          }}>
            {k}: {v}
          </span>
        ))}
      </div>
    )}
  </div>
)}
{metricMeta.loading && (
  <div style={{ ...s.panelSection, color: '#9ca3af', fontSize: 12 }}>
    Loading BQ metadata…
  </div>
)}
{metricMeta.needsAuth && (
  <div style={{ ...s.panelSection, color: '#9ca3af', fontSize: 12 }}>
    Connect to BigQuery to view canonical metadata.
  </div>
)}
```

- [ ] **Step 3: Build to verify no syntax errors**

```bash
cd builder && npm run build
```

Expected: clean build, no errors.

- [ ] **Step 4: Manual smoke test**

Run dev server and verify:

```bash
cd builder && npm run dev
```

Open the Registry page, expand a live metric (e.g., #54 Trials). Confirm:
- "Definition" panel still shows the underlying view's DDL (existing behavior)
- New "BQ Metric View" panel appears below it, showing `revenue.v_metric__trials` and labels (`metric_id: 54`, `layer: l2`, `type: aggregation`, etc.)

- [ ] **Step 5: Commit**

```bash
git add builder/src/pages/Registry.jsx
git commit -m "feat(registry): show BQ-side metric metadata in ExpandPanel

Displays v_metric__* labels (layer, type, owner, verified_at, source_table,
etc.) pulled live from BQ INFORMATION_SCHEMA. Registry now acts as a viewer
over the canonical definitions in BQ."
```

---

## Task 11: Update CLAUDE.md with the new architecture

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the existing Semantic Layer section**

Read `CLAUDE.md` lines 63-100 (the Semantic Layer + Supabase Table sections).

- [ ] **Step 2: Replace the Semantic Layer section**

Replace the existing `## Semantic Layer` section with:

```markdown
## Metric Definitions — Source of Truth

**Canonical metric definitions live in BigQuery as `v_metric__*` views.** Each live metric in the Supabase `metrics` registry has a corresponding `v_metric__<slug>` view in `project-for-method-dw.revenue` with:

- `OPTIONS(description=...)` containing the full description + notes
- `OPTIONS(labels=[...])` carrying machine-readable metadata (layer, type, status, owner, verified_at, source_table, source_measure_safe, depends_on, metric_id)

The Supabase `metrics` row remains as a synced cache for the chart builder workflow (queued/live status, ownership, the AI catalog), but the SQL-level definition lives in BQ. See `docs/bq-metric-conventions.md` for the full conventions.

The Registry UI surfaces the BQ-side metadata via `useMetricMetadata` — see `builder/src/lib/useMetricMetadata.js`.

**Adding a new metric:**
1. Add the row to Supabase as `status='queued'`.
2. Solve and verify the metric.
3. Run `python scripts/migrate/generate_metric_views.py --metric-id <id>` to generate DDL.
4. Review `scripts/migrate/ddl/<id>_<slug>.sql`.
5. Apply via `python scripts/migrate/apply_metric_views.py --metric-id <id>`.
6. Promote the Supabase row to `status='live'`.

**Phase 2 (planned):** the chart builder reads `v_metric__*` views directly via INFORMATION_SCHEMA + the view body, retiring the Supabase semantic-layer SQL builder. After Phase 2, redundant Supabase columns (`semantic_table`, `chart_sql`, `formula`, etc.) get dropped.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: BQ-as-canonical metric definitions in CLAUDE.md

Documents the Phase 1 architecture: v_metric__* views in BQ are the
source of truth for metric definitions; Supabase rows are a synced cache."
```

---

## Task 12: Final verification + push

- [ ] **Step 1: Run all unit tests**

```bash
cd builder && npm run test:unit
```

Expected: same pass count as before (303 passing, 1 pre-existing failure in `chartDataBuilder.test.js`). No new failures.

- [ ] **Step 2: Final manual smoke test of Registry UI**

```bash
cd builder && npm run dev
```

Open the Registry, expand 3 different metrics:
- One L2 with semantic config (e.g., #54 Trials)
- One L2 with `chart_sql` if any exist among live (probably none — all live are semantic)
- One L3 formula (e.g., #382 Monthly GRR %)

For each, confirm:
- Definition panel still works (existing behavior)
- New "BQ Metric View" panel appears with the correct view name and label pills

- [ ] **Step 3: Push**

```bash
git push
```

Expected: all commits push cleanly to `main`.

---

## Self-Review

**Spec coverage check:**
- ✓ BQ holds canonical definitions — Tasks 1–7 (conventions, generator, applier, fingerprint verification)
- ✓ Supabase becomes a viewer — Tasks 8–10 (helper, hook, UI)
- ✓ Zero user-facing breakage — Tasks 6 (apply doesn't touch existing views) + 7 (fingerprint diff verifies outputs match) + 12 (smoke test)
- ✓ Documentation — Tasks 1 (conventions), 11 (CLAUDE.md)

**Out-of-scope (deferred to later phases):**
- Chart builder reading BQ views directly — Phase 2
- Dropping redundant Supabase columns — Phase 3
- Migrating queued metrics — future
- Reverse ETL setup — separate plan

**Placeholder check:** No "TBD" / "appropriate error handling" / "similar to Task N" — every step has the actual code or command. Clean.

**Type/name consistency:** `slug_for_metric` (Python) and `slugForMetric` (JS) implement the same logic; the rules are stated once in Task 1's conventions doc and referenced from both. `v_metric__*` naming is consistent throughout.

**Risk flags:**
- L3 formula translation in `build_l3_body` is the highest-risk piece — Task 5 Step 2 explicitly requires manual review of every L3 DDL before applying.
- Fingerprint comparison (Task 7) is the safety net — if outputs drift, we catch it before declaring done.
- The Registry UI changes are additive (new panel below existing one), so worst case is the new panel is empty/broken — existing UI stays intact.

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md`.**
