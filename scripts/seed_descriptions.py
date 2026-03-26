"""
Seed the `description` column on the Supabase `metrics` table.

Usage:
  python3 scripts/seed_descriptions.py

Generates meaningful descriptions explaining what each metric measures,
what data it includes/excludes, and how derived metrics are calculated.

Requires: pip install requests
"""

import requests

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


# Hand-written descriptions for primitives and key metrics.
# These explain the business logic: what counts, what's excluded, and why.
PRIMITIVE_DESCRIPTIONS = {
    54: "Accounts that signed up for Method. Excludes conversion exceptions and Method Integration partners.",
    55: "Accounts that connected their accounting software (sync event).",
    56: "Accounts that made their first SaaS payment. Excludes conversion exceptions and Method Integration partners.",
    57: "SaaS revenue from first-time payers in the month. Excludes DEP products (Premium App, Enhancement Plan), conversion exceptions, and Method Integration partners.",
    58: "Revenue from DEP products (Premium App, Enhancement Plan) by new payers.",
    59: "Accounts that cancelled after previously converting to paid. Excludes conversion exceptions and Method Integration partners.",
    60: "Existing paying customers at the start of each month. Excludes new payers, conversion exceptions, and Method Integration partners.",
    61: "All SaaS revenue across all customers. Includes both new and existing payers. Excludes conversion exceptions and Method Integration partners.",
    62: "Revenue from DEP products (Premium App, Enhancement Plan) across all customers. Excludes conversion exceptions and Method Integration partners.",
    243: "US-only trials. Same as Trials but filtered to SignupCountry = United States.",
}

DERIVED_DESCRIPTIONS = {
    20: "Percentage of trials that convert to paid. Formula: Conversions / Trials × 100.",
    25: "Percentage of trials that sync their accounting software. Formula: Syncs / Trials × 100.",
    29: "Percentage of syncs that convert to paid. Formula: Conversions / Syncs × 100.",
    30: "Percentage of trials that eventually pay. Formula: Conversions / Trials × 100.",
    46: "Percentage of beginning-of-month customers that cancel. Formula: Churn / BOM Customers × 100.",
    48: "Net change in customer count. Formula: Conversions − Churn.",
    238: "Month-to-date scorecard combining all 9 core metrics: Trials, Syncs, Conversions, New Net SaaS, New DEP Revenue, Churn, BOM Customers, Total Net SaaS, Total DEP Revenue.",
    239: "MRR from newly converted accounts. Based on first SaaS invoice amount at conversion.",
    240: "MRR lost from churned accounts. Based on last SaaS amount before cancellation.",
    241: "Average MRR per converted account. Total converted MRR divided by conversion count.",
}

OTHER_DESCRIPTIONS = {
    134: "MRR gained from existing customers upgrading or expanding their plan.",
    135: "MRR lost from existing customers downgrading their plan.",
    136: "MRR lost from customers who fully cancelled.",
    218: "Net Revenue Retention: revenue retained from existing customers including expansion and churn.",
    224: "Distinct accounts that converted to paid within each month.",
    225: "Net DEP revenue after accounting for churn and downgrades on Premium App and Enhancement Plan.",
    226: "Rolling 30-day trailing NRR calculated over a 1-year cohort window.",
}

# Dimension template descriptions
DIMENSION_DESCRIPTIONS = {
    245: "Time dimension: group any metric by calendar month.",
    246: "Time dimension: group any metric by calendar week.",
    255: "Time dimension: group any metric by day.",
    249: "Dimension: break down any metric by marketing attribution channel.",
    250: "Dimension: break down any metric by signup country.",
    251: "Dimension: break down any metric by customer industry.",
    252: "Dimension: break down any metric by sync type (e.g. QuickBooks, Xero).",
    253: "Dimension: break down any metric by business vertical.",
    254: "No grouping dimension. Returns the raw aggregate without breakdown.",
}


def describe_breakdown(metric, metrics_map):
    """Generate description for breakdown/transform metrics based on their parent."""
    parent_id = metric.get("primitive_metric_id")
    if not parent_id:
        return None

    parent = metrics_map.get(parent_id)
    if not parent:
        return None

    parent_name = parent["name"]
    name = metric["name"]

    # Detect the breakdown type from the name
    if "Monthly" in name:
        return f"{parent_name} grouped by month."
    elif "Weekly" in name:
        return f"{parent_name} grouped by week."
    elif "YoY" in name:
        return f"{parent_name} compared year-over-year."
    elif "by Channel" in name:
        return f"{parent_name} broken down by marketing channel."
    elif "by Country" in name:
        return f"{parent_name} broken down by signup country."
    elif "by Sync Type" in name:
        return f"{parent_name} broken down by sync type (e.g. QuickBooks, Xero)."
    elif "by Industry" in name:
        return f"{parent_name} broken down by customer industry."
    elif "by Attribution" in name:
        return f"{parent_name} broken down by attribution channel."
    elif "by Vertical" in name:
        return f"{parent_name} broken down by business vertical."
    elif "Daily" in name:
        return f"{parent_name} grouped by day."

    return f"{parent_name} — {name.replace(parent_name, '').strip()} view."


def get_description(metric, metrics_map):
    """Get the best description for a metric."""
    mid = metric["id"]

    # Check all manual description dicts
    for desc_dict in [PRIMITIVE_DESCRIPTIONS, DERIVED_DESCRIPTIONS, OTHER_DESCRIPTIONS, DIMENSION_DESCRIPTIONS]:
        if mid in desc_dict:
            return desc_dict[mid]

    # Try generating for breakdowns/transforms
    if metric.get("primitive_metric_id"):
        return describe_breakdown(metric, metrics_map)

    return None


def main():
    print("Fetching all metrics...")
    metrics = fetch_all_metrics()
    print(f"Found {len(metrics)} metrics")

    metrics_map = {m["id"]: m for m in metrics}

    updated = 0
    skipped = 0

    for m in metrics:
        desc = get_description(m, metrics_map)

        if desc:
            old_desc = m.get("description") or ""
            if desc != old_desc:
                print(f"  [{m['id']}] {m['name']}: {desc}")
                update_description(m["id"], desc)
                updated += 1
            else:
                skipped += 1
        else:
            skipped += 1

    print(f"\nDone. Updated {updated}, skipped {skipped}")


if __name__ == "__main__":
    main()
