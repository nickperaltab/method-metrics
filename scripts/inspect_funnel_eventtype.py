#!/usr/bin/env python3
"""
Read-only inspection of project-for-method-dw.revenue.Funnel to nail down what
`EventType` actually is — stored column vs derived label — and the full set of
values, so we can ground the Syncs (#55) definition in the source.

No writes, no DDL changes. Just SELECTs / INFORMATION_SCHEMA reads.
"""
from google.cloud import bigquery

PROJECT = "project-for-method-dw"
DATASET = "revenue"
TABLE = "Funnel"
client = bigquery.Client(project=PROJECT)


def q(sql):
    return list(client.query(sql).result())


def section(title):
    print("\n" + "=" * 70 + f"\n{title}\n" + "=" * 70)


# 1) Object type (table vs view) + table-level description
section("1. Object type + description")
rows = q(f"""
SELECT table_type
FROM `{PROJECT}.{DATASET}.INFORMATION_SCHEMA.TABLES`
WHERE table_name = '{TABLE}'
""")
table_type = rows[0].table_type if rows else "(not found)"
print(f"{TABLE} table_type = {table_type}")

opt = q(f"""
SELECT option_name, option_value
FROM `{PROJECT}.{DATASET}.INFORMATION_SCHEMA.TABLE_OPTIONS`
WHERE table_name = '{TABLE}' AND option_name = 'description'
""")
print("description:", opt[0].option_value if opt else "(none)")

# If it's a view, dump the DDL — this is the real definition of EventType.
if "VIEW" in (table_type or ""):
    section("1b. VIEW DDL (how EventType is derived)")
    ddl = q(f"""
    SELECT view_definition
    FROM `{PROJECT}.{DATASET}.INFORMATION_SCHEMA.VIEWS`
    WHERE table_name = '{TABLE}'
    """)
    print(ddl[0].view_definition if ddl else "(no view_definition)")

# 2) Column schema
section("2. Column schema")
cols = q(f"""
SELECT column_name, data_type
FROM `{PROJECT}.{DATASET}.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = '{TABLE}'
ORDER BY ordinal_position
""")
for c in cols:
    print(f"  {c.column_name:32} {c.data_type}")
colset = {c.column_name for c in cols}

# 3) EventType distribution. Guard for which id/date columns actually exist.
section("3. EventType distribution")
has_ca = "CompanyAccount" in colset
has_ent = "EntityRecordID" in colset
# pick a plausible date column for range
date_col = next((d for d in ("SyncDate", "EventDate", "Date", "TxnDate", "CreatedDate")
                 if d in colset), None)

sel = ["EventType", "COUNT(*) AS n_rows"]
if has_ca:
    sel.append("COUNT(DISTINCT CompanyAccount) AS distinct_company_accounts")
if has_ent:
    sel.append("COUNT(DISTINCT EntityRecordID) AS distinct_entities")
if date_col:
    sel.append(f"MIN(`{date_col}`) AS min_date")
    sel.append(f"MAX(`{date_col}`) AS max_date")

dist = q(f"""
SELECT {', '.join(sel)}
FROM `{PROJECT}.{DATASET}.{TABLE}`
GROUP BY EventType
ORDER BY n_rows DESC
""")
print(f"(date range column used: {date_col})")
for r in dist:
    parts = [f"EventType={r.EventType!r:28}", f"rows={r.n_rows:>9,}"]
    if has_ca:
        parts.append(f"accts={r.distinct_company_accounts:>9,}")
    if has_ent:
        parts.append(f"entities={r.distinct_entities:>9,}")
    if date_col:
        parts.append(f"{r.min_date}..{r.max_date}")
    print("  " + "  ".join(parts))

# 3b) What does int_syncs expose as SyncDate? (the metric groups by SyncDate)
for v in ("int_syncs", "int_conversions", "int_trials"):
    section(f"3b. {v} DDL (what date column it exposes)")
    ddl = q(f"""
    SELECT view_definition
    FROM `{PROJECT}.{DATASET}.INFORMATION_SCHEMA.VIEWS`
    WHERE table_name = '{v}'
    """)
    print(ddl[0].view_definition if ddl else "(not a view / not found)")

# 4) For 'Sync' specifically: does COUNT(*) == COUNT(DISTINCT CompanyAccount)?
if has_ca:
    section("4. 'Sync' grain check (last 24 months)")
    g = q(f"""
    SELECT
      COUNT(*) AS n_rows,
      COUNT(DISTINCT CompanyAccount) AS distinct_company_accounts
      {', COUNT(DISTINCT EntityRecordID) AS distinct_entities' if has_ent else ''}
    FROM `{PROJECT}.{DATASET}.{TABLE}`
    WHERE EventType = 'Sync'
      {f"AND `{date_col}` >= DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH)" if date_col else ''}
    """)[0]
    print(f"  rows                     = {g.n_rows:,}")
    print(f"  distinct CompanyAccount  = {g.distinct_company_accounts:,}")
    if has_ent:
        print(f"  distinct EntityRecordID  = {g.distinct_entities:,}")
    print(f"  rows == distinct CompanyAccount ? "
          f"{g.n_rows == g.distinct_company_accounts}")

    # Does SyncDate (=SignupDate) differ from the real first-sync date?
    section("4b. SyncDate(=SignupDate) vs CustDatFirstSyncCompleted")
    d = q(f"""
    SELECT
      COUNTIF(CustDatFirstSyncCompleted IS NULL
              OR CustDatFirstSyncCompleted = DATE('0001-01-01')) AS no_realsync_date,
      COUNTIF(`Date` = CustDatFirstSyncCompleted) AS same_day,
      COUNTIF(`Date` != CustDatFirstSyncCompleted
              AND CustDatFirstSyncCompleted > DATE('0001-01-01')) AS different_day,
      COUNT(*) AS total
    FROM `{PROJECT}.{DATASET}.{TABLE}`
    WHERE EventType = 'Sync'
    """)[0]
    print(f"  total Sync rows                         = {d.total:,}")
    print(f"  Date == CustDatFirstSyncCompleted       = {d.same_day:,}")
    print(f"  Date != real sync date (both present)   = {d.different_day:,}")
    print(f"  no real-sync date on record             = {d.no_realsync_date:,}")

# 5) Sample Sync rows
section("5. Sample 'Sync' rows")
sample = q(f"""
SELECT * FROM `{PROJECT}.{DATASET}.{TABLE}`
WHERE EventType = 'Sync'
ORDER BY {date_col + ' DESC' if date_col else 'EventType'}
LIMIT 5
""")
for r in sample:
    print("  " + str(dict(r)))
