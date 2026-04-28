#!/usr/bin/env python3
"""Snapshot live metrics for pre/post diffing during registry cleanup.

Usage:
    python scripts/audit/snapshot_live_metrics.py <label>
        label: 'pre' or 'post' (or any tag) — written into the filename

Writes JSON to scripts/audit/snapshot-<label>-<YYYY-MM-DD>.json
"""
import json
import os
import sys
import urllib.request
from datetime import date

SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY'


def fetch_live_metrics():
    url = f'{SUPABASE_URL}/rest/v1/metrics?status=eq.live&select=*&order=id'
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def diff_snapshots(pre, post):
    """Return per-metric column-level diffs."""
    pre_by_id = {m['id']: m for m in pre}
    post_by_id = {m['id']: m for m in post}
    changes = []
    for mid in sorted(set(pre_by_id) | set(post_by_id)):
        a, b = pre_by_id.get(mid), post_by_id.get(mid)
        if a is None:
            changes.append({'id': mid, 'event': 'added', 'row': b})
            continue
        if b is None:
            changes.append({'id': mid, 'event': 'removed', 'row': a})
            continue
        col_diffs = {}
        for k in set(a) | set(b):
            if a.get(k) != b.get(k):
                col_diffs[k] = {'before': a.get(k), 'after': b.get(k)}
        if col_diffs:
            changes.append({'id': mid, 'name': b.get('name', a.get('name')), 'changes': col_diffs})
    return changes


def main():
    if len(sys.argv) < 2:
        print('Usage: snapshot_live_metrics.py <label>  (e.g. pre, post, diff)')
        sys.exit(2)
    label = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))

    if label == 'diff':
        pre_path = sys.argv[2]
        post_path = sys.argv[3]
        with open(pre_path) as f:
            pre = json.load(f)
        with open(post_path) as f:
            post = json.load(f)
        changes = diff_snapshots(pre, post)
        out = os.path.join(here, f'diff-{date.today().isoformat()}.json')
        with open(out, 'w') as f:
            json.dump(changes, f, indent=2, default=str)
        print(f'Diff written to {out}')
        print(f'{len(changes)} metric(s) changed')
        for c in changes:
            if 'changes' in c:
                cols = ', '.join(c['changes'].keys())
                print(f"  #{c['id']} {c['name']}: {cols}")
            else:
                print(f"  #{c['id']} {c['event']}")
        return

    rows = fetch_live_metrics()
    out = os.path.join(here, f'snapshot-{label}-{date.today().isoformat()}.json')
    with open(out, 'w') as f:
        json.dump(rows, f, indent=2, default=str)
    print(f'Wrote {len(rows)} live metrics to {out}')


if __name__ == '__main__':
    main()
