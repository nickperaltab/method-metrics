#!/usr/bin/env python3
"""
Shared helpers for the MWD (Manufacturing & Distribution) board-prep analysis.

Client setup mirrors scripts/retail_grr_diagnostic.py exactly (google-cloud-bigquery,
default project auth). All later scripts in scripts/mwd-board-prep/ should import from
this module rather than re-deriving the client or constants.

Two industry "instruments" exist in the warehouse and do NOT perfectly agree:
  - Instrument A (V7, customer-side): v7_classification.v_entity_primary_label.l1,
    joined on customer_record_id = EntityRecordID. This is the newer, more complete
    classification.
  - Instrument B (legacy, trial-side): int_trials.Vertical self-report field, values
    'Manufacturing (MWD)' / 'Wholesale and distribution services (MWD)'. Self-reported
    at trial signup — noisier, and known (per vault notes) to under-report manufacturers.

PUBLIC REPO: this project is public. Never commit MRR or customer-name-bearing data.
All query outputs from this directory go to scripts/mwd-board-prep/out/, which is
gitignored.
"""
from google.cloud import bigquery

PROJECT = "project-for-method-dw"

# Instrument A: V7 classification label table (customer-side, joined on EntityRecordID)
LABELS = "project-for-method-dw.v7_classification.v_entity_primary_label"

# Instrument A: the L1 value for Manufacturing & Distribution
MWD_L1 = "Manufacturing & Distribution"

# Instrument B: legacy self-reported Vertical values that map to MWD (trial-side)
MWD_LEGACY = ("Manufacturing (MWD)", "Wholesale and distribution services (MWD)")

# Board-prep analysis periods (global constraint: exclude July 2026, incomplete month)
H1_2026_START = "2026-01-01"
H1_2026_END = "2026-06-30"
LY_H1_START = "2025-01-01"
LY_H1_END = "2025-06-30"

_client = bigquery.Client(project=PROJECT)


def run_query(sql):
    """Run `sql` against BigQuery and return a list[dict]. BQ may return all values
    as strings for some result shapes — callers should coerce numerics explicitly."""
    return [dict(row) for row in _client.query(sql).result()]
