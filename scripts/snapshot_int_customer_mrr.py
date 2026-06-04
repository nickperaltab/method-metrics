#!/usr/bin/env python3
"""Snapshot int_customer_mrr to JSON for pre/post migration parity.

Usage:
    python scripts/snapshot_int_customer_mrr.py --source view --out scripts/audit/snapshot-int-customer-mrr-pre-migration.json
    python scripts/snapshot_int_customer_mrr.py --source model --out scripts/audit/snapshot-int-customer-mrr-post-migration.json

--source view  -> documents that we're querying the orphaned BQ view (project-for-method-dw.revenue.int_customer_mrr)
--source model -> documents that we're querying the migrated dbt model at the same FQN

Both --source values query the same fully qualified name. The flag is a label,
not a router. The migration replaces the BQ object in place.

Schema note: the actual view uses mixed-case columns (Month, EntityRecordID,
Company, StartMRR, Cancellations, Downgrades, Expansions, NewMRR, p1_saas,
p2_saas) plus dimension columns (Segment, UserTier, HasDEP, AttributionChannel,
SignupCountry, Vertical, SyncType). Grain is (Month x EntityRecordID), so the
snapshot preserves that grain directly without further aggregation.
"""
import argparse
import json
import os
import sys
from datetime import date
from decimal import Decimal

from google.cloud import bigquery

PROJECT = "project-for-method-dw"
DATASET = "revenue"
TABLE = "int_customer_mrr"
TRAILING_MONTHS = 24

SQL_TEMPLATE = """
SELECT
  FORMAT_DATE('%Y-%m-01', Month) AS Month,
  CAST(EntityRecordID AS STRING) AS EntityRecordID,
  Company,
  ROUND(p1_saas, 4) AS p1_saas,
  ROUND(p2_saas, 4) AS p2_saas,
  ROUND(StartMRR, 4) AS StartMRR,
  ROUND(Cancellations, 4) AS Cancellations,
  ROUND(Downgrades, 4) AS Downgrades,
  ROUND(Expansions, 4) AS Expansions,
  ROUND(NewMRR, 4) AS NewMRR,
  Segment,
  UserTier,
  HasDEP,
  AttributionChannel,
  SignupCountry,
  Vertical,
  SyncType
FROM `{fqn}`
WHERE Month >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL {trailing_months} MONTH)
  AND Month < DATE_TRUNC(CURRENT_DATE(), MONTH)
ORDER BY Month, EntityRecordID
"""


def _jsonable(v):
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, date):
        return v.isoformat()
    return v


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source",
        choices=["view", "model"],
        required=True,
        help="Documentation label; both query the same FQN",
    )
    parser.add_argument("--out", required=True, help="Output JSON path")
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite existing --out file",
    )
    parser.add_argument(
        "--fqn",
        default=None,
        help=(
            "Override the default FQN "
            f"({PROJECT}.{DATASET}.{TABLE}). Use for dev/staging builds."
        ),
    )
    args = parser.parse_args()

    fqn = args.fqn or f"{PROJECT}.{DATASET}.{TABLE}"
    sql = SQL_TEMPLATE.format(fqn=fqn, trailing_months=TRAILING_MONTHS)

    if os.path.exists(args.out) and not args.force:
        print(
            f"ERROR: {args.out} already exists. Pass --force to overwrite.\n"
            f"       (This guard exists because the pre-migration snapshot is the parity baseline; do not clobber by accident.)",
            file=sys.stderr,
        )
        sys.exit(2)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)

    client = bigquery.Client(project=PROJECT)
    rows = list(client.query(sql).result())
    out = [{k: _jsonable(v) for k, v in r.items()} for r in rows]

    if not out:
        print(
            f"ERROR: query returned 0 rows from {fqn}. "
            f"Refusing to overwrite snapshot. Check table existence and BQ permissions.",
            file=sys.stderr,
        )
        sys.exit(2)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            {"source": args.source, "row_count": len(out), "rows": out},
            f,
            indent=2,
        )
    print(f"Snapshot written: {args.out} ({len(out)} rows)")


if __name__ == "__main__":
    main()
