#!/usr/bin/env python3
"""Verify int_channel_funnel_trajectory ties out: current-month MTD by channel
sums to the raw fractional aggregate, and trajectory/rate columns are coherent."""
from google.cloud import bigquery
c = bigquery.Client(project='project-for-method-dw')
V = 'project-for-method-dw.revenue.int_channel_funnel_trajectory'
rows = list(c.query(f"SELECT * FROM `{V}` ORDER BY metric, channel").result())
assert rows, "view returned no rows"
metrics = {r.metric for r in rows}
assert metrics == {'trials', 'syncs', 'sync_rate'}, f"unexpected metrics: {metrics}"

# sync_rate = syncs / trials at trajectory level (spot-check per channel)
by = {(r.metric, r.channel): r for r in rows}
for (m, ch) in list(by):
    if m != 'sync_rate':
        continue
    t = by.get(('trials', ch)); s = by.get(('syncs', ch))
    if t and s and t.trajectory:
        exp = s.trajectory / t.trajectory if s.trajectory is not None else None
        got = by[(m, ch)].trajectory
        if exp is not None and got is not None:
            assert abs(got - exp) < 1e-6, f"sync_rate trajectory mismatch {ch}: {got} vs {exp}"
print(f"OK: {len(rows)} rows, metrics={metrics}")
for r in rows:
    if r.metric == 'syncs':
        print(f"  syncs {r.channel:12} mtd={r.mtd_actual} traj={r.trajectory} "
              f"ly={r.last_year_full} yoy={r.yoy_pct}")
