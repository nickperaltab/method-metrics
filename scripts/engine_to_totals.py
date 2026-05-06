"""
Read a SaaS Analytics Engine periodcomparison Excel file, compute the same
totals it would produce (Start, Cancel-net-PreExpiry, Down, Exp, GRR, NRR)
by manually evaluating the formulas (server-generated files have no cached
formula values, so data_only=True returns None).

Usage: python engine_to_totals.py <path-to-xlsx>
"""
import sys
import openpyxl
from collections import defaultdict


def col_idx(letter):
    """1-letter Excel col -> 0-based index."""
    n = 0
    for c in letter:
        n = n * 26 + (ord(c) - ord('A') + 1)
    return n - 1


def f(v):
    if v is None: return 0.0
    try: return float(v)
    except (TypeError, ValueError): return 0.0


def main(path):
    wb = openpyxl.load_workbook(path, data_only=False)
    ws = wb['Customers']

    # Column indices (0-based)
    A = col_idx('A')   # CompanyAccount
    D = col_idx('D')   # DiscountOtherSaaSPeriod1
    E = col_idx('E')   # DiscountOtherSaaSPeriod2
    H = col_idx('H')   # DiscountPrepayPortionPeriod1
    I = col_idx('I')   # DiscountPrepayPortionPeriod2
    W = col_idx('W')   # SaaSIncomeAmountClassicPeriod1
    X = col_idx('X')   # SaaSIncomeAmountClassicPeriod2
    Y = col_idx('Y')   # SaaSIncomeAmountNewPeriod1
    Z = col_idx('Z')   # SaaSIncomeAmountNewPeriod2
    AP = col_idx('AP') # Currency
    AQ = col_idx('AQ') # CustomerRecordID
    AR = col_idx('AR') # PerPayExpriyPeriod1
    AS = col_idx('AS') # PerPayExpriyPeriod2

    by_cur = defaultdict(lambda: defaultdict(float))
    n_rows = 0
    n_pe1 = 0
    n_pe1_eq_p1 = 0
    n_pe1_lt_p1 = 0
    pe1_partial = []

    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[A] is None: continue
        n_rows += 1
        # Compute SaaSNetPeriod1 = W + Y + D + H
        p1 = f(row[W]) + f(row[Y]) + f(row[D]) + f(row[H])
        # SaaSNetPeriod2 = X + Z + E + I
        p2 = f(row[X]) + f(row[Z]) + f(row[E]) + f(row[I])
        cur = row[AP]
        pe1 = f(row[AR])
        pe2 = f(row[AS])

        # Engine's classification (per Customers tab formulas):
        # AK SaaSExpandNew         = if AI=0,        AJ,    0
        # AL SaaSExpansionUp       = if AI>0 AJ>AI,  AJ-AI, 0
        # AN SaaSContractionCancel = if AJ=0,        AI,    0
        # AO SaaSContractionDown   = if AJ>0 AJ<AI,  AI-AJ, 0
        new = p2 if p1 == 0 else 0.0
        exp = (p2 - p1) if (p1 > 0 and p2 > p1) else 0.0
        cancel = p1 if p2 == 0 else 0.0
        down = (p1 - p2) if (p2 > 0 and p2 < p1) else 0.0

        d = by_cur[cur]
        d['start'] += p1
        d['p2_total'] += p2
        d['cancel_raw'] += cancel
        d['expand'] += exp
        d['down'] += down
        d['new_raw'] += new
        d['pe1'] += pe1
        d['pe2'] += pe2

        if pe1 > 0:
            n_pe1 += 1
            if abs(pe1 - p1) < 0.01:
                n_pe1_eq_p1 += 1
            elif pe1 < p1:
                n_pe1_lt_p1 += 1
                if len(pe1_partial) < 10:
                    pe1_partial.append((row[A], p1, pe1, p2, cur))

    print(f'Rows: {n_rows}')
    print(f'Rows with PreExpiryP1 > 0: {n_pe1}')
    print(f'  PreExpiryP1 ≈ SaaSNetP1 (entire P1 was PreExpiry): {n_pe1_eq_p1}')
    print(f'  PreExpiryP1 < SaaSNetP1 (partial): {n_pe1_lt_p1}')
    if pe1_partial:
        print('  Sample partials (CompanyAccount, P1, PE1, P2, Cur):')
        for s in pe1_partial: print(f'   {s}')
    print()

    # Per-currency totals + GRR/NRR (Pre-FX, native)
    print(f'{"Currency":35s} {"Start":>14s} {"PE1":>12s} {"Den":>12s} {"Cancel-PE":>12s} {"Down":>12s} {"Exp":>12s} {"GRR":>7s} {"NRR":>7s}')
    grand = defaultdict(float)
    for cur in sorted(by_cur):
        if cur is None: continue
        d = by_cur[cur]
        start = d['start']
        pe1 = d['pe1']
        cancel_net = d['cancel_raw'] - pe1
        down = d['down']
        exp = d['expand']
        den = start - pe1
        grr = (den - cancel_net - down) / den * 100 if den else 0
        nrr = (den - cancel_net - down + exp) / den * 100 if den else 0
        print(f'{cur:35s} {start:>14,.2f} {pe1:>12,.2f} {den:>12,.2f} {cancel_net:>12,.2f} {down:>12,.2f} {exp:>12,.2f} {grr:>6.2f}% {nrr:>6.2f}%')
        for k in d: grand[k] += d[k]

    # Pre-FX (sum of native, no FX) — use this just as a sanity check
    s, pe1 = grand['start'], grand['pe1']
    den = s - pe1
    cancel_net = grand['cancel_raw'] - pe1
    grr = (den - cancel_net - grand['down']) / den * 100 if den else 0
    nrr = (den - cancel_net - grand['down'] + grand['expand']) / den * 100 if den else 0
    print(f'{"Pre-FX SUM (native, no FX)":35s} {s:>14,.2f} {pe1:>12,.2f} {den:>12,.2f} {cancel_net:>12,.2f} {grand["down"]:>12,.2f} {grand["expand"]:>12,.2f} {grr:>6.2f}% {nrr:>6.2f}%')


if __name__ == '__main__':
    main(sys.argv[1])
