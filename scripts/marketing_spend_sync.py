#!/usr/bin/env python3
"""Sync marketing spend + CAC actuals from the marketing tracker sheet into BigQuery.

Source: "2026 Trial + Sync + CAC:ARR Tracker" Google Sheet (marketing-owned).
The CAC:ARR tabs are human-formatted: channel blocks stacked vertically, each
block a fixed set of measure rows (Trials, Customers, spend lines, CAC:ARR),
months across in Budget/Forecast/Actuals column triplets.

This script unpivots that layout into long rows and loads
`project-for-method-dw.marketing.sheet_cac_raw` (WRITE_TRUNCATE, full rebuild
each run). Downstream dbt models (int_marketing_spend, int_channel_cac) do the
cleaning; this script stays layout-only so a sheet reshuffle breaks loudly here
and nowhere else.

Auth: application-default credentials (needs spreadsheets.readonly; the sheet
is org-shared). Run: python3 scripts/marketing_spend_sync.py
"""

import datetime
import os
import re
import sys

import google.auth
from google.auth.transport.requests import AuthorizedSession
from google.cloud import bigquery

# Repo is public — the tracker's sheet ID stays out of git. Get it from the
# sheet URL (the segment after /d/) and export it before running.
SHEET_ID = os.environ.get("MARKETING_TRACKER_SHEET_ID") or sys.exit(
    "ERROR: set MARKETING_TRACKER_SHEET_ID (the id in the tracker sheet's URL)")
TABS = ["CAC:ARR 2025", "CAC:ARR 2026"]
PROJECT = "project-for-method-dw"
DATASET = "marketing"
TABLE = "sheet_cac_raw"

# Block title -> canonical channel. Canonical names match
# revenue.int_customers.AttributionChannel where a 1:1 mapping exists.
# Sub-splits and rollups get explicit non-canonical names so int_channel_cac
# can select exactly the mutually-exclusive channel set.
BLOCK_CHANNEL = {
    "PPC (trial gen + branding)": "PPC",
    "PPC (trial gen only)": "PPC_TRIALGEN",
    "PPC (Branding/Social/P-Max/Tests)": "PPC_BRANDING",
    "Email": "Email",
    "SEO": "SEO",
    "OPN": "OPN",
    "Partners (w/ event spend)": "Partners",
    "Partners (w/o event spend)": "Partners_NO_EVENTS",
    "Total": "TOTAL",
}

MONTHS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}
SCENARIOS = ("Budget", "Forecast", "Actuals")


def fetch_grid(session, tab):
    url = (f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/"
           f"{tab}!A1:BZ250?valueRenderOption=UNFORMATTED_VALUE")
    r = session.get(url)
    r.raise_for_status()
    return r.json().get("values", [])


def cell(grid, r, c):
    row = grid[r] if r < len(grid) else []
    return row[c] if c < len(row) else ""


SHEETS_EPOCH = datetime.date(1899, 12, 30)  # Google Sheets day-serial origin


def month_columns(header_row):
    """Row 1 holds month labels at the first column of each Budget/Forecast/
    Actuals triplet. The cells are real dates, so UNFORMATTED_VALUE returns
    day serials; tolerate 'Jan 2026'-style strings too. Returns [(col, date)]."""
    out = []
    for c, v in enumerate(header_row):
        month = None
        if isinstance(v, (int, float)) and not isinstance(v, bool) and 36526 <= v <= 55153:
            d = SHEETS_EPOCH + datetime.timedelta(days=int(v))  # 2000..2050 guard
            month = d.replace(day=1)
        else:
            m = re.fullmatch(r"([A-Z][a-z]{2})\s+(\d{4})", str(v).strip())
            if m and m.group(1) in MONTHS:
                month = datetime.date(int(m.group(2)), MONTHS[m.group(1)], 1)
        if month:
            out.append((c, month))
    return out


def parse_tab(session, tab):
    grid = fetch_grid(session, tab)
    if not grid:
        sys.exit(f"ERROR: tab {tab!r} came back empty")
    months = month_columns(grid[0])
    if not months:
        sys.exit(f"ERROR: no 'Mon YYYY' labels in row 1 of {tab!r} — layout changed?")

    rows = []
    r = 0
    while r < len(grid):
        title = str(cell(grid, r, 0)).strip()
        # A block starts where col A holds a title and the next row is 'Trials'.
        if title and str(cell(grid, r + 1, 0)).strip().lower() == "trials":
            channel = BLOCK_CHANNEL.get(title, f"UNMAPPED:{title}")
            mr = r + 1
            while mr < len(grid):
                measure = str(cell(grid, mr, 0)).strip()
                if not measure:
                    break
                for mcol, month in months:
                    for off, scenario in enumerate(SCENARIOS):
                        v = cell(grid, mr, mcol + off)
                        if isinstance(v, (int, float)) and not isinstance(v, bool):
                            rows.append({
                                "source_tab": tab, "block": title, "channel": channel,
                                "measure": measure, "month": month.isoformat(),
                                "scenario": scenario, "value": float(v),
                            })
                mr += 1
            r = mr
        else:
            r += 1
    return rows


def main():
    creds, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly",
                "https://www.googleapis.com/auth/cloud-platform"])
    session = AuthorizedSession(creds)

    all_rows = []
    for tab in TABS:
        rows = parse_tab(session, tab)
        blocks = sorted({x["block"] for x in rows})
        print(f"{tab}: {len(rows)} rows from {len(blocks)} blocks: {blocks}")
        all_rows.extend(rows)

    unmapped = sorted({x["block"] for x in all_rows if x["channel"].startswith("UNMAPPED:")})
    if unmapped:
        print(f"WARNING: unmapped blocks (loaded with UNMAPPED: prefix): {unmapped}")

    bq = bigquery.Client(project=PROJECT, credentials=creds)
    bq.create_dataset(bigquery.Dataset(f"{PROJECT}.{DATASET}"), exists_ok=True)
    job = bq.load_table_from_json(
        all_rows,
        f"{PROJECT}.{DATASET}.{TABLE}",
        job_config=bigquery.LoadJobConfig(
            write_disposition="WRITE_TRUNCATE",
            schema=[
                bigquery.SchemaField("source_tab", "STRING"),
                bigquery.SchemaField("block", "STRING"),
                bigquery.SchemaField("channel", "STRING"),
                bigquery.SchemaField("measure", "STRING"),
                bigquery.SchemaField("month", "DATE"),
                bigquery.SchemaField("scenario", "STRING"),
                bigquery.SchemaField("value", "FLOAT64"),
            ],
        ),
    )
    job.result()
    print(f"Loaded {len(all_rows)} rows -> {PROJECT}.{DATASET}.{TABLE}")


if __name__ == "__main__":
    main()
