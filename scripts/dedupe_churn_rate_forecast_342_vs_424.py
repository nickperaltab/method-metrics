#!/usr/bin/env python3
"""
Fix a duplicate: #424 ("Forecasted Accounts Churned Rate") was minted new
when #342 ("Forecasted Churn Rate %") already existed and computed the
same thing (AVG(Forecasted_Churn_Rate__) * 100, primitive, documented,
percent-scale). Verified month-by-month agreement (13/13 exact) between
#342's existing chart_sql and v_metric__churn_rate_forecasted before this
script runs -- see churn-rate-report.md.

Follows the established repoint pattern (#295, #296, #344, #345): keep the
existing id, point it at the new dbt view, rather than minting a new one.

1. Repoint #342 at v_metric__churn_rate_forecasted (thin pointer chart_sql).
2. Repoint #425's formula at #342 instead of #424; update depends_on.
3. Retire #424 following the established convention found on #317/#298/#341
   (status stays 'queued', description gets a "DEPRECATED — duplicate of
   #<id>... Kept as queued rather than deleted for audit trail." prefix).
   Name is left unchanged, matching that same precedent.

Aborts on the first write error. Reads every row back after writing.
"""
import json
import re
import sys
import urllib.request

ADMIN_EMAIL = "n.peralta-baron@method.me"
SB = "https://agkubdpgnpwudzpzcvhs.supabase.co/rest/v1/metrics"
DS = "project-for-method-dw.revenue_metrics"

with open("tracker.html") as f:
    ANON = re.search(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", f.read()).group(0)

H = {
    "apikey": ANON, "Authorization": f"Bearer {ANON}",
    "x-method-email": ADMIN_EMAIL, "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def req(method, url, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or "[]")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def pointer_sql(view):
    return (f"SELECT FORMAT_DATE('%Y-%m', period) AS period, value "
            f"FROM `{DS}.{view}` ORDER BY 1")


print("=== before ===")
_, before = req("GET", f"{SB}?select=id,name,status,view_name,chart_sql,formula,depends_on,description&id=in.(342,424,425)&order=id")
if not isinstance(before, list):
    sys.exit(f"ABORT reading metrics: {before}")
for m in before:
    print(f"  #{m['id']} {m['name']!r} view_name={m.get('view_name')!r}")

# 1. Repoint #342.
st, res = req("PATCH", f"{SB}?id=eq.342", {
    "view_name": "v_metric__churn_rate_forecasted",
    "chart_sql": pointer_sql("v_metric__churn_rate_forecasted"),
    "metric_type": "derived",
    # Preserve the existing description; extend, don't overwrite.
    "description": (
        "Expected churn rate this month, from the forecast spreadsheet. "
        "Now backed by v_metric__churn_rate_forecasted (dbt), which reads "
        "the same Forecasted_Churn_Rate__ column and rescales it the same "
        "way (AVG * 100). Verified 2026-08-17: 13/13 months match the "
        "pre-existing chart_sql exactly. Denominator for Accounts Churned "
        "Rate Attainment (#425)."
    ),
    "notes": (
        "Source: method_forecast spreadsheet. Repointed 2026-08-17 at the "
        "dbt-managed v_metric__churn_rate_forecasted -- #424 was a "
        "duplicate minted by mistake and is deprecated in its favor (see "
        "#424's description). Consider moving to BigQuery ETL."
    ),
})
if st not in (200, 204) or (isinstance(res, list) and not res):
    sys.exit(f"ABORT repoint #342: HTTP {st} {res}")
print("\n#342 repointed at v_metric__churn_rate_forecasted")

# 2. Repoint #425's formula at #342.
st, res = req("PATCH", f"{SB}?id=eq.425", {
    "formula": "SAFE_DIVIDE({345}, {342}) * 100",
    "depends_on": [345, 342],
    "description": (
        "Accounts Churned Rate Trajectory (#345) as a percentage of "
        "Forecasted Churn Rate % (#342), both already percentage-scale -- "
        "same formula shape as every other attainment metric on Method "
        "Monday (#416/#418/#419/#420/#421/#422/#423). Inverted metric on "
        "the Pace view: over 100% is bad (more churn than forecast), "
        "unlike every other attainment tile on the page. Repointed "
        "2026-08-17 from #424 (deprecated duplicate) to #342 (the "
        "pre-existing metric)."
    ),
})
if st not in (200, 204) or (isinstance(res, list) and not res):
    sys.exit(f"ABORT repoint #425: HTTP {st} {res}")
print("#425 formula repointed at #342")

# 3. Retire #424, following the #317/#298/#341 convention.
st, res = req("PATCH", f"{SB}?id=eq.424", {
    "description": (
        "DEPRECATED — duplicate of Forecasted Churn Rate % (#342), which "
        "already existed and computes the same thing (AVG(Forecasted_"
        "Churn_Rate__) * 100 from method_forecast, percent-scale). Minted "
        "in error 2026-08-17 without checking for an existing forecasted "
        "churn rate metric first; #342 was missed in that check. Not used "
        "by any scorecard or downstream metric as of 2026-08-17 (the "
        "Method Monday Churn Rate section and #425's attainment formula "
        "both point at #342 instead). Kept as queued rather than deleted "
        "for audit trail."
    ),
})
if st not in (200, 204) or (isinstance(res, list) and not res):
    sys.exit(f"ABORT retire #424: HTTP {st} {res}")
print("#424 retired (description prefixed, status left queued)")

print("\n=== after (read-back) ===")
_, after = req("GET", f"{SB}?select=id,name,status,view_name,chart_sql,formula,depends_on,description&id=in.(342,424,425)&order=id")
if not isinstance(after, list):
    sys.exit(f"ABORT read-back: {after}")
for m in after:
    print(json.dumps(m, indent=2))
