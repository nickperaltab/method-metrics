import { describe, it, expect } from 'vitest';
import {
  TIME_TRACKING,
  REPORTING_START,
  UNUSED_DEDICATED_MARKER,
  INTERNAL_PROJECT_ITEM,
  buildUtilizationSql,
  normalizeMonthRow,
  filterMonths,
  distinctMonths,
  distinctConsultants,
  percent,
  summarize,
  currentMonth,
  isInProgress,
  byMonth,
  byConsultant,
  composition,
  fetchUtilization,
} from '../../src/lib/utilization.js';

/** A normalized consultant-month with only the buckets an assertion cares about. */
const cm = (o = {}) => ({
  consultant: o.consultant ?? 'Ada Lovelace',
  month: o.month ?? '2026-03',
  entries: o.entries ?? 10,
  dedicated: o.dedicated ?? 0,
  ppu: o.ppu ?? 0,
  free: o.free ?? 0,
  other: o.other ?? 0,
  unusedDedicated: o.unusedDedicated ?? 0,
  discountedPaid: o.discountedPaid ?? 0,
  discountedFree: o.discountedFree ?? 0,
  internalProject: o.internalProject ?? 0,
  internalOther: o.internalOther ?? 0,
});

describe('buildUtilizationSql', () => {
  const sql = buildUtilizationSql();

  it('reads TimeTracking and bounds the period to the reporting start', () => {
    expect(sql).toContain(TIME_TRACKING);
    expect(sql).toContain(`DATE '${REPORTING_START}'`);
  });

  it('drops attendance entries so the shift clock is not counted as work', () => {
    expect(sql).toContain('IsAttendenceEntry');
  });

  it('drops deleted entries', () => {
    expect(sql).toContain('IsDeleted');
  });

  it('reads DurationHours alone, because adding DurationMinutes doubles every entry', () => {
    // DurationHours and DurationMinutes are the same duration in two units: a
    // two-hour entry stores 2.0 and 120.0. All 18,083 entries in 2026 satisfy
    // DurationMinutes = DurationHours * 60. Summing both returns exactly twice
    // the real figure, which is the bug int_consultant_work still carries.
    expect(sql).not.toContain('t.DurationHours + t.DurationMinutes');
    expect(sql).toContain('COALESCE(t.DurationHours, t.DurationMinutes / 60.0, 0)');
  });

  it('reads both note markers, which have no column in Method', () => {
    expect(sql).toContain(UNUSED_DEDICATED_MARKER);
    expect(sql).toContain('DISCOUNT (APPROVED|REQUESTED) BY');
  });

  it('fences the discount marker so a customer note mentioning a discount is not counted', () => {
    // 645 entries in 2026 say "discount" in a customer note; only the fenced
    // ones are approvals. A bare DISCOUNT match would quadruple the bucket.
    expect(sql).toContain(String.raw`\*\*\* *DISCOUNT`);
  });

  it('calls internal time the entries with no support type', () => {
    expect(sql).toContain('support_type IS NULL AS internal');
  });

  it('splits internal project hours out by service item', () => {
    expect(sql).toContain(INTERNAL_PROJECT_ITEM);
  });

  it('catches a support type Method has not added yet, so the buckets stay exhaustive', () => {
    expect(sql).toContain("support_type NOT IN ('Dedicated', 'Pay-per-use', 'Free')");
  });

  it('rejects a malformed start and falls back to the reporting start', () => {
    expect(buildUtilizationSql("2026-01-01'; DROP")).toContain(`DATE '${REPORTING_START}'`);
    expect(buildUtilizationSql('nonsense')).not.toContain('nonsense');
  });
});

describe('normalizeMonthRow', () => {
  it('coerces the BQ REST strings into numbers', () => {
    const r = normalizeMonthRow({
      consultant: 'Ada Lovelace',
      month: '2026-03',
      entries: '42',
      dedicated_hours: '110.5',
      ppu_hours: '12',
      free_hours: '4',
      other_hours: '0',
      unused_dedicated_hours: '18.25',
      discounted_paid_hours: '3',
      discounted_free_hours: '0',
      internal_project_hours: '6',
      internal_other_hours: '2',
    });
    expect(r).toMatchObject({
      consultant: 'Ada Lovelace', month: '2026-03', entries: 42,
      dedicated: 110.5, ppu: 12, free: 4, unusedDedicated: 18.25,
      discountedPaid: 3, internalProject: 6, internalOther: 2,
    });
  });

  it('reads a missing bucket as zero hours, not null', () => {
    expect(normalizeMonthRow({ consultant: 'A', month: '2026-01' }).dedicated).toBe(0);
  });
});

describe('summarize', () => {
  const rows = [
    cm({ dedicated: 100, ppu: 20, free: 10, unusedDedicated: 30, discountedPaid: 5, internalProject: 8, internalOther: 2 }),
  ];

  it('bills the hours a customer was invoiced for, deductions included', () => {
    // Dedicated + PPU + bankable + discounted: what went on the invoice.
    expect(summarize(rows).billed).toBe(155);
  });

  it('excludes both deductions and internal time from billable hours', () => {
    expect(summarize(rows).billable).toBe(130);
  });

  it('counts every logged hour in the total', () => {
    expect(summarize(rows).total).toBe(175);
  });

  it('rates billable against everything logged', () => {
    expect(summarize(rows).rate).toBe(Math.round((130 / 175) * 100));
  });

  it('reports discounted and internal together as non-billable', () => {
    expect(summarize(rows).nonBillable).toBe(15);
  });

  it('keeps a discounted Free Hour off the billed side', () => {
    const t = summarize([cm({ free: 10, discountedFree: 2 })]);
    expect(t.billed).toBe(0);
    expect(t.free).toBe(12);
    expect(t.billable).toBe(10);
  });

  it('counts an unknown support type as billable rather than losing it', () => {
    const t = summarize([cm({ other: 7 })]);
    expect(t.total).toBe(7);
    expect(t.billable).toBe(7);
  });

  it('has no rate when nothing was logged', () => {
    expect(summarize([]).rate).toBeNull();
    expect(summarize([]).total).toBe(0);
  });

  it('adds up across months and consultants', () => {
    const t = summarize([cm({ dedicated: 10 }), cm({ month: '2026-04', dedicated: 15 })]);
    expect(t.billable).toBe(25);
    expect(t.months).toBe(2);
  });
});

describe('percent', () => {
  it('is null on a zero denominator rather than zero', () => {
    expect(percent(0, 0)).toBeNull();
    expect(percent(1, 4)).toBe(25);
  });
});

describe('filterMonths', () => {
  const rows = [
    cm({ consultant: 'Ada', month: '2026-01' }),
    cm({ consultant: 'Ada', month: '2026-03' }),
    cm({ consultant: 'Grace', month: '2026-03' }),
  ];

  it('bounds the period inclusively at both ends', () => {
    expect(filterMonths(rows, { from: '2026-03', to: '2026-03' })).toHaveLength(2);
  });

  it('filters to one consultant', () => {
    expect(filterMonths(rows, { consultant: 'Grace' })).toHaveLength(1);
  });

  it('returns everything when no filter is given', () => {
    expect(filterMonths(rows)).toHaveLength(3);
  });
});

describe('distinct helpers', () => {
  const rows = [cm({ consultant: 'Grace', month: '2026-03' }), cm({ consultant: 'Ada', month: '2026-01' })];

  it('sorts months oldest first', () => {
    expect(distinctMonths(rows)).toEqual(['2026-01', '2026-03']);
  });

  it('sorts consultants alphabetically', () => {
    expect(distinctConsultants(rows)).toEqual(['Ada', 'Grace']);
  });
});

describe('isInProgress', () => {
  const now = new Date(2026, 8, 3); // 3 Sep 2026

  it('names the month the clock is in', () => {
    expect(currentMonth(now)).toBe('2026-09');
  });

  it('flags the current month, because bankable hours post on the last day', () => {
    expect(isInProgress('2026-09', now)).toBe(true);
  });

  it('leaves a closed month alone', () => {
    expect(isInProgress('2026-08', now)).toBe(false);
  });
});

describe('byMonth', () => {
  const now = new Date(2026, 8, 3);
  const rows = [
    cm({ month: '2026-08', dedicated: 100, unusedDedicated: 20 }),
    cm({ month: '2026-09', dedicated: 40 }),
  ];

  it('returns one row per month, oldest first', () => {
    expect(byMonth(rows, now).map((m) => m.month)).toEqual(['2026-08', '2026-09']);
  });

  it('marks the open month so its rate is read as a ceiling', () => {
    const [closed, open] = byMonth(rows, now);
    expect(closed.inProgress).toBe(false);
    expect(open.inProgress).toBe(true);
    expect(open.rate).toBe(100);
  });
});

describe('byConsultant', () => {
  const rows = [
    cm({ consultant: 'Ada', month: '2026-01', dedicated: 20 }),
    cm({ consultant: 'Ada', month: '2026-02', dedicated: 20 }),
    cm({ consultant: 'Grace', month: '2026-02', dedicated: 100, internalOther: 100 }),
  ];

  it('ranks on billable hours, not on rate', () => {
    // Ada is at 100% and Grace at 50%; volume still puts Grace first.
    expect(byConsultant(rows).map((r) => r.consultant)).toEqual(['Grace', 'Ada']);
  });

  it('averages billable hours over the months that consultant worked', () => {
    const ada = byConsultant(rows).find((r) => r.consultant === 'Ada');
    expect(ada.billable).toBe(40);
    expect(ada.billablePerMonth).toBe(20);
  });

  it('breaks a tie on name so the order never wobbles', () => {
    const tied = [cm({ consultant: 'Zoe', dedicated: 10 }), cm({ consultant: 'Ada', dedicated: 10 })];
    expect(byConsultant(tied).map((r) => r.consultant)).toEqual(['Ada', 'Zoe']);
  });
});

describe('composition', () => {
  it('splits the logged hours into five shares that cover the whole total', () => {
    const rows = [cm({ dedicated: 50, unusedDedicated: 25, discountedPaid: 5, internalProject: 10, internalOther: 10 })];
    const mix = composition(rows);
    expect(mix.map((b) => b.key)).toEqual(['billable', 'unused', 'discounted', 'internalProject', 'internalOther']);
    expect(mix.reduce((a, b) => a + b.hours, 0)).toBe(100);
    expect(mix.find((b) => b.key === 'billable').share).toBe(50);
  });

  it('has no shares when nothing was logged', () => {
    expect(composition([]).every((b) => b.share === null)).toBe(true);
  });
});

describe('fetchUtilization', () => {
  it('runs the built SQL and normalizes every row', async () => {
    let seen = null;
    const query = async (sql) => {
      seen = sql;
      return { rows: [{ consultant: 'Ada', month: '2026-03', dedicated_hours: '12' }] };
    };
    const rows = await fetchUtilization({ query });
    expect(seen).toContain(TIME_TRACKING);
    expect(rows).toEqual([expect.objectContaining({ consultant: 'Ada', dedicated: 12 })]);
  });
});
