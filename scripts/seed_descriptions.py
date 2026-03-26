"""
Seed the `description` column on the Supabase `metrics` table.

Usage:
  python3 scripts/seed_descriptions.py

What it does:
  1. Adds a `description` TEXT column to the metrics table (if missing)
  2. Fetches all metrics that have SQL definitions (view_definition or chart_sql)
  3. Generates a short human-readable description from the SQL
  4. Writes descriptions back to Supabase

Requires: pip install requests
"""

import requests
import re

SUPABASE_URL = "https://agkubdpgnpwudzpzcvhs.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def fetch_all_metrics():
    """Fetch all metrics from Supabase."""
    res = requests.get(
        f"{SUPABASE_URL}/rest/v1/metrics?select=*&order=id",
        headers={**HEADERS, "Prefer": ""},
    )
    res.raise_for_status()
    return res.json()


def update_description(metric_id, description):
    """Write description to a single metric."""
    res = requests.patch(
        f"{SUPABASE_URL}/rest/v1/metrics?id=eq.{metric_id}",
        headers=HEADERS,
        json={"description": description},
    )
    res.raise_for_status()


def describe_from_sql(metric):
    """Generate a short description from the metric's SQL and metadata."""
    name = metric.get("name", "")
    sql = metric.get("view_definition") or metric.get("chart_sql") or ""
    formula = metric.get("formula") or ""
    metric_type = metric.get("metric_type", "")
    depends_on = metric.get("depends_on") or []

    if not sql and not formula:
        return None

    sql_upper = sql.upper()

    # Derived metrics with formula
    if formula and depends_on:
        return None  # handled separately after we know all metric names

    # Detect source table
    source = ""
    table_match = re.search(r'FROM\s+[`]?[\w.-]*\.(Account|Funnel|TransLineFlattened|method_forecast)', sql, re.IGNORECASE)
    if table_match:
        table_map = {
            "account": "Account table",
            "funnel": "Funnel events",
            "translineflattened": "Transaction lines",
            "method_forecast": "Forecast data",
        }
        source = table_map.get(table_match.group(1).lower(), table_match.group(1))

    # Detect what it counts/sums
    agg = "Count"
    if "SUM(SAASAMOUNT" in sql_upper or "SUM(SAASEXPENSE" in sql_upper:
        agg = "Revenue"
    elif "COUNT(DISTINCT" in sql_upper:
        agg = "Distinct count"
    elif "COUNT(*)" in sql_upper:
        agg = "Count"

    # Detect key filters
    filters = []
    if "EVENTTYPE = 'SYNC'" in sql_upper:
        filters.append("sync events")
    elif "EVENTTYPE = 'TRIAL'" in sql_upper:
        filters.append("trial events")
    if "CANCELLATIONDATE" in sql_upper and "!= DATE('0001-01-01')" in sql:
        filters.append("cancelled accounts")
    if "FIRSTSAASINVOICETXNDATE" in sql_upper and "!= DATE('0001-01-01')" in sql:
        filters.append("converted accounts")
    if "ISNEWPAYERTHISMONTH = TRUE" in sql_upper:
        filters.append("new payers")
    if "ISNEWPAYERTHISMONTH = FALSE" in sql_upper:
        filters.append("existing payers")
    if "PREMIUM APP" in sql_upper or "ENHANCEMENT PLAN" in sql_upper:
        filters.append("DEP products")
    if "BOMCUSTOMERGROUPING = 'CUSTOMER'" in sql_upper:
        filters.append("active customers")
    if "ATT_" in sql_upper and "FORMAT_DATE" in sql_upper and "GROUP BY" in sql_upper:
        filters.append("with channel attribution")

    # Detect grouping
    group_by = ""
    if "FORMAT_DATE" in sql_upper and "GROUP BY" in sql_upper:
        group_by = "monthly"
    if "SIGNUPCOUNTRY" in sql_upper and "GROUP BY" in sql_upper and "country" in name.lower():
        group_by = "by country"
    if "VERTICAL" in sql_upper and "GROUP BY" in sql_upper and "vertical" in name.lower():
        group_by = "by vertical"

    # Build description
    parts = []
    if agg == "Revenue":
        parts.append(f"Revenue from {source}" if source else "Revenue")
    elif agg == "Distinct count":
        parts.append(f"Unique accounts from {source}" if source else "Unique accounts")
    else:
        parts.append(f"Count from {source}" if source else "Count")

    if filters:
        parts[0] += f" — {', '.join(filters)}"

    if group_by:
        parts.append(group_by)

    desc = ". ".join(parts)

    # Trim and cap
    if len(desc) > 120:
        desc = desc[:117] + "..."

    return desc


def describe_derived(metric, all_metrics_map):
    """Generate description for derived/formula metrics."""
    formula = metric.get("formula", "")
    depends_on = metric.get("depends_on") or []

    if not formula or not depends_on:
        return None

    dep_names = []
    for dep_id in depends_on:
        dep = all_metrics_map.get(dep_id)
        if dep:
            dep_names.append(dep["name"])
        else:
            dep_names.append(f"metric #{dep_id}")

    if "SAFE_DIVIDE" in formula:
        if len(dep_names) >= 2:
            return f"{dep_names[0]} / {dep_names[1]} as a rate"
        return f"Ratio based on {', '.join(dep_names)}"

    return f"Calculated from {', '.join(dep_names)}"


def main():
    print("Fetching all metrics...")
    metrics = fetch_all_metrics()
    print(f"Found {len(metrics)} metrics")

    metrics_map = {m["id"]: m for m in metrics}

    updated = 0
    skipped = 0

    for m in metrics:
        # Skip if already has a description
        if m.get("description"):
            skipped += 1
            continue

        # Try derived first, then SQL-based
        desc = None
        if m.get("formula") and m.get("depends_on"):
            desc = describe_derived(m, metrics_map)
        else:
            desc = describe_from_sql(m)

        if desc:
            print(f"  [{m['id']}] {m['name']}: {desc}")
            update_description(m["id"], desc)
            updated += 1
        else:
            skipped += 1

    print(f"\nDone. Updated {updated}, skipped {skipped}")


if __name__ == "__main__":
    main()
