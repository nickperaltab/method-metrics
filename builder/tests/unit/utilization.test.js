import { describe, it, expect } from 'vitest';
import {
  TIME_TRACKING,
  REPORTING_START,
  UNUSED_DEDICATED_MARKER,
  VENDOR_ALIAS_SUFFIX,
  INTERNAL_PROJECT_ITEM,
  buildUtilizationSql,
  normalizeMonthRow,
  filterMonths,
  distinctMonths,
  distinctConsultants,
  floor2,
  percent,
  summarize,
  currentMonth,
  isInProgress,
  byMonth,
  byConsultant,
  composition,
  ladder,
  fetchUtilization,
} from '../../src/lib/utilization.js';
import { parseDay } from '../../src/lib/workingTime.js';

// Entries ran to 8 Sep 2026 while the clock said the 9th. Every test that
// touches capacity pins this so it does not drift with the wall clock.
const AS_OF = parseDay('2026-09-08');

/** A normalized consultant-month with only the buckets an assertion cares about. */
const cm = (o = {}) => ({
  consultant: o.consultant ?? 'Ada Lovelace',
  month: o.month ?? '2026-03',
  onRoster: o.onRoster ?? true,
  attendanceHours: o.attendanceHours ?? 160,
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

  it('keeps attendance entries out of the work buckets', () => {
    expect(sql).toContain('WHERE NOT is_attendance');
  });

  it('builds the roster from attendance entries', () => {
    // Attendance is excluded from every hour bucket but is the only signal for
    // who was on the clock, and utilization is charged only against those people.
    expect(sql).toContain('roster AS (');
    expect(sql).toContain('WHERE is_attendance');
  });

  it('keeps a roster consultant who billed nothing, so a real 0% is not hidden', () => {
    expect(sql).toContain('FULL OUTER JOIN roster r');
    expect(sql).toContain('r.consultant IS NOT NULL AS on_roster');
  });

  it('drops a consultant-month with neither logged hours nor an attendance row', () => {
    expect(sql).toContain('WHERE COALESCE(w.logged_hours, 0) > 0 OR r.consultant IS NOT NULL');
  });

  it('reports the last day with entries, which is what prorates the open month', () => {
    expect(sql).toContain('MAX(txn_date)');
    expect(sql).toContain('AS data_through');
  });

  it('drops deleted entries', () => {
    expect(sql).toContain('IsDeleted');
  });

  it('merges the "(as vendor)" duplicate Entity into the real consultant', () => {
    // Method keeps a second Entity row for seven consultants in 2026 and posts
    // part of their attendance clock to it. Left alone they become phantom
    // consultants on the roster, each charged a full month of capacity against
    // no billable work: 2 in March, 4 in May, 2 in June.
    expect(sql).toContain('REGEXP_REPLACE(e.EntityFullName');
    expect(sql).toContain(VENDOR_ALIAS_SUFFIX);
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

describe('VENDOR_ALIAS_SUFFIX', () => {
  // BigQuery RE2 takes the case flag inline; JS takes it as a flag.
  const re = new RegExp(VENDOR_ALIAS_SUFFIX.replace('(?i)', ''), 'i');
  const strip = (s) => s.replace(re, '').trim();

  it('strips the suffix from all seven real aliases', () => {
    for (const name of ['Cheryl Tong', 'Ethan Miranda', 'Javier Chung', 'Justin Klein',
      'Miguel Teodoro', 'Sarah Chen', 'Vinesh Gobin']) {
      expect(strip(`${name} (as vendor)`)).toBe(name);
    }
  });

  it('ignores case, because the suffix is text someone typed into Method', () => {
    expect(strip('Sarah Chen (as Vendor)')).toBe('Sarah Chen');
    expect(strip('Sarah Chen (AS VENDOR)')).toBe('Sarah Chen');
  });

  it('leaves a normal consultant name alone', () => {
    expect(strip('Miguel Teodoro')).toBe('Miguel Teodoro');
    expect(strip('Brandon Saltzman')).toBe('Brandon Saltzman');
  });

  it('is anchored to the end, so it cannot eat a real name', () => {
    expect(strip('Vendor Services Inc')).toBe('Vendor Services Inc');
    expect(strip('A (as vendor) B')).toBe('A (as vendor) B');
  });
});

describe('normalizeMonthRow', () => {
  it('coerces the BQ REST strings into numbers', () => {
    const r = normalizeMonthRow({
      consultant: 'Ada Lovelace',
      month: '2026-03',
      on_roster: 'true',
      attendance_hours: '160',
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
      consultant: 'Ada Lovelace', month: '2026-03', entries: 42, onRoster: true,
      attendanceHours: 160, dedicated: 110.5, ppu: 12, free: 4, unusedDedicated: 18.25,
      discountedPaid: 3, internalProject: 6, internalOther: 2,
    });
  });

  it('reads the BQ boolean strings, not their truthiness', () => {
    // 'false' is a truthy JS string; reading it as a boolean would put every
    // consultant on the roster and charge capacity to all of them.
    expect(normalizeMonthRow({ on_roster: 'false' }).onRoster).toBe(false);
    expect(normalizeMonthRow({ on_roster: 'true' }).onRoster).toBe(true);
    expect(normalizeMonthRow({}).onRoster).toBe(false);
  });

  it('reads a missing bucket as zero hours, not null', () => {
    expect(normalizeMonthRow({ consultant: 'A', month: '2026-01' }).dedicated).toBe(0);
  });
});

describe('floor2', () => {
  it('rounds down, never up', () => {
    expect(floor2(72.129)).toBe(72.12);
    expect(floor2(72.125)).toBe(72.12);
    expect(floor2(99.999)).toBe(99.99);
  });

  it('does not lose a whole number to binary floating point', () => {
    // 0.29 * 100 is 28.999999999999996 in IEEE 754. A naive floor returns 28.99.
    expect(floor2(29)).toBe(29);
    expect(floor2(0.29 * 100)).toBe(29);
    expect(floor2(1.005 * 100)).toBe(100.5);
  });

  it('is null on something that is not a number', () => {
    expect(floor2(NaN)).toBeNull();
    expect(floor2(Infinity)).toBeNull();
  });
});

describe('percent', () => {
  it('floors to two decimals', () => {
    // Brandon's worked example: 115.4 billable against August's 160 hours.
    expect(percent(115.4, 160)).toBe(72.12);
    expect(percent(1, 3)).toBe(33.33);
  });

  it('is null on a zero denominator rather than zero', () => {
    expect(percent(0, 0)).toBeNull();
    expect(percent(1, 4)).toBe(25);
  });
});

describe('summarize', () => {
  const rows = [
    cm({ dedicated: 100, ppu: 20, free: 10, unusedDedicated: 30, discountedPaid: 5, internalProject: 8, internalOther: 2 }),
  ];

  it('bills the hours a customer was invoiced for, deductions included', () => {
    // Dedicated + PPU + bankable + discounted: what went on the invoice.
    expect(summarize(rows, AS_OF).billed).toBe(155);
  });

  it('excludes both deductions and internal time from billable hours', () => {
    expect(summarize(rows, AS_OF).billable).toBe(130);
  });

  it('counts every logged hour in the total', () => {
    expect(summarize(rows, AS_OF).total).toBe(175);
  });

  it('reports discounted and internal together as non-billable', () => {
    expect(summarize(rows, AS_OF).nonBillable).toBe(15);
  });

  it('keeps a discounted Free Hour off the billed side', () => {
    const t = summarize([cm({ free: 10, discountedFree: 2 })], AS_OF);
    expect(t.billed).toBe(0);
    expect(t.free).toBe(12);
    expect(t.billable).toBe(10);
  });

  it('counts an unknown support type as billable rather than losing it', () => {
    const t = summarize([cm({ other: 7 })], AS_OF);
    expect(t.total).toBe(7);
    expect(t.billable).toBe(7);
  });

  it('adds up across months and consultants', () => {
    const t = summarize([cm({ dedicated: 10 }), cm({ month: '2026-04', dedicated: 15 })], AS_OF);
    expect(t.billable).toBe(25);
    expect(t.months).toBe(2);
  });

  describe('utilization', () => {
    it('is billable hours over the working hours of the month', () => {
      // One consultant, August 2026: 20 working days, 160 hours.
      const t = summarize([cm({ month: '2026-08', dedicated: 115.4 })], AS_OF);
      expect(t.capacity).toBe(160);
      expect(t.utilization).toBe(72.12);
    });

    it('charges every roster consultant a month of working hours', () => {
      const rows2 = [
        cm({ consultant: 'Ada', month: '2026-08', dedicated: 120 }),
        cm({ consultant: 'Grace', month: '2026-08', dedicated: 120 }),
      ];
      const t = summarize(rows2, AS_OF);
      expect(t.capacity).toBe(320);
      expect(t.utilization).toBe(75);
    });

    it('charges nothing for a consultant who was not on the roster', () => {
      // A manager who logged three hours with no attendance record: neither
      // their hours nor a month of capacity belongs in the ratio.
      const t = summarize([
        cm({ consultant: 'Ada', month: '2026-08', dedicated: 120 }),
        cm({ consultant: 'Zach', month: '2026-08', dedicated: 3, onRoster: false }),
      ], AS_OF);
      expect(t.capacity).toBe(160);
      expect(t.rosterBillable).toBe(120);
      expect(t.utilization).toBe(75);
      // The hours themselves are still reported; only the ratio excludes them.
      expect(t.billable).toBe(123);
    });

    it('has no utilization for a consultant with no working hours', () => {
      const t = summarize([cm({ month: '2026-08', dedicated: 3, onRoster: false })], AS_OF);
      expect(t.capacity).toBe(0);
      expect(t.utilization).toBeNull();
    });

    it('is a real zero for a roster consultant who billed nothing', () => {
      const t = summarize([cm({ month: '2026-08', internalOther: 40 })], AS_OF);
      expect(t.capacity).toBe(160);
      expect(t.utilization).toBe(0);
    });

    it('prorates the open month to the working days with entries', () => {
      // September to 8 Sep is five working days, so 40 hours, not 168.
      const t = summarize([cm({ month: '2026-09', dedicated: 30 })], AS_OF);
      expect(t.capacity).toBe(40);
      expect(t.utilization).toBe(75);
    });

    it('sums capacity across a multi-month span', () => {
      const t = summarize([
        cm({ month: '2026-07', dedicated: 100 }),
        cm({ month: '2026-08', dedicated: 100 }),
      ], AS_OF);
      expect(t.capacity).toBe(176 + 160);
    });
  });

  // Miguel Teodoro's real August 2026, pulled entry by entry on 2026-09-09 while
  // auditing why the screen disagreed with Brandon's 99.83. It is the regression
  // case for the whole ladder: every one of the four bases has a known value.
  describe('the reconciliation ladder (Miguel Teodoro, August 2026)', () => {
    const miguel = [cm({
      consultant: 'Miguel Teodoro', month: '2026-08', entries: 127,
      dedicated: 74.3167, ppu: 2, free: 9,
      unusedDedicated: 14.5167, discountedPaid: 2,
    })];
    const t = summarize(miguel, AS_OF);

    it('puts every customer hour in the all-in figure', () => {
      expect(t.allIn).toBe(101.83);
      // Internal is zero for this month, so all in equals hours logged.
      expect(t.total).toBe(101.83);
    });

    it('reproduces the 99.83 the audit was reconciling to', () => {
      expect(t.exDiscounted).toBe(99.83);
    });

    it('takes bankable off for the without-bankable figure', () => {
      expect(t.exBankable).toBe(87.31);
    });

    it('takes both off for billable', () => {
      expect(t.billable).toBe(85.31);
    });

    it('reports the two deductions separately so the ladder can be checked', () => {
      expect(t.unusedDedicated).toBe(14.51);
      expect(t.discounted).toBe(2);
      expect(t.free).toBe(9);
      expect(t.internalProject + t.internalOther).toBe(0);
    });

    it('rates all four bases against the same 160 working hours', () => {
      expect(t.capacity).toBe(160);
      expect(t.utilizationAllIn).toBe(63.64);
      expect(t.utilizationExDiscounted).toBe(62.39);
      expect(t.utilizationExBankable).toBe(54.57);
      expect(t.utilization).toBe(53.32);
    });

    it('descends monotonically, all in first', () => {
      const rungs = ladder(t);
      expect(rungs.map((r) => r.key)).toEqual(['allIn', 'exDiscounted', 'exBankable', 'billable']);
      const hours = rungs.map((r) => r.hours);
      expect(hours).toEqual([...hours].sort((a, b) => b - a));
    });
  });

  describe('% of billable work', () => {
    it('rates billable against everything logged', () => {
      expect(summarize(rows, AS_OF).billableShare).toBe(percent(130, 175));
    });

    it('separates a consultant who bills all of a short month from a full one', () => {
      // The whole reason both rates exist: 40 billable hours in August is every
      // logged hour and a quarter of the working month.
      const t = summarize([cm({ month: '2026-08', dedicated: 40 })], AS_OF);
      expect(t.billableShare).toBe(100);
      expect(t.utilization).toBe(25);
    });

    it('has no share when nothing was logged', () => {
      expect(summarize([], AS_OF).billableShare).toBeNull();
      expect(summarize([], AS_OF).total).toBe(0);
    });
  });

  it('counts the roster so the working-hours figure can be explained', () => {
    const t = summarize([
      cm({ consultant: 'Ada', month: '2026-08' }),
      cm({ consultant: 'Grace', month: '2026-08' }),
      cm({ consultant: 'Zach', month: '2026-08', onRoster: false }),
    ], AS_OF);
    expect(t.rosterConsultants).toBe(2);
    expect(t.rosterMonths).toBe(2);
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
  it('names the month the newest data falls in', () => {
    expect(currentMonth(AS_OF)).toBe('2026-09');
  });

  it('flags that month, because bankable hours post on the last day', () => {
    expect(isInProgress('2026-09', AS_OF)).toBe(true);
  });

  it('leaves a closed month alone', () => {
    expect(isInProgress('2026-08', AS_OF)).toBe(false);
  });
});

describe('byMonth', () => {
  const rows = [
    cm({ month: '2026-08', dedicated: 100, unusedDedicated: 20 }),
    cm({ month: '2026-09', dedicated: 40 }),
  ];

  it('returns one row per month, oldest first', () => {
    expect(byMonth(rows, AS_OF).map((m) => m.month)).toEqual(['2026-08', '2026-09']);
  });

  it('marks the open month so its figures are read as a ceiling', () => {
    const [closed, open] = byMonth(rows, AS_OF);
    expect(closed.inProgress).toBe(false);
    expect(open.inProgress).toBe(true);
  });

  it('reports both rates per month', () => {
    const [aug] = byMonth(rows, AS_OF);
    expect(aug.capacity).toBe(160);
    expect(aug.utilization).toBe(62.5);
    expect(aug.billableShare).toBe(percent(100, 120));
  });

  it('carries the full working days of the month even when capacity is prorated', () => {
    const [, sep] = byMonth(rows, AS_OF);
    expect(sep.workingDays).toBe(21);
    expect(sep.workingHours).toBe(168);
    expect(sep.capacity).toBe(40);
  });
});

describe('byConsultant', () => {
  const rows = [
    cm({ consultant: 'Ada', month: '2026-01', dedicated: 20 }),
    cm({ consultant: 'Ada', month: '2026-02', dedicated: 20 }),
    cm({ consultant: 'Grace', month: '2026-02', dedicated: 100, internalOther: 100 }),
  ];

  it('ranks on billable hours, not on a rate', () => {
    // Ada is at 100% of billable work and Grace at 50%; volume still puts
    // Grace first.
    expect(byConsultant(rows, AS_OF).map((r) => r.consultant)).toEqual(['Grace', 'Ada']);
  });

  it('averages billable hours over the months that consultant worked', () => {
    const ada = byConsultant(rows, AS_OF).find((r) => r.consultant === 'Ada');
    expect(ada.billable).toBe(40);
    expect(ada.billablePerMonth).toBe(20);
  });

  it('gives each consultant their own working hours', () => {
    // Ada worked Jan (168) and Feb (152); Grace only Feb.
    const [grace, ada] = byConsultant(rows, AS_OF);
    expect(ada.capacity).toBe(320);
    expect(grace.capacity).toBe(152);
  });

  it('breaks a tie on name so the order never wobbles', () => {
    const tied = [cm({ consultant: 'Zoe', dedicated: 10 }), cm({ consultant: 'Ada', dedicated: 10 })];
    expect(byConsultant(tied, AS_OF).map((r) => r.consultant)).toEqual(['Ada', 'Zoe']);
  });
});

describe('composition', () => {
  it('splits the logged hours into five shares that cover the whole total', () => {
    const rows = [cm({ dedicated: 50, unusedDedicated: 25, discountedPaid: 5, internalProject: 10, internalOther: 10 })];
    const mix = composition(rows, AS_OF);
    expect(mix.map((b) => b.key)).toEqual(['billable', 'unused', 'discounted', 'internalProject', 'internalOther']);
    expect(mix.reduce((a, b) => a + b.hours, 0)).toBe(100);
    expect(mix.find((b) => b.key === 'billable').share).toBe(50);
  });

  it('has no shares when nothing was logged', () => {
    expect(composition([], AS_OF).every((b) => b.share === null)).toBe(true);
  });
});

describe('fetchUtilization', () => {
  it('runs the built SQL and normalizes every row', async () => {
    let seen = null;
    const query = async (sql) => {
      seen = sql;
      return { rows: [{ consultant: 'Ada', month: '2026-03', dedicated_hours: '12', on_roster: 'true', data_through: '2026-09-08' }] };
    };
    const { rows } = await fetchUtilization({ query });
    expect(seen).toContain(TIME_TRACKING);
    expect(rows).toEqual([expect.objectContaining({ consultant: 'Ada', dedicated: 12, onRoster: true })]);
  });

  it('reads the last day with data off the result and hands back a date', async () => {
    const query = async () => ({ rows: [{ consultant: 'Ada', month: '2026-09', data_through: '2026-09-08' }] });
    const { dataThrough, asOf } = await fetchUtilization({ query });
    expect(dataThrough).toBe('2026-09-08');
    expect(asOf.getDate()).toBe(8);
    expect(asOf.getMonth()).toBe(8);
  });

  it('falls back to today on an empty result, which has nothing to prorate anyway', async () => {
    const query = async () => ({ rows: [] });
    const { rows, dataThrough, asOf } = await fetchUtilization({ query });
    expect(rows).toEqual([]);
    expect(dataThrough).toBeNull();
    expect(asOf).toBeInstanceOf(Date);
  });
});
