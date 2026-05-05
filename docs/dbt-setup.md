# dbt Fusion — Setup & Version Pin

The metric scaffold uses dbt Fusion (the new Rust-based dbt engine), not Core. Fusion is required for the latest semantic-layer spec; Core 1.12 (which would also support latest-spec) is not yet released on PyPI as of 2026-05-05.

## Pinned version

**Fusion `2.0.0-preview.175`** — installed and validated against this codebase on 2026-05-05.

Future preview releases may break the validation. Upgrade only after running `dbt compile` in a branch and confirming all metric models still parse.

## Install command

```bash
curl -fsSL https://public.cdn.getdbt.com/fs/install/install.sh | sh -s -- -v 2.0.0-preview.175
```

Default install location: `~/.local/bin/dbt`. The installer adds `~/.local/bin` to `PATH` and creates a `dbtf` alias in `~/.zshrc` so `dbt` (Fusion) and `dbtf` (Fusion) coexist with any pip-installed `dbt` (Core) on the same machine.

## Profile

`~/.dbt/profiles.yml` (per-user, not in this repo):

```yaml
method_metrics:
  target: dev
  outputs:
    dev:
      type: bigquery
      method: oauth
      project: project-for-method-dw
      dataset: revenue
      threads: 4
      timeout_seconds: 300
      location: US
      priority: interactive
```

Auth is via Application Default Credentials. If `gcloud auth application-default login` hasn't been run, run it once.

## Verifying the install

From the repo root:

```bash
DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1 dbt compile
```

Expected output: `Summary: 5 total | 5 success` (5 models, 3 metrics, 2 semantic models). Anything other than `5 success` means something is off — investigate before proceeding with `dbt run`.

## Why Fusion vs. Core

| | Fusion | Core 1.11 |
|---|---|---|
| Latest semantic-layer spec | ✅ | ❌ |
| `semantic_model:` nested on model | ✅ | ❌ (legacy `semantic_models:` top-level only) |
| Column-level `entity:` / `dimension:` blocks | ✅ | ❌ |
| Stable / GA release | ❌ (preview) | ✅ |
| pip-installable | ❌ | ✅ |

We chose latest-spec for cleaner authoring; that forced Fusion. Core 1.12 (when released) should accept the same syntax and be a drop-in if Fusion proves unstable.

## Known caveat

The semantic manifest validation step is skipped without a `dbt_cloud.yml` config (Fusion warns: `dbt1005`). Setting `DBT_ENGINE_NO_WARN_SEMANTIC_MANIFEST_VALIDATION=1` suppresses the warning. Full semantic-manifest validation requires dbt Cloud — out of scope for now.
