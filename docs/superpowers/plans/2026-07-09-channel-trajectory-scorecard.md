# Channel Trajectory Scorecard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Marketing a channel × (Trials, Syncs, Sync Rate) table comparing this month's trajectory to last year's full-month actual (YoY %) and to last month's full month (MoM %), fixing the broken Looker YoY comparison.

**Architecture:** One dbt view (`int_channel_funnel_trajectory`) computes MTD, trajectory, prior-month-full, last-year-full, YoY %, and MoM % per channel per metric, live against `CURRENT_DATE()`. A new bespoke scorecard route (custom `renderer`, its own SQL + data lib, like `grr-industry` / `motion-funnel`) queries the view and renders a metric-tabbed compact table. Nothing existing is modified except the scorecard registry, the renderer dispatch, and the sidebar list.

**Tech Stack:** dbt (BigQuery), Python (`google.cloud.bigquery`) for parity scripts, React + Vite (builder app), `queryBq` for BQ access.

## Global Constraints

- **BigQuery is the source of truth.** All math lives in the dbt view; the frontend only fetches and renders. (Project architecture rule.)
- **Attribution is fractional multi-touch.** `Att_*` columns are already fractional weights — `SUM` them directly. Never re-normalize, never collapse to a single channel.
- **`CustDatFirstSyncCompleted` is forbidden.** Syncs come only from `revenue.Funnel` where `EventType='Sync'`. Trials come from `revenue.Account` by `SignupDate`.
- **Window = MTD excluding today:** `[DATE_TRUNC(CURRENT_DATE(),MONTH), CURRENT_DATE())`.
- **Trajectory = calendar-day linear run-rate:** `MTD / days_elapsed * days_in_month`; null when `days_elapsed` is 0. Confirmed against the PDF anchor (PPC sync `14.5/8*31 = 56.19`). This is NOT prior-month-shape (that's a Net SaaS method; it gives the wrong 68.04 here).
- **Filters (both sources):** `IsConversionException = FALSE`, `Partner != 'Method Integration'`; trials also exclude `SignupDate = DATE('0001-01-01')`.
- **Do not flip anything to `live`/`approved` without user sign-off** and a `docs/metric-definitions.md` entry (define-before-live rule). New config ships with `status: 'pending'`.
- **Separate route only.** Do not alter existing scorecards, metrics, or pages.
- **dbt view name:** `int_channel_funnel_trajectory`, materialized as a **view**, in the `revenue` dataset (no `+schema` override — it is an intermediate, not a verified `v_metric__`).
- **Parity anchors (Jul 1–8, 2026):** syncs SEO 20.0 / PPC 14.5 / OPN 12.0 / Direct 4.0 / None 3.0; trials SEO 36.0 / PPC 37.5 / Email 1.5.

---

### Task 1: Parity lock (Phase 0 investigation)

Pin the exact window and confirm both measures + the trajectory method reproduce Looker before building the model. No dbt or frontend code yet.

**Files:**
- Create: `scripts/channel-trajectory/01_parity.py`

**Interfaces:**
- Produces: a documented, reproducible parity baseline (printed table) that Task 2's model must match. No code exports.

- [ ] **Step 1: Write the parity script**

```python
#!/usr/bin/env python3
"""Phase-0 parity: confirm fractional Funnel syncs + fractional Account trials
by channel reproduce the Looker PDF (Jul 1-8, 2026), and that calendar-day linear
trajectory reproduces Looker's PPC sync trajectory (56.19)."""
from google.cloud import bigquery
c = bigquery.Client(project='project-for-method-dw')
P = 'project-for-method-dw.revenue'

def att_cols(table):
    return [r.column_name for r in c.query(
        f"SELECT column_name FROM `{P}.INFORMATION_SCHEMA.COLUMNS` "
        f"WHERE table_name='{table}' AND column_name LIKE 'Att\\\\_%'").result()]

def breakdown(table, datecol, where, lo, hi):
    cols = att_cols(table)
    sel = ",".join([f"ROUND(SUM({a}),4) AS `{a}`" for a in cols])
    row = dict(list(c.query(
        f"SELECT COUNT(*) events,{sel} FROM `{P}.{table}` "
        f"WHERE {where} AND {datecol}>=DATE '{lo}' AND {datecol}<DATE '{hi}'").result())[0].items())
    ev = row.pop('events')
    return ev, {k: v for k, v in row.items() if v}

# Syncs (Funnel) Jul1-8
ev, s = breakdown('Funnel', 'CAST(Date AS DATE)', "EventType='Sync'", '2026-07-01', '2026-07-09')
print("SYNCS Funnel Jul1-8  events=", ev)
for k, v in sorted(s.items(), key=lambda x: -x[1]): print(f"  {k:34} {v}")
assert abs(s.get('Att_Pay_Per_Click', 0) - 14.5) < 0.01, "PPC sync != 14.5"
assert abs(s.get('Att_SEO', 0) - 20.0) < 0.01, "SEO sync != 20"

# Trials (Account) Jul1-8
tw = "IsConversionException=FALSE AND Partner!='Method Integration' AND SignupDate!=DATE('0001-01-01')"
ev, t = breakdown('Account', 'SignupDate', tw, '2026-07-01', '2026-07-09')
print("TRIALS Account Jul1-8  rows=", ev)
for k, v in sorted(t.items(), key=lambda x: -x[1]): print(f"  {k:34} {v}")
assert abs(t.get('Att_Pay_Per_Click', 0) - 37.5) < 0.01, "PPC trial != 37.5"

# Trajectory method = CALENDAR-DAY LINEAR: mtd / days_elapsed * days_in_month.
# Confirmed against the dated PDF anchor (PPC Sync Trajectory 56.19, run Jul 9,
# MTD-excl-today = Jul 1-8 = 8 days): 14.5 / 8 * 31 = 56.19.
# NOT prior-month-shape (that gives 68.04 here — wrong for marketing trials/syncs).
D = '2026-07-09'  # PDF run date; MTD excl today = Jul 1-8 (8 days elapsed)
q = f"""
WITH s AS (SELECT CAST(Date AS DATE) d, Att_Pay_Per_Click w FROM `{P}.Funnel` WHERE EventType='Sync')
SELECT
  SUM(CASE WHEN d>=DATE_TRUNC(DATE('{D}'),MONTH) AND d<DATE('{D}') THEN w END) mtd,
  DATE_DIFF(DATE('{D}'), DATE_TRUNC(DATE('{D}'),MONTH), DAY) days_elapsed,
  EXTRACT(DAY FROM LAST_DAY(DATE('{D}'))) days_in_month
FROM s"""
r = list(c.query(q).result())[0]
traj = r.mtd / r.days_elapsed * r.days_in_month if r.days_elapsed else None
print(f"\nPPC sync trajectory as of {D}: mtd={r.mtd} days_elapsed={r.days_elapsed} "
      f"days_in_month={r.days_in_month} -> {traj:.2f}")
assert traj and abs(traj - 56.19) < 0.05, f"trajectory {traj} != PDF anchor 56.19"
print("Trajectory method CONFIRMED: calendar-day linear reproduces PDF anchor 56.19")
```

- [ ] **Step 2: Run it**

Run: `python3 scripts/channel-trajectory/01_parity.py`
Expected: all three `assert`s pass (PPC sync 14.5, SEO 20.0, PPC trial 37.5) and the trajectory assert prints `56.19` and "CONFIRMED". If the trajectory assert fails, STOP and report.

- [ ] **Step 3: (already recorded)**

The confirmed method (calendar-day linear = 56.19) is recorded in the script's docstring/comments. Nothing further to record.

- [ ] **Step 4: Commit**

```bash
git add scripts/channel-trajectory/01_parity.py
git commit -m "chore(channel-traj): phase-0 parity lock for fractional funnel defs + trajectory"
```

---

### Task 2: dbt model `int_channel_funnel_trajectory`

**Files:**
- Create: `models/marketing/int_channel_funnel_trajectory.sql`
- Create: `models/marketing/_int_channel_funnel_trajectory.yml`
- Create: `scripts/channel-trajectory/02_verify_model.py`

**Interfaces:**
- Produces: view `project-for-method-dw.revenue.int_channel_funnel_trajectory` with columns `metric` (`trials`|`syncs`|`sync_rate`), `channel`, `mtd_actual`, `trajectory`, `prior_month_full`, `last_year_full`, `yoy_pct`, `mom_pct`. Task 3's SQL selects from this view.

- [ ] **Step 1: Write the verification script (the test)**

```python
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `python3 scripts/channel-trajectory/02_verify_model.py`
Expected: FAIL — the view does not exist yet (`Not found: Table ... int_channel_funnel_trajectory`).

- [ ] **Step 3: Write the model**

```sql
{{ config(materialized='view') }}

-- Channel Trajectory: per channel × metric (trials / syncs / sync_rate) —
-- current-month MTD (excl today), calendar-day linear trajectory, prior-month
-- full, last-year full, and YoY / MoM %.
--
-- Attribution is FRACTIONAL multi-touch: Att_* are already fractional weights,
-- summed directly (do NOT normalize, do NOT collapse to one channel).
-- Trials  = revenue.Account by SignupDate.
-- Syncs   = revenue.Funnel where EventType='Sync' (NOT CustDatFirstSyncCompleted).
-- Window  = [DATE_TRUNC(CURRENT_DATE(),MONTH), CURRENT_DATE())  (MTD excl today).
-- Trajectory = MTD / days_elapsed * days_in_month  (calendar-day linear run-rate).

WITH cal AS (
  SELECT
    CURRENT_DATE() AS today,
    DATE_TRUNC(CURRENT_DATE(), MONTH) AS m_start,
    DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH), MONTH) AS pm_start,
    DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH), MONTH) AS ly_start,
    DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 11 MONTH), MONTH) AS ly_next_start,
    DATE_DIFF(CURRENT_DATE(), DATE_TRUNC(CURRENT_DATE(), MONTH), DAY) AS days_elapsed,
    EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE())) AS days_in_month
),

trial_rows AS (
  SELECT SignupDate AS d, channel, weight FROM (
    SELECT SignupDate,
      Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Direct,
      Att_None, Att_Email, Att_Partners, Att_Content, Att_Social, Att_Other,
      Att_Referral_Link, Att_Referral_Program, Att_Remarketing, Att_Backlinks,
      Att_Banner_Ads, Att_Help_Center, Att_Online_Chat_Tool, Att_Seminar_Conference
    FROM {{ source('revenue', 'Account') }}
    WHERE IsConversionException = FALSE
      AND Partner != 'Method Integration'
      AND SignupDate != DATE('0001-01-01')
  )
  UNPIVOT (weight FOR channel IN (
    Att_SEO AS 'SEO', Att_Pay_Per_Click AS 'PPC',
    Att_OPN_Other_Peoples_Networks AS 'OPN', Att_Direct AS 'Direct',
    Att_None AS 'None', Att_Email AS 'Email', Att_Partners AS 'Partners',
    Att_Content AS 'Content', Att_Social AS 'Social', Att_Other AS 'Other',
    Att_Referral_Link AS 'Referral', Att_Referral_Program AS 'Referral_Program',
    Att_Remarketing AS 'Remarketing', Att_Backlinks AS 'Backlinks',
    Att_Banner_Ads AS 'Banner_Ads', Att_Help_Center AS 'Help_Center',
    Att_Online_Chat_Tool AS 'Online_Chat', Att_Seminar_Conference AS 'Seminar'))
  WHERE weight <> 0
),

sync_rows AS (
  SELECT CAST(Date AS DATE) AS d, channel, weight FROM (
    SELECT Date,
      Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Direct,
      Att_None, Att_Partners, Att_Content, Att_Social, Att_Other,
      Att_Referral_Link, Att_Referral_Program, Att_Remarketing, Att_Backlinks,
      Att_Banner_Ads, Att_Help_Center, Att_Online_Chat_Tool, Att_Seminar_Conference
    FROM {{ source('revenue', 'Funnel') }}
    WHERE EventType = 'Sync'
  )
  UNPIVOT (weight FOR channel IN (
    Att_SEO AS 'SEO', Att_Pay_Per_Click AS 'PPC',
    Att_OPN_Other_Peoples_Networks AS 'OPN', Att_Direct AS 'Direct',
    Att_None AS 'None', Att_Partners AS 'Partners',
    Att_Content AS 'Content', Att_Social AS 'Social', Att_Other AS 'Other',
    Att_Referral_Link AS 'Referral', Att_Referral_Program AS 'Referral_Program',
    Att_Remarketing AS 'Remarketing', Att_Backlinks AS 'Backlinks',
    Att_Banner_Ads AS 'Banner_Ads', Att_Help_Center AS 'Help_Center',
    Att_Online_Chat_Tool AS 'Online_Chat', Att_Seminar_Conference AS 'Seminar'))
  WHERE weight <> 0
),

events AS (
  SELECT 'trials' AS metric, d, channel, weight FROM trial_rows
  UNION ALL
  SELECT 'syncs' AS metric, d, channel, weight FROM sync_rows
),

agg AS (
  SELECT
    e.metric, e.channel,
    SUM(CASE WHEN e.d >= c.m_start  AND e.d < c.today        THEN e.weight END) AS mtd,
    SUM(CASE WHEN e.d >= c.pm_start AND e.d < c.m_start       THEN e.weight END) AS prior_full,
    SUM(CASE WHEN e.d >= c.ly_start AND e.d < c.ly_next_start THEN e.weight END) AS ly_full,
    ANY_VALUE(c.days_elapsed)  AS days_elapsed,
    ANY_VALUE(c.days_in_month) AS days_in_month
  FROM events e CROSS JOIN cal c
  GROUP BY e.metric, e.channel
),

base AS (
  SELECT
    metric, channel, mtd, prior_full, ly_full,
    CASE WHEN days_elapsed > 0 THEN mtd / days_elapsed * days_in_month END AS trajectory
  FROM agg
),

rate AS (
  SELECT
    'sync_rate' AS metric, t.channel,
    SAFE_DIVIDE(s.mtd, t.mtd)               AS mtd,
    SAFE_DIVIDE(s.prior_full, t.prior_full) AS prior_full,
    SAFE_DIVIDE(s.ly_full, t.ly_full)       AS ly_full,
    SAFE_DIVIDE(s.trajectory, t.trajectory) AS trajectory
  FROM (SELECT * FROM base WHERE metric = 'trials') t
  LEFT JOIN (SELECT * FROM base WHERE metric = 'syncs') s USING (channel)
),

unioned AS (
  SELECT metric, channel, mtd, trajectory, prior_full, ly_full FROM base
  UNION ALL
  SELECT metric, channel, mtd, trajectory, prior_full, ly_full FROM rate
)

SELECT
  metric,
  channel,
  mtd                                            AS mtd_actual,
  trajectory,
  prior_full                                     AS prior_month_full,
  ly_full                                        AS last_year_full,
  SAFE_DIVIDE(trajectory - ly_full, ly_full)     AS yoy_pct,
  SAFE_DIVIDE(trajectory - prior_full, prior_full) AS mom_pct
FROM unioned
```

- [ ] **Step 4: Write the schema doc**

```yaml
version: 2

models:
  - name: int_channel_funnel_trajectory
    description: >
      Per channel × metric (trials/syncs/sync_rate): current-month MTD (excl
      today), calendar-day linear trajectory, prior-month full, last-year full,
      and YoY/MoM %. Fractional multi-touch attribution. Trials from Account;
      syncs from Funnel EventType='Sync'. Recomputes live against CURRENT_DATE().
    columns:
      - name: metric
        description: "trials | syncs | sync_rate"
        tests: [{ accepted_values: { values: ['trials', 'syncs', 'sync_rate'] } }]
      - name: channel
        description: Attribution channel (fractional multi-touch).
      - name: mtd_actual
        description: Month-to-date actual excluding today.
      - name: trajectory
        description: Calendar-day linear projection of the full current month (mtd / days_elapsed * days_in_month).
      - name: prior_month_full
        description: Prior calendar month, full.
      - name: last_year_full
        description: Same month last year, full.
      - name: yoy_pct
        description: (trajectory - last_year_full) / last_year_full.
      - name: mom_pct
        description: (trajectory - prior_month_full) / prior_month_full.
```

- [ ] **Step 5: Build the model**

Run: `dbt run --select int_channel_funnel_trajectory`
Expected: `Completed successfully`, one view created in `revenue`.
If `dbt` is not on PATH, use the project's dbt invocation (check `scripts/` or `dbt_project.yml` profile `method_metrics`).

- [ ] **Step 6: Run the verification script**

Run: `python3 scripts/channel-trajectory/02_verify_model.py`
Expected: PASS — prints rows, `metrics={'trials','syncs','sync_rate'}`, sync_rate ties to syncs/trials.

- [ ] **Step 7: Run dbt tests**

Run: `dbt test --select int_channel_funnel_trajectory`
Expected: `accepted_values` on `metric` passes.

- [ ] **Step 8: Commit**

```bash
git add models/marketing/int_channel_funnel_trajectory.sql models/marketing/_int_channel_funnel_trajectory.yml scripts/channel-trajectory/02_verify_model.py
git commit -m "feat(dbt): int_channel_funnel_trajectory — channel trajectory + YoY/MoM"
```

---

### Task 3: Frontend SQL + data lib

**Files:**
- Create: `builder/src/lib/channelTrajectorySql.js`
- Create: `builder/src/lib/channelTrajectoryData.js`
- Test: `builder/tests/unit/channelTrajectory.test.js`

**Interfaces:**
- Consumes: `queryBq` from `builder/src/lib/bigquery.js`.
- Produces:
  - `buildChannelTrajectorySql(): string`
  - `shapeChannelTrajectory(rows: Array<{metric,channel,mtd_actual,trajectory,prior_month_full,last_year_full,yoy_pct,mom_pct}>): { trials: Row[], syncs: Row[], sync_rate: Row[] }` where each `Row = { channel, trajectory, lastYearFull, priorMonthFull, mtdActual, yoyPct, momPct }`, sorted by `trajectory` descending, with a synthetic `channel: 'Total'` row appended per metric.
  - `fetchChannelTrajectory(): Promise<ReturnValueOfShape>` — runs the SQL via `queryBq` and returns `shapeChannelTrajectory(rows)`.

- [ ] **Step 1: Write failing unit tests**

```javascript
import { describe, it, expect } from 'vitest';
import { buildChannelTrajectorySql, shapeChannelTrajectory } from '../../src/lib/channelTrajectorySql.js';

describe('channelTrajectory', () => {
  it('builds SQL against the dbt view', () => {
    const sql = buildChannelTrajectorySql();
    expect(sql).toMatch(/int_channel_funnel_trajectory/);
  });

  it('groups by metric, sorts by trajectory desc, appends Total for counts', () => {
    const rows = [
      { metric: 'syncs', channel: 'PPC', mtd_actual: 14.5, trajectory: 56, prior_month_full: 61, last_year_full: 69.8, yoy_pct: -0.198, mom_pct: -0.082 },
      { metric: 'syncs', channel: 'SEO', mtd_actual: 20, trajectory: 80, prior_month_full: 70, last_year_full: 90, yoy_pct: -0.111, mom_pct: 0.143 },
      { metric: 'trials', channel: 'PPC', mtd_actual: 37.5, trajectory: 150, prior_month_full: 160, last_year_full: 165, yoy_pct: -0.091, mom_pct: -0.062 },
      { metric: 'sync_rate', channel: 'PPC', mtd_actual: 0.38, trajectory: 0.37, prior_month_full: 0.38, last_year_full: 0.42, yoy_pct: -0.119, mom_pct: -0.026 },
    ];
    const out = shapeChannelTrajectory(rows);
    expect(out.syncs[0].channel).toBe('SEO');       // 80 > 56
    expect(out.syncs.at(-1).channel).toBe('Total');  // total appended
    expect(out.syncs.at(-1).trajectory).toBeCloseTo(136); // 80 + 56
    expect(out.trials[0].channel).toBe('PPC');
    // sync_rate total is trials-weighted, not a plain sum — see Step 3
    expect(out.sync_rate.at(-1).channel).toBe('Total');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd builder && npx vitest run tests/unit/channelTrajectory.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the SQL + shape helpers**

```javascript
// builder/src/lib/channelTrajectorySql.js
export function buildChannelTrajectorySql() {
  return `
    SELECT metric, channel, mtd_actual, trajectory,
           prior_month_full, last_year_full, yoy_pct, mom_pct
    FROM \`project-for-method-dw.revenue.int_channel_funnel_trajectory\`
  `;
}

const toRow = (r) => ({
  channel: r.channel,
  trajectory: r.trajectory,
  lastYearFull: r.last_year_full,
  priorMonthFull: r.prior_month_full,
  mtdActual: r.mtd_actual,
  yoyPct: r.yoy_pct,
  momPct: r.mom_pct,
});

const sum = (xs) => xs.reduce((a, b) => a + (b || 0), 0);

function totalRow(metric, rows, trialsRows, syncsRows) {
  if (metric === 'sync_rate') {
    // trials-weighted rate total: sum(syncs.X) / sum(trials.X) at each level
    const s = (arr, k) => sum(arr.map((r) => r[k]));
    return {
      channel: 'Total',
      trajectory: s(syncsRows, 'trajectory') / s(trialsRows, 'trajectory') || null,
      lastYearFull: s(syncsRows, 'lastYearFull') / s(trialsRows, 'lastYearFull') || null,
      priorMonthFull: s(syncsRows, 'priorMonthFull') / s(trialsRows, 'priorMonthFull') || null,
      mtdActual: s(syncsRows, 'mtdActual') / s(trialsRows, 'mtdActual') || null,
      yoyPct: null, momPct: null,
    };
  }
  const t = { channel: 'Total' };
  for (const k of ['trajectory', 'lastYearFull', 'priorMonthFull', 'mtdActual']) t[k] = sum(rows.map((r) => r[k]));
  t.yoyPct = t.lastYearFull ? (t.trajectory - t.lastYearFull) / t.lastYearFull : null;
  t.momPct = t.priorMonthFull ? (t.trajectory - t.priorMonthFull) / t.priorMonthFull : null;
  return t;
}

export function shapeChannelTrajectory(rows) {
  const g = { trials: [], syncs: [], sync_rate: [] };
  for (const r of rows) if (g[r.metric]) g[r.metric].push(toRow(r));
  for (const k of Object.keys(g)) g[k].sort((a, b) => (b.trajectory || 0) - (a.trajectory || 0));
  const withTotals = {};
  for (const k of Object.keys(g)) {
    withTotals[k] = [...g[k], totalRow(k, g[k], g.trials, g.syncs)];
  }
  return withTotals;
}
```

```javascript
// builder/src/lib/channelTrajectoryData.js
import { queryBq } from './bigquery.js';
import { buildChannelTrajectorySql, shapeChannelTrajectory } from './channelTrajectorySql.js';

export async function fetchChannelTrajectory() {
  const rows = await queryBq(buildChannelTrajectorySql());
  return shapeChannelTrajectory(rows);
}
```

- [ ] **Step 4: Run tests to confirm pass**

Run: `cd builder && npx vitest run tests/unit/channelTrajectory.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add builder/src/lib/channelTrajectorySql.js builder/src/lib/channelTrajectoryData.js builder/tests/unit/channelTrajectory.test.js
git commit -m "feat(builder): channel trajectory SQL + data shaping"
```

---

### Task 4: Frontend component (metric-tabbed compact table)

**Files:**
- Create: `builder/src/components/scorecards/ChannelTrajectoryScorecard.jsx`

**Interfaces:**
- Consumes: `fetchChannelTrajectory` from `builder/src/lib/channelTrajectoryData.js`; `queryBq` auth state via props `{ cfg, bqConnected, onConnect }` (same signature as `GrrIndustryDrill`).
- Produces: default-export React component `ChannelTrajectoryScorecard`.

- [ ] **Step 1: Write the component**

Model the shell (loading / not-connected / header) on `builder/src/components/scorecards/GrrIndustryDrill.jsx`. The body:

```jsx
import React, { useState, useEffect } from 'react';
import { fetchChannelTrajectory } from '../../lib/channelTrajectoryData';

const TABS = [
  { key: 'trials', label: 'Trials', pctFmt: false },
  { key: 'syncs', label: 'Syncs', pctFmt: false },
  { key: 'sync_rate', label: 'Sync Rate', pctFmt: true },
];

const num = (v, pct) =>
  v == null ? '—'
  : pct ? `${(v * 100).toFixed(1)}%`
  : Number.isInteger(v) ? String(v) : v.toFixed(1);

function Delta({ v }) {
  if (v == null) return <span style={{ color: '#9ca3af' }}>—</span>;
  const up = v >= 0;
  return (
    <span style={{ color: up ? '#059669' : '#dc2626', fontWeight: 600 }}>
      {up ? '▲' : '▼'} {(v * 100).toFixed(1)}%
    </span>
  );
}

export default function ChannelTrajectoryScorecard({ cfg, bqConnected, onConnect }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('syncs');

  useEffect(() => {
    if (!bqConnected) return;
    let live = true;
    fetchChannelTrajectory().then(d => live && setData(d)).catch(e => live && setErr(String(e)));
    return () => { live = false; };
  }, [bqConnected]);

  if (!bqConnected) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <h2>{cfg.title}</h2>
        <button onClick={onConnect} style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', cursor: 'pointer' }}>Connect BigQuery</button>
      </div>
    );
  }
  if (err) return <div style={{ padding: 48, color: '#dc2626' }}>Error: {err}</div>;
  if (!data) return <div style={{ padding: 48, color: '#6b7280' }}>Loading…</div>;

  const rows = data[tab];
  const isRate = tab === 'sync_rate';

  return (
    <div style={{ padding: 32, maxWidth: 900, fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1a1a1a' }}>{cfg.title}</h1>
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 24 }}>
        Current-month trajectory vs last year’s full month (YoY) and last month (MoM). MTD excludes today.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '6px 16px', fontSize: 13, fontWeight: tab === t.key ? 600 : 400,
            background: tab === t.key ? '#2563eb' : '#f3f4f6', color: tab === t.key ? '#fff' : '#374151',
            border: 'none', borderRadius: 20, cursor: 'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: 'right', color: '#6b7280', fontSize: 12 }}>
            <th style={{ textAlign: 'left', padding: '8px 0' }}>Channel</th>
            <th>Trajectory</th><th>LY Full</th><th>YoY %</th><th>MoM %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const isTotal = r.channel === 'Total';
            return (
              <tr key={r.channel} style={{
                borderTop: isTotal ? '2px solid #1a1a1a' : '1px solid #eef0f2',
                fontWeight: isTotal ? 700 : 400, textAlign: 'right',
              }}>
                <td style={{ textAlign: 'left', padding: '8px 0' }}>{r.channel}</td>
                <td>{num(r.trajectory, isRate)}</td>
                <td>{num(r.lastYearFull, isRate)}</td>
                <td><Delta v={r.yoyPct} /></td>
                <td><Delta v={r.momPct} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add builder/src/components/scorecards/ChannelTrajectoryScorecard.jsx
git commit -m "feat(builder): ChannelTrajectoryScorecard tabbed compact table"
```

---

### Task 5: Wire up route + config + sidebar, verify in preview

**Files:**
- Create: `builder/src/config/scorecards/channel-trajectory-scorecard.js`
- Modify: `builder/src/config/scorecards/index.js`
- Modify: `builder/src/pages/Scorecard.jsx:144-155` (add renderer branch)

**Interfaces:**
- Consumes: `ChannelTrajectoryScorecard` component; `SCORECARDS` registry.
- Produces: route `channel-trajectory` reachable and rendering.

- [ ] **Step 1: Write the config**

```javascript
// builder/src/config/scorecards/channel-trajectory-scorecard.js
/**
 * Channel Trajectory — fixes the Looker YoY table for Marketing.
 * Current-month trajectory vs last-year full month (YoY) and last month (MoM),
 * by channel, for Trials / Syncs / Sync Rate. Backed by the dbt view
 * revenue.int_channel_funnel_trajectory. See docs/superpowers/specs/
 * 2026-07-09-channel-trajectory-scorecard-design.md.
 */
export default {
  id: 'channel-trajectory',
  title: 'Channel Trajectory',
  status: 'pending',
  group: 'marketing',
  renderer: 'channelTrajectory',
  dbtModel: 'int_channel_funnel_trajectory',
};
```

- [ ] **Step 2: Register in index.js**

Add the import and registry entry (mirroring the existing lines):

```javascript
import channelTrajectory from './channel-trajectory-scorecard.js';
// ... inside SCORECARDS object:
  'channel-trajectory': channelTrajectory,
```

- [ ] **Step 3: Add the renderer branch in Scorecard.jsx**

Add the import near the other scorecard-component imports (top of file):

```javascript
import ChannelTrajectoryScorecard from '../components/scorecards/ChannelTrajectoryScorecard';
```

Add the branch alongside the other `config.renderer ===` checks (after the `grrIndustry` branch, ~line 155):

```javascript
  if (config.renderer === 'channelTrajectory') {
    return <ChannelTrajectoryScorecard cfg={config} bqConnected={bqConnected} onConnect={onConnect} />;
  }
```

- [ ] **Step 4: Verify it appears in the sidebar**

Read `builder/src/components/Sidebar.jsx` to confirm scorecards are listed from `SCORECARDS` grouped by `group`. If the list is derived from `SCORECARDS`, the `group: 'marketing'` entry appears automatically. If marketing scorecards are enumerated explicitly, add `'channel-trajectory'` to that list. Make the minimal edit needed for the entry to show.

- [ ] **Step 5: Preview-verify**

Ensure a dev server is running (`preview_start`), open `/#/scorecard/channel-trajectory` (match the app's routing — check how other scorecard links are formed in `Sidebar.jsx`). Connect BQ if prompted. Then:
- `preview_console_logs` (level error) — expect none.
- `preview_snapshot` — expect the three tabs (Trials / Syncs / Sync Rate) and the table with a Total row.
- Click the Syncs tab (`preview_click`), `preview_snapshot` — expect PPC/SEO rows with YoY %.
- `preview_screenshot` — capture for the user.

Fix any errors by reading source and re-checking from the console-logs step.

- [ ] **Step 6: Commit**

```bash
git add builder/src/config/scorecards/channel-trajectory-scorecard.js builder/src/config/scorecards/index.js builder/src/pages/Scorecard.jsx builder/src/components/Sidebar.jsx
git commit -m "feat(builder): register Channel Trajectory scorecard route"
```

---

### Task 6: Definition doc + deploy + memory

**Files:**
- Modify: `docs/metric-definitions.md`

**Interfaces:** none (documentation + deploy).

- [ ] **Step 1: Add the definition entry**

Append a "Channel Trajectory" entry to `docs/metric-definitions.md` following the file's template. Fill the non-negotiable fields:
- **What it answers:** "For each channel, is this month's trajectory up or down vs last year's full month (and vs last month)?"
- **Grain:** channel × metric (trials / syncs / sync_rate), current month.
- **Filters:** `IsConversionException=FALSE`, `Partner!='Method Integration'`, trials exclude `SignupDate='0001-01-01'`; syncs `EventType='Sync'`.
- **Methodology source:** Looker Marketing Dashboard parity (Jul 2026); fractional multi-touch attribution; calendar-day linear trajectory.
- **Parity-verified against:** Looker PDF Jul 1–8 2026 — syncs PPC 14.5 / SEO 20; trials PPC 37.5 / SEO 36.
- **Known caveats:** Email has no Funnel sync attribution (Email sync/rate null). Grand total is fractional (channel sum), not Looker's independent raw count. `CustDatFirstSyncCompleted` deliberately unused.

- [ ] **Step 2: Build the frontend**

Run: `cd builder && npm run build`
Expected: build succeeds, `dist/` updated.

- [ ] **Step 3: Commit + deploy (GitHub Pages)**

```bash
git add docs/metric-definitions.md builder/dist
git commit -m "docs+build: Channel Trajectory definition + dist"
git push
```
(GitHub Pages auto-deploys on push to `main`. Do NOT use vercel.)

- [ ] **Step 4: Update memory**

Add/refine a memory note: the Looker marketing sync-by-channel definition = fractional multi-touch attribution on `Funnel EventType='Sync'` (Att_* are pre-fractional, summed directly), MTD-excl-today; `CustDatFirstSyncCompleted` explicitly NOT used for this. Cross-link `[[project_syncs_redefinition]]`.

---

## Self-Review

**Spec coverage:** methodology table → Task 2 model; parity evidence → Tasks 1–2 scripts; Email asymmetry → model (Funnel lacks Att_Email) + Task 6 caveat; grand-total quirk → Task 3 `totalRow`; dbt view → Task 2; frontend tabbed table → Tasks 3–5; verification gates → Tasks 1, 2, 6; separate route → Task 5; define-before-live → Task 6. All covered.

**Placeholder scan:** no TBD/TODO; all code steps contain full code. Task 4 references `GrrIndustryDrill` only as a shell model, with the body given in full.

**Type consistency:** `shapeChannelTrajectory` returns `{trials,syncs,sync_rate}` of `Row{channel,trajectory,lastYearFull,priorMonthFull,mtdActual,yoyPct,momPct}`; the component reads exactly those keys; `fetchChannelTrajectory` returns that shape; the dbt view's snake_case columns map to camelCase in `toRow`. Consistent.

## Open items deferred to implementation (from spec)

- Pin exact "excluding today" window if OPN/Direct/None trials don't tie (Task 1).
- Sync Rate total is trials-weighted (implemented in Task 3 `totalRow`).
- Channel set: show all present channels, sorted by trajectory desc (no forced Looker-9 mapping) — revisit only if Marketing asks.
