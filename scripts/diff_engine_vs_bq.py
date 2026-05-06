"""
Customer-by-customer diff: SaaS Analytics Engine output vs BQ v_customer_annual_mrr.

For a given target month (Period 2 = that month, Period 1 = 12 months prior):
  - Read engine's Customers tab: aggregate to CompanyAccount, compute primitives
    (Start, Cancel-net-PE, Down, Exp) using the formulas from the Customers tab.
  - Query v_customer_annual_mrr for the same month and aggregate to Company.
  - Diff per Company.

Usage: python diff_engine_vs_bq.py 2026-02
"""
import sys
import subprocess
import json
import openpyxl
from collections import defaultdict
from pathlib import Path


def col_idx(letter):
    n = 0
    for c in letter:
        n = n * 26 + (ord(c) - ord('A') + 1)
    return n - 1


def f(v):
    if v is None: return 0.0
    try: return float(v)
    except (TypeError, ValueError): return 0.0


def read_engine(path):
    """Returns {Company: {start, cancel_net, down, exp, new, pe1, pe2}}"""
    wb = openpyxl.load_workbook(path, data_only=False)
    ws = wb['Customers']
    A = col_idx('A'); D = col_idx('D'); E = col_idx('E')
    H = col_idx('H'); I = col_idx('I')
    W = col_idx('W'); X = col_idx('X')
    Y = col_idx('Y'); Z = col_idx('Z')
    AP = col_idx('AP'); AQ = col_idx('AQ')
    AR = col_idx('AR'); AS = col_idx('AS')

    by_co = defaultdict(lambda: defaultdict(float))
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[A] is None: continue
        co = row[A]
        p1 = f(row[W]) + f(row[Y]) + f(row[D]) + f(row[H])
        p2 = f(row[X]) + f(row[Z]) + f(row[E]) + f(row[I])
        pe1 = f(row[AR])
        pe2 = f(row[AS])
        new    = p2          if p1 == 0 else 0.0
        exp    = (p2 - p1)   if (p1 > 0 and p2 > p1) else 0.0
        cancel = p1          if p2 == 0 else 0.0
        down   = (p1 - p2)   if (p2 > 0 and p2 < p1) else 0.0
        d = by_co[co]
        d['start'] += p1
        d['p2'] += p2
        d['cancel_raw'] += cancel
        d['cancel_net'] += (cancel - pe1)
        d['down'] += down
        d['exp'] += exp
        d['new_raw'] += new
        d['new_net'] += (new - pe2)
        d['pe1'] += pe1
        d['pe2'] += pe2
    return by_co


def read_bq(month):
    """Returns {Company: {start, cancel, down, exp, new}} from v_customer_annual_mrr."""
    sql = f"""
    SELECT
      Company,
      ROUND(SUM(StartMRR), 2)      AS start_mrr,
      ROUND(SUM(Cancellations), 2) AS cancel,
      ROUND(SUM(Downgrades), 2)    AS down,
      ROUND(SUM(Expansions), 2)    AS exp,
      ROUND(SUM(NewMRR), 2)        AS new_mrr
    FROM `project-for-method-dw.revenue.v_customer_annual_mrr`
    WHERE FORMAT_DATE('%Y-%m', Month) = '{month}'
    GROUP BY Company
    """
    result = subprocess.run(
        ['bq', 'query', '--nouse_legacy_sql', '--format=json', '--use_cache=false',
         '--max_rows=10000', sql],
        capture_output=True, text=True, check=True
    )
    rows = json.loads(result.stdout)
    return {r['Company']: {
        'start': float(r['start_mrr'] or 0),
        'cancel': float(r['cancel'] or 0),
        'down': float(r['down'] or 0),
        'exp': float(r['exp'] or 0),
        'new': float(r['new_mrr'] or 0),
    } for r in rows}


def main():
    month = sys.argv[1]
    engine_path = Path(f'sources/saas-analytics-engine/{month}-annual.xlsx')
    print(f'Reading engine: {engine_path}')
    eng = read_engine(engine_path)
    print(f'  Engine companies: {len(eng)}')
    print(f'Reading BQ for {month} ...')
    bq = read_bq(month)
    print(f'  BQ companies: {len(bq)}')
    print()

    all_companies = set(eng) | set(bq)
    diffs = []
    for co in all_companies:
        e = eng.get(co, defaultdict(float))
        b = bq.get(co, {'start':0,'cancel':0,'down':0,'exp':0,'new':0})
        # Engine primitives — apply same symmetric PE exclusion BQ does:
        # Engine's raw Start (AI) includes PE; the engine's effective
        # denominator in SaaS Totals is Start - PE1. Match that here so
        # the diff reflects our common methodology.
        e_start = e['start'] - e['pe1']
        e_cancel = e['cancel_net']  # already net of pe1
        e_down = e['down']
        e_exp = e['exp']
        e_new = e['new_net']        # already net of pe2

        d_start  = round(b['start']  - e_start, 2)
        d_cancel = round(b['cancel'] - e_cancel, 2)
        d_down   = round(b['down']   - e_down, 2)
        d_exp    = round(b['exp']    - e_exp, 2)
        d_new    = round(b['new']    - e_new, 2)

        if any(abs(x) >= 0.01 for x in [d_start, d_cancel, d_down, d_exp, d_new]):
            diffs.append({
                'co': co,
                'd_start': d_start, 'd_cancel': d_cancel, 'd_down': d_down,
                'd_exp': d_exp, 'd_new': d_new,
                'e_start': e_start, 'b_start': b['start'],
                'e_cancel': e_cancel, 'b_cancel': b['cancel'],
                'e_exp': e_exp, 'b_exp': b['exp'],
            })

    # Net totals
    print('=== Net diff totals (BQ − Engine) ===')
    for f_ in ('d_start','d_cancel','d_down','d_exp','d_new'):
        s = sum(d[f_] for d in diffs)
        print(f'  {f_:10s}: {s:>10,.2f}')
    print(f'  Companies with any diff: {len(diffs)}')

    # Print biggest by abs(d_start) and biggest by abs(d_exp)
    print()
    print('=== 15 largest by |d_start| ===')
    for d in sorted(diffs, key=lambda x: abs(x['d_start']), reverse=True)[:15]:
        print(f"  {d['co']:35s} d_start={d['d_start']:>9,.2f}  e={d['e_start']:>9,.2f}  b={d['b_start']:>9,.2f}")
    print()
    print('=== 15 largest by |d_exp| ===')
    for d in sorted(diffs, key=lambda x: abs(x['d_exp']), reverse=True)[:15]:
        print(f"  {d['co']:35s} d_exp={d['d_exp']:>9,.2f}  e={d['e_exp']:>9,.2f}  b={d['b_exp']:>9,.2f}")
    print()
    print('=== 15 largest by |d_cancel| ===')
    for d in sorted(diffs, key=lambda x: abs(x['d_cancel']), reverse=True)[:15]:
        print(f"  {d['co']:35s} d_cancel={d['d_cancel']:>9,.2f}  e={d['e_cancel']:>9,.2f}  b={d['b_cancel']:>9,.2f}")


if __name__ == '__main__':
    main()
