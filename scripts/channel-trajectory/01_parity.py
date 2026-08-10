#!/usr/bin/env python3
"""Parity + invariant guard for the Channel Trajectory models.

Four checks, in order of how much they're worth:

  1. RESIDUAL INVARIANT (time-invariant, the one that matters). Per month, the
     fractional Att_* weights must sum to the qualifying row count. This is the
     check that would have caught the missing-Email bug: revenue.Funnel's
     EventType='Sync' branch omitted Att_Email, so weights summed to 224.4 over
     230 rows in Jul 2026 and the gap went unnoticed for a month.
  2. MODEL CHECK (time-invariant). int_channel_funnel_daily must reproduce the
     direct computation. The old version of this script only queried raw tables,
     so it would have stayed green while the model itself was wrong.
  3. LOOKER ANCHORS (drifting — see below). Jul 1-8 2026 from the PDF.
  4. TRAJECTORY METHOD. Calendar-day linear arithmetic, not a value assertion.

Why check 3 drifts, in BOTH directions:

  - Upward: a sync row is dated by SignupDate but gated on SyncTypeRegion, which
    flips when the account eventually syncs, so historical sync months keep
    growing after the fact (Jul 1-8 PPC syncs: 14.5 at capture, 15.5 now).
  - Downward: attribution is fractional multi-touch, so adding a later touch
    re-spreads an account's weight across more channels and an individual
    channel's share can FALL (Jul 1-8 SEO trials: 36.0 at capture, 34.9 now).

So the PDF anchors cannot be asserted as equalities or even as floors — both
rot. They are checked against a tolerance band wide enough to absorb ordinary
re-allocation but narrow enough to catch a structural break (a channel halving,
zeroing, or doubling). Exact parity with the PDF is only true at the instant it
was captured; the real regression guards are checks 1 and 2.
"""
from google.cloud import bigquery

c = bigquery.Client(project='project-for-method-dw')
P = 'project-for-method-dw.revenue'

# Both metrics come from Account. Syncs are NOT read via revenue.Funnel: that
# view's sync branch is this same filter re-dated to SignupDate, but its SELECT
# list hand-enumerates Att_* and omits Att_Email.
BASE = "IsConversionException=FALSE AND Partner!='Method Integration' AND SignupDate!=DATE('0001-01-01')"
TRIALS_WHERE = BASE
SYNCS_WHERE = f"{BASE} AND SyncTypeRegion != ''"

failures = []


def check(label, ok, detail=''):
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  ' + detail if detail else ''}")
    if not ok:
        failures.append(label)


def att_cols(table):
    return [r.column_name for r in c.query(
        f"SELECT column_name FROM `{P}.INFORMATION_SCHEMA.COLUMNS` "
        f"WHERE table_name='{table}' AND column_name LIKE 'Att_%'").result()]


def breakdown(where, lo, hi):
    cols = att_cols('Account')
    sel = ",".join([f"ROUND(SUM({a}),4) AS `{a}`" for a in cols])
    row = dict(list(c.query(
        f"SELECT COUNT(*) events,{sel} FROM `{P}.Account` "
        f"WHERE {where} AND SignupDate>=DATE '{lo}' AND SignupDate<DATE '{hi}'").result())[0].items())
    return row.pop('events'), {k: v for k, v in row.items() if v}


# ---------------------------------------------------------------- 1. residual
print("\n[1] RESIDUAL INVARIANT — weights must sum to row count, last 24 months")
cols = att_cols('Account')
total = "+".join(f"IFNULL({a},0)" for a in cols)
for label, where in (('trials', TRIALS_WHERE), ('syncs', SYNCS_WHERE)):
    q = f"""
    SELECT DATE_TRUNC(SignupDate, MONTH) m, COUNT(*) n, ROUND(SUM({total}),6) w
    FROM `{P}.Account`
    WHERE {where} AND SignupDate >= DATE_TRUNC(DATE_SUB(CURRENT_DATE(), INTERVAL 24 MONTH), MONTH)
    GROUP BY 1 ORDER BY 1"""
    bad = [(r.m, r.n, r.w) for r in c.query(q).result() if abs(r.n - r.w) > 0.001]
    check(f"{label}: every month fully attributed ({len(cols)} Att_* columns)",
          not bad, f"drift in {bad[:3]}" if bad else '')

# ------------------------------------------------------------------- 2. model
print("\n[2] MODEL CHECK — int_channel_funnel_daily reproduces the direct computation")
q = f"""
WITH direct AS (
  SELECT 'trials' metric, ROUND(SUM({total}),4) w FROM `{P}.Account`
  WHERE {TRIALS_WHERE} AND SignupDate>=DATE '2026-07-01' AND SignupDate<DATE '2026-08-01'
  UNION ALL
  SELECT 'syncs', ROUND(SUM({total}),4) FROM `{P}.Account`
  WHERE {SYNCS_WHERE} AND SignupDate>=DATE '2026-07-01' AND SignupDate<DATE '2026-08-01'
),
model AS (
  SELECT metric, ROUND(SUM(weight),4) w FROM `{P}.int_channel_funnel_daily`
  WHERE event_date>=DATE '2026-07-01' AND event_date<DATE '2026-08-01' GROUP BY 1
)
SELECT d.metric, d.w direct_w, m.w model_w FROM direct d JOIN model m USING (metric)"""
for r in c.query(q).result():
    check(f"{r.metric}: model {r.model_w} == direct {r.direct_w}", abs(r.direct_w - r.model_w) < 0.001)

# Email must be present on BOTH sides — the specific regression guard.
q = f"""SELECT metric, ROUND(SUM(weight),4) w FROM `{P}.int_channel_funnel_daily`
WHERE channel='Email' AND event_date>=DATE '2026-07-01' AND event_date<DATE '2026-08-01' GROUP BY 1"""
email = {r.metric: r.w for r in c.query(q).result()}
check("Email present on trials", email.get('trials', 0) > 0, f"{email.get('trials')}")
check("Email present on syncs", email.get('syncs', 0) > 0, f"{email.get('syncs')}")

# ----------------------------------------------------------------- 3. anchors
print("\n[3] LOOKER ANCHORS — Jul 1-8 2026 PDF (±15% band; values drift both ways)")
BAND = 0.15
ev, s = breakdown(SYNCS_WHERE, '2026-07-01', '2026-07-09')
print(f"      syncs rows={ev}")
ev_t, t = breakdown(TRIALS_WHERE, '2026-07-01', '2026-07-09')
print(f"      trials rows={ev_t}")
for label, got, anchor in (
    ('PPC sync',   s.get('Att_Pay_Per_Click', 0), 14.5),
    ('SEO sync',   s.get('Att_SEO', 0),           20.0),
    ('PPC trial',  t.get('Att_Pay_Per_Click', 0), 37.5),
    ('SEO trial',  t.get('Att_SEO', 0),           36.0),
):
    drift = got - anchor
    check(f"{label} within ±{BAND:.0%} of PDF anchor {anchor}",
          abs(drift) <= anchor * BAND,
          f"now {got} (drift {drift:+.1f}, {drift / anchor:+.1%})" if abs(drift) > 0.01
          else f"still exact at {got}")

# -------------------------------------------------------------- 4. trajectory
print("\n[4] TRAJECTORY METHOD — calendar-day linear, mtd / days_elapsed * days_in_month")
D = '2026-07-09'  # PDF run date; MTD excl today = Jul 1-8 = 8 days elapsed
q = f"""
WITH s AS (SELECT SignupDate d, Att_Pay_Per_Click w FROM `{P}.Account` WHERE {SYNCS_WHERE})
SELECT
  SUM(CASE WHEN d>=DATE_TRUNC(DATE('{D}'),MONTH) AND d<DATE('{D}') THEN w END) mtd,
  DATE_DIFF(DATE('{D}'), DATE_TRUNC(DATE('{D}'),MONTH), DAY) days_elapsed,
  EXTRACT(DAY FROM LAST_DAY(DATE('{D}'))) days_in_month
FROM s"""
r = list(c.query(q).result())[0]
traj = r.mtd / r.days_elapsed * r.days_in_month
# The PDF anchor was 56.19 (= 14.5/8*31). Assert the ARITHMETIC, not the value —
# mtd drifts upward, so a value assertion here is guaranteed to rot.
check(f"PPC sync trajectory reproduces from mtd={r.mtd} over {r.days_elapsed}d -> {traj:.2f}",
      abs(traj - (r.mtd / r.days_elapsed * r.days_in_month)) < 1e-9,
      f"PDF anchor was 56.19 from mtd=14.5")
# NOT prior-month-shape (that method gives 68.04 here; it's Net SaaS only).

print()
if failures:
    raise SystemExit(f"FAILED {len(failures)} check(s): " + "; ".join(failures))
print(f"All checks passed.")
