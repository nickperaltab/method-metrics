#!/usr/bin/env python3
"""Audit the `revenue_metrics` dataset — the shelf that is supposed to mean "verified".

Two checks, both from docs/superpowers/specs/2026-08-31-metrics-architecture-design.md §6:

  1. Dataset purity  — every view in `revenue_metrics` is owned by a dbt model.
                       A hand-cut view there carries a description and labels, so it
                       looks verified to anyone reading BQ metadata (and to the MCP).
  2. Live needs a definition — a model labelled `status: live` has every
                       non-negotiable field from docs/metric-definitions.md §1 filled in.

Warn-only by default: prints findings and exits 0 so it can run in CI without
blocking while the backlog is worked down. Pass --strict to fail the build once
the count reaches zero.

Usage:
    python3 scripts/check_metrics_shelf.py                # warn-only
    python3 scripts/check_metrics_shelf.py --strict       # non-zero exit on findings
    python3 scripts/check_metrics_shelf.py --views-file f # skip BQ, read view names from f

Auth: application-default credentials, or GOOGLE_APPLICATION_CREDENTIALS pointing at
a service-account keyfile (that is what CI does with the GCP_SA_KEY secret).
"""

import argparse
import json
import os
import sys

PROJECT = "project-for-method-dw"
SHELF_DATASET = "revenue_metrics"
MANIFEST = "target/manifest.json"

# Fields docs/metric-definitions.md §1 marks non-negotiable before a metric goes live.
REQUIRED_META = ("answers", "grain", "filters", "methodology_source", "parity_verified")

# `filters` is satisfied by the key merely being present, including an empty list.
# A derived metric like GRR often has no filters of its own — they live upstream in
# the primitives it divides. Writing `filters: []` records "considered, none apply",
# which is a different claim from leaving the field out.
PRESENCE_ONLY = ("filters",)


# --- pure functions (unit-testable without BigQuery) -------------------------


def dbt_shelf_models(manifest):
    """Model name -> node, for every dbt model landing in the shelf dataset."""
    out = {}
    for node in (manifest.get("nodes") or {}).values():
        if node.get("resource_type") != "model":
            continue
        if node.get("schema") != SHELF_DATASET:
            continue
        out[node.get("alias") or node["name"]] = node
    return out


def unmanaged_views(bq_view_names, dbt_model_names):
    """Views present in BigQuery that no dbt model owns."""
    return sorted(set(bq_view_names) - set(dbt_model_names))


def missing_from_bq(bq_view_names, dbt_model_names):
    """dbt models that should exist in BigQuery but don't — usually a missed `dbt run`."""
    return sorted(set(dbt_model_names) - set(bq_view_names))


def live_without_definition(dbt_models):
    """[(model, [missing fields])] for models labelled live with an incomplete definition."""
    findings = []
    for name, node in sorted(dbt_models.items()):
        config = node.get("config") or {}
        labels = config.get("labels") or {}
        if labels.get("status") != "live":
            continue
        meta = node.get("meta") or config.get("meta") or {}
        missing = [
            f for f in REQUIRED_META
            if ((f not in meta) if f in PRESENCE_ONLY else (not meta.get(f)))
        ]
        if not (node.get("description") or "").strip():
            missing.append("description")
        if missing:
            findings.append((name, missing))
    return findings


# --- BigQuery ----------------------------------------------------------------


def fetch_bq_views():
    from google.cloud import bigquery

    client = bigquery.Client(project=PROJECT)
    sql = (
        f"SELECT table_name FROM `{PROJECT}.{SHELF_DATASET}.INFORMATION_SCHEMA.VIEWS` "
        "ORDER BY table_name"
    )
    return [row.table_name for row in client.query(sql).result()]


# --- report ------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--strict", action="store_true", help="exit non-zero when anything is found")
    ap.add_argument("--views-file", help="newline-separated view names, instead of querying BQ")
    ap.add_argument("--manifest", default=MANIFEST)
    args = ap.parse_args()

    if not os.path.exists(args.manifest):
        print(f"FAIL: no manifest at {args.manifest} — run `dbt parse` first.", file=sys.stderr)
        return 1

    with open(args.manifest) as fh:
        manifest = json.load(fh)
    dbt_models = dbt_shelf_models(manifest)

    if args.views_file:
        with open(args.views_file) as fh:
            bq_views = [ln.strip() for ln in fh if ln.strip()]
    else:
        try:
            bq_views = fetch_bq_views()
        except Exception as exc:  # noqa: BLE001 — surface the real cause, don't mask it
            print(f"FAIL: could not read {SHELF_DATASET} from BigQuery: {exc}", file=sys.stderr)
            return 1

    unmanaged = unmanaged_views(bq_views, dbt_models)
    orphans = missing_from_bq(bq_views, dbt_models)
    undefined_live = live_without_definition(dbt_models)

    print(f"Shelf audit — {PROJECT}.{SHELF_DATASET}")
    print(f"  views in BigQuery : {len(bq_views)}")
    print(f"  owned by dbt      : {len(dbt_models)}")
    print()

    print(f"Check 1 — dataset purity: {len(unmanaged)} unmanaged view(s)")
    for name in unmanaged:
        print(f"    {name}")
    if unmanaged:
        print("  These are hand-cut in the console but carry descriptions and labels,")
        print("  so they read as verified to anyone querying BQ metadata. Adopt or drop them.")
    print()

    if orphans:
        print(f"dbt models missing from BigQuery: {len(orphans)} — did `dbt run` fail?")
        for name in orphans:
            print(f"    {name}")
        print()

    print(f"Check 3 — live needs a definition: {len(undefined_live)} incomplete")
    for name, missing in undefined_live:
        print(f"    {name}: missing {', '.join(missing)}")
    print()

    total = len(unmanaged) + len(undefined_live) + len(orphans)
    if total == 0:
        print("Clean. Every view on the shelf is dbt-owned and every live metric is defined.")
        return 0

    if args.strict:
        print(f"{total} finding(s) — failing because --strict is set.")
        return 1

    print(f"{total} finding(s) — warn-only, not failing the build. Add --strict to enforce.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
