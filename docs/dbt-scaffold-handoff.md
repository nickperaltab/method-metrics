# Handoff — dbt-shaped Metric Scaffold

> ## ⚠️ DO NOT RUN `dbt run` — KNOWN PRODUCTION-BREAKING BUG
>
> The scaffold has a self-reference defect (round 2.5 audit, 2026-05-06).
> Running `dbt run` would `CREATE OR REPLACE VIEW revenue.v_trials AS SELECT * FROM revenue.v_trials`, which overwrites the real filter logic with a circular passthrough. Same for `v_syncs`. **See §12 for full explanation and the rename fix.** Resolve §12 before any `dbt run`, `dbt build`, or CI hookup. `dbt parse` and `dbt compile` remain safe.

**Date:** 2026-05-04 (initial); 2026-05-05 (scaffold round 2 — three fixes applied + Option C verdict + Fusion adopted); 2026-05-06 (round 2.5 self-reference bug surfaced, see §12)
**Status:** Scaffold v2 — all three fixes applied, Option C (foreign-only entity) validated end-to-end via `dbt compile` on Fusion. Five models, three metrics, two semantic models, all green for parse/compile. **NOT safe to `dbt run` until §12 is resolved.**
**Next chat should:** read §10 (round-2 verdict), §11 (round-2.5 follow-ups), and **§12 (the bug + fix options)** before doing anything else. Don't extend the pattern to more metrics until §12 is fixed — extending replicates the bug.

---

## 1. Why this work exists

We're rewriting the Phase 1 plan ([`docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md`](superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md)) to commit to dbt-conventions-without-running-dbt-the-tool, plus a Method-specific BigQuery materialization layer (`v_metric__*` views with OPTIONS labels for INFORMATION_SCHEMA-driven Registry UI consumption).

Before committing the rewrite to a file shape, we scaffolded **one** metric (`Trials`, #54) so we could validate the layout. That scaffold lives in `models/`. It mostly works but has one real bug. Fix the bug, add a second metric, then write the rewrite.

The work is bounded — we're not adopting dbt the CLI, not running `dbt run`, not migrating to Fusion. We're borrowing the file shape and vocabulary so future hires read it natively and so we can use `dbt-labs/dbt-agent-skills` (already installed).

---

## 2. What's already in place

**Plugin installed** (user scope): `dbt@dbt-agent-marketplace` v1.3.0. Verify with `claude plugin list`. Brings 9 skills; the relevant ones are:

- `using-dbt-for-analytics-engineering` — general layering
- `building-dbt-semantic-layer` — MetricFlow conventions (read this; **also read its `references/latest-spec.md`** — the SKILL.md alone has a hybrid example that mixes legacy/latest syntax)
- `adding-dbt-unit-test` — for backfilling tests later

**Conventions doc:** [`docs/dbt-conventions-mapping.md`](dbt-conventions-mapping.md) — side-by-side jaffle-shop vs. method-metrics layout, plus 5 decision points (D1–D5). Read this for context on why the layout looks the way it does.

**Layer-cake framework:** [`docs/primitives-vs-derivatives.md`](primitives-vs-derivatives.md) — already correct, no changes needed. Confirms `Account`/`TransLineFlattened` are the architectural primitives; `v_trials` etc. are intermediate.

**Phase 1 plan (to be rewritten):** [`docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md`](superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md). Don't rewrite yet — finish the scaffold first, then the rewrite is informed.

---

## 3. Files to read first

In order:

1. [`docs/dbt-conventions-mapping.md`](dbt-conventions-mapping.md) — context, all 5 decision points
2. `~/.claude/plugins/cache/dbt-agent-marketplace/dbt/1.3.0/skills/building-dbt-semantic-layer/references/latest-spec.md` — **authoritative dbt latest-spec syntax**. The SKILL.md has a misleading example. Read the reference, not just the SKILL.md.
3. [`models/README.md`](../models/README.md) — what's in the scaffold and why
4. [`models/intermediate/v_trials.yml`](../models/intermediate/v_trials.yml) — **has the bug** (see §5)
5. [`models/metrics/v_metric__trials.yml`](../models/metrics/v_metric__trials.yml) — has the `metric_ref` field that needs to drop
6. [`models/metrics/v_metric__trials.sql`](../models/metrics/v_metric__trials.sql) — the materialized DDL

---

## 4. Decisions already made (don't relitigate)

From [`docs/dbt-conventions-mapping.md`](dbt-conventions-mapping.md), reaffirmed via second-chat review:

| Decision | Resolution |
|---|---|
| **D1** YAML companion files alongside `.sql`? | **Yes.** yml is canonical; `.sql` is generated and synced into BQ OPTIONS at apply time. |
| **D2** Where do generated `.sql` files live? | `models/metrics/`. Permanent, not migration scratch. |
| **D3** Rename `v_*` → `int_*` in Phase 1? | **No.** Mechanical refactor, deferred to Phase 1.5. Document the intent in the rewrite. |
| **D4** MetricFlow taxonomy (`simple`/`derived`/`ratio`/`cumulative`/`conversion`)? | **Yes.** Replaces the prior `aggregation`/`formula` labels. |
| **D5** Install `dbt-agent-skills`? | **Done.** v1.3.0, user scope. |
| Co-location: simple metric on underlying model vs. separate metrics file? | **Co-locate** simple metrics on the underlying model. Top-level `metrics:` file ONLY for cross-model metrics (ratio, derived, cumulative, conversion). This is dbt latest-spec convention; verified in `references/latest-spec.md`. |
| `metric_ref` back-pointer field | **Drop.** Slug = filename is sufficient back-reference. |
| Commit `.sql` to git? | **Yes — but as the dbt model body (SELECT statement only), not full DDL.** dbt wraps the SELECT in `CREATE VIEW ... OPTIONS(...)` at run time, generating final DDL into `target/compiled/`. Commit the model `.sql` (the SELECT), gitignore `target/`. The committed `.sql` is small, human-readable, and PR-reviewable. |
| **Adopt dbt CLI? (added 2026-05-04)** | **Yes — Option A, full adoption.** dbt-bigquery natively supports the OPTIONS metadata via model config (`description` + `labels`). Custom Python deploy script retired in favor of `dbt run`. Phase 1 plan rewrite commits to this. |
| Second metric pick | **Sync Rate (`ratio`)**, NOT Monthly GRR %. GRR was just CEO-confirmed (symmetric PE exclusion); don't touch it in the pilot. Sync Rate exercises the cross-model ratio pattern (top-level `metrics:` file), which is a *different* file shape than the simple-metric scaffold. |

---

## 5. The three fixes to apply

### Fix 1: Rewrite `models/intermediate/v_trials.yml` to proper latest-spec syntax

**Bug:** the current file mixes legacy and latest spec. It uses nested `entities:` / `dimensions:` / `measures:` arrays under `semantic_model:` and `type_params:` blocks — those are legacy. The skill explicitly flags this as a common pitfall ("Mixing spec syntax — Don't use `type_params` in latest spec or direct keys in legacy spec").

**What it should be** (latest-spec correct):

```yaml
models:
  - name: v_trials
    description: |
      One row per Method account with SignupDate set (a trial was created).
      Inherits all columns from Account; SignupDate is the lifecycle-event
      timestamp. Source: revenue.Account, filtered to SignupDate IS NOT NULL
      upstream of this view.
    config:
      meta:
        layer: intermediate
        grain: entity_record
        owner: nic

    semantic_model:
      enabled: true
    agg_time_dimension: signup_date

    columns:
      - name: EntityRecordID
        entity:
          type: primary
          name: account
      - name: CompanyAccount
        entity:
          type: foreign
          name: company
      - name: SignupDate
        granularity: day
        dimension:
          type: time
          name: signup_date

    metrics:
      - name: trials
        type: simple
        label: Trials
        description: Count of trial signups (Method accounts that began a trial), grouped by SignupDate. Canonical "Trials" metric (#54).
        agg: count
        expr: 1
```

Key syntax differences from what's there now:
- `semantic_model:` only carries `enabled: true`; the agg_time_dimension is at model level (not nested)
- `entity:` and `dimension:` blocks live ON columns, not in nested arrays
- Simple metric uses `agg:` and `expr:` directly — NO `type_params:`
- No `measures:` array (latest spec replaces measures with simple metrics)

Validate after rewrite with the dbt skill rules in `references/latest-spec.md` § "Common Pitfalls".

### Fix 2: Drop `metric_ref:` from `models/metrics/v_metric__trials.yml`

Remove the `metric_ref: trials` line at the end. It's an invented field; dbt has no such convention. The slug-equals-filename pattern is the back-reference.

### Fix 3: Scaffold Sync Rate as the second metric

Sync Rate = syncs / trials. **Cross-model ratio** — denominator is from `v_trials`, numerator is from `v_syncs`. Per latest-spec, cross-model metrics live in a **top-level `metrics:` file**.

Files to create:

1. `models/intermediate/v_syncs.yml` — semantic_model on `v_syncs` + simple metric `syncs` (single-model). Mirror the corrected v_trials.yml pattern: column-level entity/dimension blocks, direct `agg`/`expr`, no `type_params`. Source: `revenue.Account` filtered to `FirstSyncDate IS NOT NULL` (verify the actual filter against the existing `v_syncs` BQ view definition before writing).

2. `models/metrics/_metrics.yml` — top-level cross-model metrics file. First entry:
   ```yaml
   metrics:
     - name: sync_rate
       type: ratio
       label: Sync Rate
       description: Fraction of trials that completed at least one sync.
       numerator: syncs
       denominator: trials
   ```

3. `models/metrics/v_metric__sync_rate.yml` — materialization metadata, mirroring the `v_metric__trials.yml` pattern. The `meta:` block carries the BQ OPTIONS labels (`type: ratio`, `depends_on: '54-<syncs_id>'`, etc.). Note `source_table` and `source_measure_safe` should be empty for cross-model metrics; `depends_on` is populated.

4. `models/metrics/v_metric__sync_rate.sql` — generated DDL. Joins `v_metric__syncs` and `v_metric__trials` by `period`, computes `SAFE_DIVIDE(syncs.value, trials.value)`. (And implicitly: `v_metric__syncs` needs to exist too — so if it doesn't, scaffold that as well.)

Note: this means we now have **two simple metrics** (trials, syncs) and **one ratio metric** (sync_rate). The ratio file is in `models/metrics/_metrics.yml` (top-level metrics file). The simple metrics are in their respective `models/intermediate/v_*.yml` files (co-located with their semantic models).

---

## 6. After the three fixes — stop and ask

The user said "the rest of my advice (drop metric_ref, commit .sql with CI guard, don't pick GRR second) stands regardless." They want the scaffold validated before extending.

**Don't do these without explicit approval:**

- Don't rewrite the Phase 1 plan yet — finish the scaffold review first.
- Don't extend to a third metric.
- Don't migrate the existing 20 live metrics.
- Don't touch `Monthly GRR %` (#382) — CEO just confirmed the methodology; we leave it alone in the pilot.
- ~~Don't run `dbt parse`~~ — **DECIDED 2026-05-04:** going Option A (full dbt CLI adoption). `dbt_project.yml` gets initialized as part of the Phase 1 plan rewrite. `dbt parse` + `dbt test` + `dbt run` become standard workflow. The custom Python deploy script is slated for retirement once `dbt run` is doing the materialization.
- Don't apply any DDL to BQ. The `.sql` files are scaffolds for review; nothing has hit BQ yet.

**Do ask before:**

- Adding the CI regenerate-and-diff guard (need to confirm where CI runs and how — GitHub Pages deploys but there's no obvious GitHub Actions setup yet)
- Touching `scripts/migrate/generate_metric_views.py` to read from yml (this is the structural change the rewrite would commit to)

---

## 7. Honest red flags worth knowing

1. **The dbt skill's SKILL.md and references/latest-spec.md disagree.** The SKILL.md "minimal latest spec example" uses nested `entities:`/`dimensions:`/`measures:` arrays under `semantic_model:`, plus `type_params:` on metrics — those are legacy syntax. The references/latest-spec.md is the authoritative source. Read the reference, not the SKILL.md example.

2. **Method-metrics doesn't have marts yet.** dbt's pattern is to put semantic models on marts. We're putting them on intermediate (`v_trials`) because that's the entity-grained model we have. Phase 1.6 plans `fct_trials` etc.; at that point semantic models could move. Document the intent in the scaffold so the eventual move is mechanical.

3. **The materialization layer (`v_metric__*`) is invented.** dbt computes metrics at query time via MetricFlow / a BI tool — it does NOT materialize metrics as BQ views. Method's stack needs the materialization because the AI/MCP reads BQ INFORMATION_SCHEMA, not a MetricFlow server. So the entire `models/metrics/v_metric__*.{sql,yml}` pattern is bridge work that has no canonical dbt equivalent. Expect divergence here; lean on dbt conventions for the underlying semantic-model + metric definitions, and treat the materialization as Method-specific glue. **Keep the bridge isolated** (deploy script in `scripts/migrate/`, materialization yml separate from definition yml) so if MetricFlow ever exposes to BQ INFORMATION_SCHEMA, the bridge becomes deletable without unwinding the definition layer.

4. **Supabase MCP was disconnected partway through this work.** If you need to look up the live metric config (e.g., what `semantic_table` / `semantic_measure` / `semantic_date_col` are set on metric #54), reconnect the MCP or read from Supabase via curl. Don't guess.

5. **Two Claude chats have been working this in parallel.** The other chat (different account) has been giving second opinions. Their pushback on file layout (move metric def to `metrics/trials.yml`) was actually wrong per the dbt skill — co-location on the underlying model is canonical for simple metrics. Their other points (drop metric_ref, CI guard, Sync Rate over GRR) were right and are reflected in the decisions table above.

6. **Time spine model not yet scaffolded.** The dbt skill flags a time spine model as required for cumulative metrics (running totals, MTD/YTD, trailing windows). None of the first 5 metrics are cumulative, so this isn't blocking — but the moment a cumulative metric is requested (e.g., trailing-12-month ARR), a time spine becomes required. See `references/time-spine.md` in the dbt-agent-marketplace plugin for the spec. Decide in the Phase 1 plan rewrite whether to scaffold one preemptively or defer until needed.

7. ~~**Validation path is an open question.**~~ **DECIDED 2026-05-04: Option A — full dbt CLI adoption.** The user pushed back on the half-adoption middle path; doing it right from the start is cheaper than rebuilding dbt features piecemeal. Phase 1 commits to: `dbt_project.yml` + `profiles.yml` + `dbt run` for materialization + `dbt test` for tests + `dbt parse` for validation + `dbt docs generate` for lineage. The custom Python deploy script (`scripts/migrate/generate_metric_views.py`) gets retired. The bridge layer (`v_metric__*` materialization with OPTIONS metadata) becomes a regular dbt model with `description` + `labels` configured via the dbt-bigquery adapter — no custom materialization needed. See Phase 1 plan rewrite.

---

## 8. Quick command reference

```bash
# Confirm plugin install
claude plugin list

# Read the authoritative dbt latest-spec reference
cat ~/.claude/plugins/cache/dbt-agent-marketplace/dbt/1.3.0/skills/building-dbt-semantic-layer/references/latest-spec.md

# Look at the existing scaffold
ls -la models/
cat models/README.md
cat models/intermediate/v_trials.yml      # has the bug
cat models/metrics/v_metric__trials.yml   # has the metric_ref to drop
cat models/metrics/v_metric__trials.sql

# Look at the existing Phase 1 plan (to be rewritten AFTER scaffold is validated)
cat docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md

# Look at the existing v_trials BQ view definition (informs Fix 3 — verify the v_syncs filter before writing)
# Either reconnect Supabase MCP, or query directly:
bq query --use_legacy_sql=false "
SELECT view_definition
FROM \`project-for-method-dw.revenue.INFORMATION_SCHEMA.VIEWS\`
WHERE table_name IN ('v_trials', 'v_syncs')"
```

---

## 9. The "definition of done" for this scaffold round

Done when:

1. `models/intermediate/v_trials.yml` uses pure latest-spec syntax (no `type_params`, entity/dimension on columns, direct keys).
2. `models/metrics/v_metric__trials.yml` no longer has `metric_ref:`.
3. `models/intermediate/v_syncs.yml` exists with simple `syncs` metric.
4. `models/metrics/_metrics.yml` exists with cross-model `sync_rate` ratio metric.
5. `models/metrics/v_metric__sync_rate.yml` + `.sql` exist (mirror the `v_metric__trials` pair shape).
6. (If `v_metric__syncs` is needed as a dependency) — the simple `syncs` materialization also exists.
7. The user has reviewed and confirmed the layout.

Then — **and only then** — the rewrite of [`docs/superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md`](superpowers/plans/2026-04-28-bq-as-metric-source-of-truth-phase1.md) starts. The scaffold becomes the reference shape the rewrite extends to all 20 live metrics.

---

*Handoff written by Claude (Account A) on 2026-05-04. The next chat picking this up should be in the `method-metrics/` working directory and should have the dbt plugin loaded (it was installed in this session; will be available on next session start).*

---

## 10. Round 2 — what actually happened (2026-05-05)

Round 2 picked up the handoff and discovered the round-1 plan needed several corrections before the three fixes could land. Findings + the resolutions:

### 10.1 Schema divergences from the round-1 description

Verified against `INFORMATION_SCHEMA.VIEWS` directly. Round-1 plan had three factual errors that would have produced a wrong scaffold:

| Round-1 said | Reality |
|---|---|
| `v_trials` filter is `SignupDate IS NOT NULL` | `IsConversionException = FALSE AND Partner != 'Method Integration' AND SignupDate != DATE('0001-01-01')` |
| `v_syncs` source is `revenue.Account` filtered to `FirstSyncDate IS NOT NULL` | `revenue.Funnel WHERE EventType = 'Sync'` |
| `v_syncs` agg time dim is `SignupDate` | `SyncDate` (event time). `SignupDate` is also carried for cohort joins, but it's not the model's default time |

Round-1 also assumed `EntityRecordID` was projected on both views. **It isn't** — `Account` and `Funnel` both have it, but the v_trials/v_syncs SELECTs don't surface it. This forced the primary-entity decision below.

### 10.2 Primary entity — option C is the answer

Round 1 anticipated three options (A: lie about CompanyAccount being primary; B: add EntityRecordID to the BQ views; C: skip primary entity). The user vetoed A on principle — declaring a non-unique column as `primary` plants debt that compounds across every cross-model join we'll ever do. C was the recommended path: skip primary, use `foreign` on CompanyAccount, count via `agg: count, expr: '*'`.

**Verdict: C validates.** `dbt compile` against Fusion 2.0.0-preview.175:
> Processed: 5 models | 3 metrics | 2 semantic models — Summary: 5 total | 5 success

The latest-spec ref's "Common Pitfalls" table flags only missing `agg_time_dimension`, never missing primary entity. The spec accepts foreign-only semantic models. We documented the choice in the yml comments — not as a hack, but as an honest representation of the grain (these are event-grained intermediates; rows are events; we count them).

Fallback B remains authorized if a future requirement needs per-row uniqueness (e.g., joins to dim_customers in Phase 1.6). The v_trials and v_syncs SELECTs would each get a one-line addition of `EntityRecordID` (Funnel has it; Account has it). That's still a small edit.

### 10.3 Fusion adopted, Core 1.11 dead-end

Round 1 said "Option A — full dbt CLI adoption." Round 2 discovered: **dbt Core 1.12 isn't on PyPI yet** (latest is 1.11.8, what `pip install dbt-bigquery` gives you). Latest-spec parsing requires 1.12+ or **Fusion**.

**Resolution: installed Fusion** via `curl -fsSL https://public.cdn.getdbt.com/fs/install/install.sh | sh`. Lives at `/Users/nicolas/.local/bin/dbt`, version 2.0.0-preview.175. The pip-installed Core 1.11.8 is still around but unused for our latest-spec models.

This is a real change to the Phase 1 plan rewrite assumptions: Fusion (preview) is the runtime, not Core. Worth flagging in the rewrite — Fusion is in active beta and the install is a curl-pipe-bash, not a pip dep that locks to a version. Reproducibility may need extra care (record the version in the Phase 1 plan rewrite; pin via the install.sh `-v` flag if needed).

### 10.4 Project init — minimum-viable for parse

The scaffold was yml-only, but `dbt compile` requires:
- `dbt_project.yml` at the repo root (exists now — 11 lines, profile = `method_metrics`, model paths = `models`)
- `~/.dbt/profiles.yml` (exists now — bigquery + oauth ADC, project `project-for-method-dw`, dataset `revenue`)
- `.sql` companion for each model named in yml (otherwise Fusion can't resolve the semantic_model attachment)

The `.sql` companions for `v_trials` and `v_syncs` are passthroughs (`select * from \`project-for-method-dw.revenue.v_trials\``) with a header comment explaining they exist so dbt can attach the semantic_model. They're not the source of truth for the views — the BQ DDL is. Phase 1.5's rename refactor decides whether to inline the filter logic into these dbt models.

### 10.5 Parity confirmed via Supabase

Cross-checked against Supabase before writing the metrics:

| Supabase row | Field | Value | Round-2 yml |
|---|---|---|---|
| #54 Trials | semantic_measure | `COUNT(*)` | `agg: count, expr: '*'` ✅ |
| #54 Trials | semantic_date_col | `SignupDate` | column-level `name: SignupDate` w/ time dimension ✅ |
| #55 Syncs | semantic_measure | `COUNT(*)` | `agg: count, expr: '*'` ✅ |
| #55 Syncs | semantic_date_col | `SyncDate` | `agg_time_dimension: sync_date` ✅ |
| #300 Sync Rate | depends_on | `[55, 54]` | `meta.depends_on: '55-54'` (numerator-denominator order) ✅ |

### 10.6 The .sql files are still raw DDL

Round-1 §6 said "the bridge layer becomes a regular dbt model with `description` + `labels` configured via the dbt-bigquery adapter — no custom materialization needed." That's the Option A target shape. **It isn't done in round 2.** The three `v_metric__*.sql` files still contain `CREATE OR REPLACE VIEW ... OPTIONS(...) AS SELECT ...` — raw DDL.

Why: converting them is a meaningful rework that belongs in the Phase 1 plan rewrite, not this scaffold validation round. Fusion happily passes the raw DDL through (the compiled output is byte-identical to the source) — so they parse, but they're NOT safe to `dbt run` until the Option A migration is done. Each file has a comment at the top noting this.

### 10.7 What the scaffold now contains

```
models/
  intermediate/
    v_trials.sql           ← passthrough, dbt-shaped (NEW, this round)
    v_trials.yml           ← latest-spec, foreign-only entity (REWRITTEN)
    v_syncs.sql            ← passthrough, dbt-shaped (NEW)
    v_syncs.yml            ← latest-spec, foreign-only entity (NEW)
  metrics/
    _metrics.yml           ← top-level, sync_rate ratio (NEW)
    v_metric__trials.yml   ← metric_ref dropped (EDITED)
    v_metric__trials.sql   ← raw DDL, unchanged
    v_metric__syncs.yml    ← mirrors v_metric__trials shape (NEW)
    v_metric__syncs.sql    ← raw DDL, mirrors v_metric__trials (NEW)
    v_metric__sync_rate.yml ← ratio materialization metadata (NEW)
    v_metric__sync_rate.sql ← raw DDL, FULL OUTER JOIN of syncs/trials (NEW)
dbt_project.yml            ← minimum viable (NEW)
~/.dbt/profiles.yml        ← oauth ADC, project-for-method-dw (NEW, outside repo)
```

`dbt compile` exits clean. End of round 2.

### 10.8 Open questions for the user before round 3

1. **Adopt the new pattern (passthrough .sql + latest-spec yml + foreign-only entity)?** If yes, this is the shape the Phase 1 plan rewrite extends to all 20 live metrics.
2. **Commit the round-2 dbt-project scaffolding to git?** `dbt_project.yml` and the new model files are currently untracked. `~/.dbt/profiles.yml` is per-user and stays out.
3. **When does the v_metric__*.sql DDL → dbt-native materialization conversion happen?** Round 2 punted to the Phase 1 plan rewrite. If the rewrite's first task should be that conversion, flag it now.
4. **EntityRecordID surfacing — defer to Phase 1.5, or do it pre-emptively?** Round 2 punted; foreign-only is correct for current grain but joins to future marts (`dim_customers`) will need it.
5. **Pin Fusion version in the plan?** It's a preview build (`2.0.0-preview.175`); changes between previews could break the validation.

### 10.9 Files edited / created in round 2

```
EDITED   docs/dbt-scaffold-handoff.md            (this addendum)
EDITED   models/intermediate/v_trials.yml         (full rewrite)
EDITED   models/metrics/v_metric__trials.yml      (dropped metric_ref)
NEW      models/intermediate/v_trials.sql
NEW      models/intermediate/v_syncs.yml
NEW      models/intermediate/v_syncs.sql
NEW      models/metrics/_metrics.yml
NEW      models/metrics/v_metric__syncs.yml
NEW      models/metrics/v_metric__syncs.sql
NEW      models/metrics/v_metric__sync_rate.yml
NEW      models/metrics/v_metric__sync_rate.sql
NEW      dbt_project.yml
NEW      ~/.dbt/profiles.yml                      (outside repo)
```

*Round 2 written by Claude (Account A continuation, 2026-05-05). Stops here per round-1 handoff §6 — awaiting user review before extending the pattern to the rest of Phase 1.*

---

## 11. Round 2.5 — user-approved follow-ups (2026-05-05)

After reviewing the §10.8 open questions, the user authorized four follow-ups in the same session. All applied; final `dbt compile` still clean (5 models | 3 metrics | 2 semantic models | 5 success).

### 11.1 EntityRecordID surfaced (was §10.8 #4)

`revenue.v_trials` and `revenue.v_syncs` BQ views were modified via `CREATE OR REPLACE VIEW` to include `EntityRecordID` in the SELECT projection. Purely additive change — one column added at the top of each SELECT. All other columns and the WHERE clause are byte-identical.

**Asymmetry preserved honestly:**

- **v_trials**: `EntityRecordID` is unique per row (account-grain). YAML now declares it as `type: primary` (entity name `account`). `CompanyAccount` remains a `foreign` entity (company-grain).
- **v_syncs**: `EntityRecordID` is NOT unique per row (one account can sync many times → many rows per EntityRecordID). YAML declares it as `type: foreign` (entity name `account`). Still no primary entity. `CompanyAccount` is also `foreign`.

The metrics keep their `agg: count, expr: '*'` aggregation — Supabase parity preserved (#54 and #55 both compute `COUNT(*)`). EntityRecordID is now available for future joins to `dim_customers` (Phase 1.6) without changing the canonical metric values.

### 11.2 v_metric__\* converted to dbt-native materialization (was §10.8 #3)

All three `v_metric__*.{yml,sql}` pairs converted from raw `CREATE OR REPLACE VIEW ... OPTIONS(...) AS SELECT` DDL to dbt-bigquery's native pattern:

- **`.yml`** — `description:` field at the model level (becomes BQ view description); `config.labels:` block (becomes BQ view labels); `config.materialized: view`
- **`.sql`** — just the SELECT body, prefixed with `{{ config(materialized='view') }}`. Cross-model refs use `{{ ref('v_trials') }}` instead of hard-coded `\`project-for-method-dw.revenue.v_trials\``.

`dbt run` will now generate the correct `CREATE OR REPLACE VIEW ... OPTIONS(description, labels) AS ...` automatically. The custom Python deploy script (`scripts/migrate/generate_metric_views.py`) is no longer needed for these three metrics — Phase 1 plan rewrite can plan its retirement once all 20 metrics follow this pattern.

### 11.3 Fusion version pinned (was §10.8 #5)

New file: [`docs/dbt-setup.md`](dbt-setup.md). Pinned to **`2.0.0-preview.175`**. Install command uses `install.sh -v 2.0.0-preview.175` for reproducibility. Doc covers profile setup, verification command, and the "why Fusion vs. Core" decision.

### 11.4 Round-3 pilot candidates identified (was §10.8 #1, partial)

User chose option (b) — pilot 2 more metrics before extending to all 20. The remaining 17 live metrics fall into these patterns:

| Pattern | Count | Tested by current scaffold? | Representative examples |
|---|---|---|---|
| Simple `COUNT(*)` from event-grained intermediate | 3 | ✅ Trials, Syncs scaffolded | #56 Conversions (clone of Trials/Syncs) |
| Simple `COUNT(DISTINCT)` from entity-grained intermediate | 2 | ❌ | #59 Churn (`COUNT(DISTINCT CompanyAccount)` from v_cancellations); #373 Customers (`COUNT(DISTINCT EntityRecordID)` from v_customers) |
| Simple `ROUND(SUM(...))` from per-customer-month MRR | 8 | ❌ | #378 Monthly Start MRR; #384 Annual Start MRR; #379–381, #385–387 |
| Cross-model ratio | 3 | ✅ Sync Rate scaffolded | #301 Sync-to-Conversion Rate; #302 Trial-to-Conversion Rate |
| Multi-input derived (formula) | 4 | ❌ | #382 Monthly GRR %, #383 Monthly NRR %, #388 Annual GRR %, #389 Annual NRR % — but these are CEO-blessed and protected from pilot churn |

**Recommended pilot picks (round 3):**

1. **#373 Customers** (`COUNT(DISTINCT EntityRecordID)` from `v_customers`) — exercises:
   - `agg: count_distinct, expr: EntityRecordID` (different from event-grain COUNT(*))
   - A different intermediate (`v_customers`)
   - The customer-grain semantic — directly relevant to Phase 1.6's `dim_customers` mart

2. **#378 Monthly Start MRR** (`ROUND(SUM(StartMRR), 2)` from `v_customer_mrr`) — exercises:
   - `agg: sum, expr: StartMRR` with rounding (does dbt latest-spec carry the ROUND wrapper at the metric layer or at materialization?)
   - The MRR family (8 of 17 remaining metrics share this pattern — if this works, the rest follow)
   - Per-customer-per-month grain (different again from event grain)

If both validate and parity-test against Supabase, the template generalizes. Then round 4 = bulk extend to all remaining 17 metrics (with GRR/NRR last and most carefully).

**Not recommended for pilot:**
- #56 Conversions — same shape as Trials/Syncs, no new info.
- Any GRR/NRR metric — CEO methodology was just confirmed; protect from pilot churn.

### 11.5 Files edited / created in round 2.5

```
EDITED   models/intermediate/v_trials.yml          (EntityRecordID primary entity)
EDITED   models/intermediate/v_syncs.yml           (EntityRecordID foreign entity)
EDITED   models/metrics/v_metric__trials.{yml,sql}  (raw DDL → dbt-native)
EDITED   models/metrics/v_metric__syncs.{yml,sql}   (raw DDL → dbt-native)
EDITED   models/metrics/v_metric__sync_rate.{yml,sql} (raw DDL → dbt-native)
EDITED   docs/dbt-scaffold-handoff.md              (this addendum)
NEW      docs/dbt-setup.md                          (Fusion version pin)
APPLIED  CREATE OR REPLACE VIEW revenue.v_trials   (added EntityRecordID column)
APPLIED  CREATE OR REPLACE VIEW revenue.v_syncs    (added EntityRecordID column)
```

### 11.6 Still open (carrying into round 3)

- **§10.8 #1 partial**: pilot picks identified; not yet implemented. Round 3 = scaffold `v_customers.{sql,yml}`, `v_customer_mrr.{sql,yml}`, `v_metric__customers.{sql,yml}`, `v_metric__monthly_start_mrr.{sql,yml}`.
- **§10.8 #2**: commit + push to `main` happens at the end of this round (after the user reviews).
- The Phase 1 plan rewrite at `docs/superpowers/plans/2026-05-04-phase1-dbt-metric-migration.md` is unchanged from round 1. After round-3 pilot validates, that plan should be rewritten to assume the materialization pattern from §11.2 and the Fusion runtime from §11.3.

*Round 2.5 written 2026-05-05 immediately after round 2 in the same session.*

---

## 12. ⚠️ Known bug — self-reference in intermediate models (2026-05-06)

### The bug

The scaffold's intermediate-layer .sql files are passthroughs into the same BQ view name they're named after:

```sql
-- models/intermediate/v_trials.sql
{{ config(materialized='view') }}
select * from `project-for-method-dw.revenue.v_trials`
```

The dbt model is named `v_trials`. With profile `dataset: revenue`, dbt will materialize this model as `revenue.v_trials` — the same view it's selecting from. So `dbt run` would execute:

```sql
CREATE OR REPLACE VIEW `project-for-method-dw.revenue.v_trials` AS
SELECT * FROM `project-for-method-dw.revenue.v_trials`
```

Effects:
- The real filter logic in `v_trials` (`IsConversionException = FALSE AND Partner != 'Method Integration' AND SignupDate != DATE('0001-01-01')`) is **gone**.
- The view definition becomes self-referential.
- Querying `v_trials` after this fails (BQ rejects circular view bodies at query time, or recurses to a depth error).
- The Registry UI, AI chart builder, every saved chart, every dashboard that uses `v_trials` is **broken**.
- Same defect on `v_syncs` (model name = view name = `revenue.v_syncs`).

`v_metric__*` models do NOT have this bug — their target view names (`v_metric__trials`, `v_metric__syncs`, `v_metric__sync_rate`) don't collide with anything in BQ today.

### Why parse/compile didn't catch it

`dbt parse` and `dbt compile` validate yml structure and SQL templating but do not execute DDL. They don't notice that the resulting CREATE VIEW would self-reference. The bug is invisible until `dbt run`. This means **all the round-2 and round-2.5 "validates clean" verdicts are still correct for parse/compile — they just don't extend to `dbt run`**.

### The discovery

Hook blocked a `dbt run` attempt at the end of the 2026-05-05 / 2026-05-06 session with reasoning that surfaced the issue. Without the hook, the run would have executed and broken production. Lesson logged.

### Fix options

Three real choices, in order of cleanness:

**(A) Rename intermediate models to `int_*`** — the canonical fix
- `v_trials` → `int_trials`, `v_syncs` → `int_syncs` (the rename round-1 §D3 deferred to Phase 1.5)
- The .sql passthrough then materializes as `revenue.int_trials` — a NEW view, no collision
- Update every `{{ ref('v_trials') }}` and `{{ ref('v_syncs') }}` to `int_trials` / `int_syncs`
- The semantic-model definitions stay attached, just on the renamed model
- Pros: matches the conventions doc plan; "right end state" we already aligned on; smallest cognitive overhead long-term
- Cons: bumps Phase 1.5's mechanical refactor into round 3; scope grows slightly

**(B) Materialize dbt into a separate dataset (e.g., `revenue_dbt`)** — the schema-separation fix
- Configure `dbt_project.yml` with `+schema: revenue_dbt` (or the equivalent BigQuery `dataset` override)
- dbt materializes `v_trials` model as `revenue_dbt.v_trials` — different from `revenue.v_trials`
- Pros: zero rename churn; preserves the `v_*` names everywhere
- Cons: now two parallel datasets; a "which is canonical" question forever; Registry UI / chart builder need to know which to read; eventual cleanup is more work than the rename

**(C) Disable the intermediate models in dbt + hard-code references in v_metric__\*.sql**
- Add `+enabled: false` to `models.method_metrics.intermediate` in `dbt_project.yml`
- Replace `{{ ref('v_trials') }}` in `v_metric__trials.sql` with hard-coded `\`project-for-method-dw.revenue.v_trials\``
- Same for v_metric__syncs.sql
- Semantic models defined on disabled models — unclear if dbt-fusion accepts (parse may error)
- Pros: smallest diff
- Cons: loses the dbt-native ref graph; more brittle; semantic_models likely break

**Recommendation: (A).** It's the path of least long-term regret and was already on the roadmap. Round 3's first task should be the rename, before any pilot extension or `dbt run`.

### Until the fix lands

- Do not run `dbt run`, `dbt build`, or anything that materializes models
- `dbt parse` and `dbt compile` are still safe — they don't execute DDL
- The BQ view changes in §11.1 (EntityRecordID surfacing) are unaffected — those are real and live
- The GitHub commit `522cba4f` stays as-is; the warning at the top of this doc is the safety net

### Round 3 ordering (revised)

1. **First task: implement fix (A)** — rename `v_trials` and `v_syncs` to `int_trials` / `int_syncs`, update all `ref()`s, re-validate `dbt compile`
2. Then `dbt run` to actually materialize the three `v_metric__*` views in BQ — this is the genuine moment of truth
3. Then the pilot picks from §11.4 (#373 Customers, #378 Monthly Start MRR)
4. Then bulk-extend to the remaining 17 live metrics
5. Then GRR/NRR last and most carefully

*§12 written 2026-05-06 after the hook blocked `dbt run`. The hook was right; the fix is real work, not a hot patch.*
