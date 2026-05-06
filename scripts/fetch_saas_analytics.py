"""
Fetch authoritative NRR/GRR Excel from the SaaS Analytics Engine.
Endpoint: GetPeriodComparisonToExcel
Requires: Method VPN.

Usage: python fetch_saas_analytics.py 2024-02
       python fetch_saas_analytics.py 2024-02 --annual   # Feb 2023 -> Feb 2024
       python fetch_saas_analytics.py 2024-02 --monthly  # Jan 2024 -> Feb 2024
"""
import sys
import argparse
import urllib.request
import urllib.parse
from datetime import date
from pathlib import Path

API_TOKEN = "cd4cd0b9-a382-408c-8c52-07a4ecba511d"
BASE_URL = "https://internal1.methodintegration.com/SaasAnalyticsSrv/api/GetPeriodComparisonToExcel"
OUT_DIR = Path("/Users/nicolas/Desktop/method-metrics/sources/saas-analytics-engine")


def month_bounds(yyyymm: str):
    """Return (first_of_month, first_of_next_month) as date objects."""
    y, m = map(int, yyyymm.split("-"))
    first = date(y, m, 1)
    if m == 12:
        nxt = date(y + 1, 1, 1)
    else:
        nxt = date(y, m + 1, 1)
    return first, nxt


def shift_year(d: date, years: int) -> date:
    return d.replace(year=d.year + years)


def fmt(d: date) -> str:
    """Format date as 'YYYY-MM-DDT04:00' (UTC offset for ET)."""
    return f"{d.isoformat()}T04:00"


def build_url(p1_start: date, p1_end: date, p2_start: date, p2_end: date) -> str:
    qs = urllib.parse.urlencode({
        "API_Token": API_TOKEN,
        "Period1StartUTC": fmt(p1_start),
        "Period1EndUTC": fmt(p1_end),
        "Period2StartUTC": fmt(p2_start),
        "Period2EndUTC": fmt(p2_end),
    })
    return f"{BASE_URL}?{qs}"


def fetch(url: str, out_path: Path):
    print(f"GET {url}")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=300) as resp:
        ct = resp.headers.get("Content-Type", "")
        cd = resp.headers.get("Content-Disposition", "")
        print(f"  Content-Type: {ct}")
        print(f"  Content-Disposition: {cd}")
        data = resp.read()
        out_path.write_bytes(data)
        print(f"  Wrote {len(data):,} bytes -> {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("month", help="Target month YYYY-MM (Period 2)")
    grp = ap.add_mutually_exclusive_group(required=True)
    grp.add_argument("--annual", action="store_true",
                     help="Compare to same month 12 months prior")
    grp.add_argument("--monthly", action="store_true",
                     help="Compare to prior month")
    args = ap.parse_args()

    p2_start, p2_end = month_bounds(args.month)

    if args.annual:
        p1_start = shift_year(p2_start, -1)
        p1_end = shift_year(p2_end, -1)
        suffix = "annual"
    else:
        # Prior month
        if p2_start.month == 1:
            p1_start = date(p2_start.year - 1, 12, 1)
        else:
            p1_start = date(p2_start.year, p2_start.month - 1, 1)
        p1_end = p2_start
        suffix = "monthly"

    url = build_url(p1_start, p1_end, p2_start, p2_end)
    out = OUT_DIR / f"{args.month}-{suffix}.xlsx"
    fetch(url, out)


if __name__ == "__main__":
    main()
