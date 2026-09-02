import { describe, it, expect } from 'vitest';
import {
  FREE_HOUR_VIEW,
  FAIR_WINDOW_DAYS,
  buildFreeHoursSql,
  normalizeFreeHourRow,
  conversionType,
  daysToConversion,
  canConvert,
  isRepeat,
  matchesSegment,
  filterCalls,
  distinctLastFhMonths,
  median,
  percent,
  summarize,
  byMonth,
  byConsultant,
  bySequence,
  conversions,
  sortRows,
  isTrial,
  byAgreementSent,
  agreementsToOwnFreeHourAccounts,
  countAgreementsToOwnFreeHourAccounts,
  filterAgreements,
  normalizeAgreementRow,
  buildAgreementsSentSql,
  fetchAgreementsSent,
  AGREEMENT_WINDOW_DAYS,
  fetchFreeHours,
} from '../../src/lib/freeHours.js';

/** A normalized Free Hour with only the fields an assertion cares about set. */
const fh = (o = {}) => ({
  id: o.id ?? 1,
  accountRecordId: o.accountRecordId ?? 100,
  account: o.account ?? 'acme',
  consultant: o.consultant ?? 'Ada Lovelace',
  callDate: o.callDate ?? '2026-03-10',
  month: o.month ?? (o.callDate ?? '2026-03-10').slice(0, 7),
  seq: o.seq ?? 1,
  openCaseAtCall: o.openCaseAtCall ?? false,
  payingSaasAtCall: o.payingSaasAtCall ?? false,
  saasStateUnknown: o.saasStateUnknown ?? false,
  daysToAgreementSent: o.daysToAgreementSent ?? null,
  priorConsultingCase: o.priorConsultingCase ?? false,
  daysToPpu: o.daysToPpu ?? null,
  daysToDep: o.daysToDep ?? null,
  daysToAgreement: o.daysToAgreement ?? null,
  lastFhMonth: o.lastFhMonth ?? (o.callDate ?? '2026-03-10').slice(0, 7),
  accountFhCount: o.accountFhCount ?? 1,
  paidHours90d: o.paidHours90d ?? 0,
  daysElapsed: o.daysElapsed ?? 200,
});

describe('buildFreeHoursSql', () => {
  it('reads the view and bounds the period to the reporting start', () => {
    const sql = buildFreeHoursSql();
    expect(sql).toContain(FREE_HOUR_VIEW);
    expect(sql).toMatch(/cohort_month >= DATE '2026-01-01'/);
    expect(sql).toMatch(/ORDER BY v\.call_date DESC/);
  });

  it('computes day offsets in SQL so the client never does date maths', () => {
    const sql = buildFreeHoursSql();
    expect(sql).toMatch(/DATE_DIFF\(v\.first_ppu_date, v\.call_date, DAY\)\) AS days_to_ppu/);
    expect(sql).toMatch(/DATE_DIFF\(v\.first_dep_date, v\.call_date, DAY\)\) AS days_to_dep/);
    expect(sql).toMatch(/DATE_DIFF\(v\.first_agreement_date, v\.call_date, DAY\)\) AS days_to_agreement/);
  });

  it('refuses a malformed start rather than interpolating it', () => {
    const sql = buildFreeHoursSql("2026-01-01'; DROP TABLE x --");
    expect(sql).toContain("DATE '2026-01-01'");
    expect(sql).not.toContain('DROP TABLE');
  });
});

describe('normalizeFreeHourRow', () => {
  it('types the BQ REST strings, including string booleans', () => {
    const row = normalizeFreeHourRow({
      fh_id: '9', account_record_id: '4242', account: 'acme', consultant: 'Ada Lovelace',
      call_date: '2026-03-10', cohort_month: '2026-03', fh_seq: '2',
      open_case_at_call: 'true', prior_consulting_case: 'false',
      days_to_ppu: '12', days_to_dep: '', days_to_agreement: '4',
      paid_hours_90d: '18.5', days_elapsed: '90',
    });
    expect(row).toMatchObject({
      id: 9, accountRecordId: 4242, seq: 2,
      openCaseAtCall: true, priorConsultingCase: false,
      daysToPpu: 12, daysToDep: null, daysToAgreement: 4,
      paidHours90d: 18.5, daysElapsed: 90,
    });
  });

  it('treats a day-0 conversion as real, not as missing', () => {
    const row = normalizeFreeHourRow({ fh_id: '1', days_to_agreement: '0' });
    expect(row.daysToAgreement).toBe(0);
    expect(conversionType({ ...fh(), daysToPpu: 0 })).toBe('ppu');
  });
});

describe('conversionType', () => {
  it('is null when nothing followed the call', () => {
    expect(conversionType(fh())).toBeNull();
  });

  it('credits whichever paid engagement came first', () => {
    expect(conversionType(fh({ daysToPpu: 30, daysToDep: 5 }))).toBe('dep');
    expect(conversionType(fh({ daysToPpu: 5, daysToDep: 30 }))).toBe('ppu');
  });

  it('bounds to the window when one is given', () => {
    const call = fh({ daysToPpu: 45 });
    expect(conversionType(call)).toBe('ppu');
    expect(conversionType(call, FAIR_WINDOW_DAYS)).toBeNull();
  });

  it('ignores a negative offset — paid work before the call is not a conversion', () => {
    expect(conversionType(fh({ daysToPpu: -3 }))).toBeNull();
  });
});

describe('daysToConversion', () => {
  it('returns the offset of the engagement that was credited', () => {
    expect(daysToConversion(fh({ daysToPpu: 5, daysToDep: 30 }))).toBe(5);
    expect(daysToConversion(fh())).toBeNull();
  });
});

describe('segments', () => {
  it('splits first vs repeat on the account sequence', () => {
    expect(isRepeat(fh({ seq: 1 }))).toBe(false);
    expect(isRepeat(fh({ seq: 2 }))).toBe(true);
    expect(matchesSegment(fh({ seq: 1 }), 'first')).toBe(true);
    expect(matchesSegment(fh({ seq: 1 }), 'repeat')).toBe(false);
    expect(matchesSegment(fh({ priorConsultingCase: true }), 'prior')).toBe(true);
    expect(matchesSegment(fh({ seq: 7 }), 'all')).toBe(true);
  });

  it('excludes accounts with a consulting case open at the call', () => {
    expect(canConvert(fh({ openCaseAtCall: true }))).toBe(false);
    expect(canConvert(fh())).toBe(true);
  });
});

describe('filterCalls', () => {
  const calls = [
    fh({ id: 1, month: '2026-01', consultant: 'Ada Lovelace', seq: 1 }),
    fh({ id: 2, month: '2026-03', consultant: 'Grace Hopper', seq: 2 }),
    fh({ id: 3, month: '2026-05', consultant: 'Ada Lovelace', seq: 1 }),
  ];

  it('bounds the period inclusively at both ends', () => {
    expect(filterCalls(calls, { from: '2026-03', to: '2026-05' }).map((c) => c.id)).toEqual([2, 3]);
    expect(filterCalls(calls, { from: '2026-01', to: '2026-01' }).map((c) => c.id)).toEqual([1]);
  });

  it('combines consultant and segment with the period', () => {
    expect(filterCalls(calls, { consultant: 'Ada Lovelace' }).map((c) => c.id)).toEqual([1, 3]);
    expect(filterCalls(calls, { segment: 'repeat' }).map((c) => c.id)).toEqual([2]);
    expect(filterCalls(calls, { from: '2026-03', consultant: 'Ada Lovelace' }).map((c) => c.id)).toEqual([3]);
  });
});

describe('last Free Hour filter', () => {
  // Same account, three sessions: the account's last Free Hour is May.
  const calls = [
    fh({ id: 1, month: '2026-01', lastFhMonth: '2026-05' }),
    fh({ id: 2, month: '2026-03', lastFhMonth: '2026-05' }),
    fh({ id: 3, month: '2026-05', lastFhMonth: '2026-05' }),
    // A different account nobody has spoken to since February.
    fh({ id: 4, month: '2026-02', lastFhMonth: '2026-02' }),
  ];

  it('selects on the account, not on the call in front of you', () => {
    // January's session belongs to an account last seen in May, so bounding the
    // last Free Hour to May keeps it — even though the call itself is January.
    const may = filterCalls(calls, { lastFrom: '2026-05', lastTo: '2026-05' });
    expect(may.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it('finds accounts nobody has spoken to since a given month', () => {
    const cold = filterCalls(calls, { lastTo: '2026-02' });
    expect(cold.map((c) => c.id)).toEqual([4]);
  });

  it('composes with the period filter rather than replacing it', () => {
    const both = filterCalls(calls, { from: '2026-03', lastFrom: '2026-05' });
    expect(both.map((c) => c.id)).toEqual([2, 3]);
  });

  it('is inert when neither bound is given', () => {
    expect(filterCalls(calls, {}).map((c) => c.id)).toEqual([1, 2, 3, 4]);
  });

  it('lists the distinct months an account was last seen', () => {
    expect(distinctLastFhMonths(calls)).toEqual(['2026-02', '2026-05']);
  });
});

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 6])).toBe(3); // rounded mean of the middle pair
    expect(median([])).toBeNull();
  });

  it('drops nulls rather than treating them as zero', () => {
    expect(median([null, 10, null, 20])).toBe(15);
  });
});

describe('percent', () => {
  it('is null on an empty denominator instead of NaN', () => {
    expect(percent(0, 0)).toBeNull();
    expect(percent(1, 3)).toBe(33);
  });
});

describe('summarize', () => {
  const calls = [
    fh({ id: 1, daysToPpu: 4, daysToAgreement: 2, paidHours90d: 10 }),
    fh({ id: 2, daysToDep: 40, daysToAgreement: 35, paidHours90d: 6 }),
    fh({ id: 3 }),
    fh({ id: 4, openCaseAtCall: true, daysToDep: 3 }),
  ];

  it('keeps open-case calls in the delivered count but out of the rate', () => {
    const t = summarize(calls);
    expect(t.delivered).toBe(4);
    expect(t.openCaseAtCall).toBe(1);
    expect(t.eligible).toBe(3);
    expect(t.converted).toBe(2);
    expect(t.rate).toBe(67);
  });

  it('splits PPU and Dedicated and sums only converted hours', () => {
    const t = summarize(calls);
    expect(t.ppu).toBe(1);
    expect(t.dep).toBe(1);
    expect(t.paidHours).toBe(16);
  });

  it('reports the like-for-like rate on the same window on both sides', () => {
    const t = summarize(calls);
    // three eligible, all old enough; only the day-4 one converted inside 30 days
    expect(t.fairReady).toBe(3);
    expect(t.fairConverted).toBe(1);
    expect(t.fairRate).toBe(33);
    // and it is lower than the unbounded rate, which is the whole point
    expect(t.fairRate).toBeLessThan(t.rate);
  });

  it('measures time to signature from the agreement, not the first billed hour', () => {
    const t = summarize(calls);
    expect(t.signedCount).toBe(2);
    expect(t.medianDaysToAgreement).toBe(19); // (2 + 35) / 2
  });

  it('counts calls too recent to have had the full window', () => {
    const t = summarize([fh({ daysElapsed: 3 }), fh({ daysElapsed: 400 })]);
    expect(t.stillYoung).toBe(1);
    expect(t.fairReady).toBe(1);
  });

  it('does not divide by zero on an empty set', () => {
    const t = summarize([]);
    expect(t.delivered).toBe(0);
    expect(t.rate).toBeNull();
    expect(t.medianDaysToAgreement).toBeNull();
  });
});

describe('byMonth', () => {
  it('returns one row per month, oldest first, with the youngest call age', () => {
    const rows = byMonth([
      fh({ month: '2026-05', daysElapsed: 5 }),
      fh({ month: '2026-01', daysElapsed: 200 }),
      fh({ month: '2026-05', daysElapsed: 40 }),
    ]);
    expect(rows.map((r) => r.month)).toEqual(['2026-01', '2026-05']);
    expect(rows[1].delivered).toBe(2);
    expect(rows[1].youngest).toBe(5);
  });
});

describe('byConsultant', () => {
  it('ranks by rate, then by volume', () => {
    const rows = byConsultant([
      fh({ consultant: 'Low', daysToPpu: null }),
      fh({ consultant: 'High', daysToPpu: 3 }),
      fh({ consultant: 'High', daysToPpu: 3 }),
    ]);
    expect(rows[0].consultant).toBe('High');
    expect(rows[0].rate).toBe(100);
    expect(rows[1].rate).toBe(0);
  });
});

describe('bySequence', () => {
  it('buckets 1st/2nd/3rd/4th+ and always returns all four', () => {
    const rows = bySequence([fh({ seq: 1 }), fh({ seq: 2 }), fh({ seq: 9 })]);
    expect(rows.map((r) => r.key)).toEqual(['1st', '2nd', '3rd', '4th+']);
    expect(rows[0].delivered).toBe(1);
    expect(rows[2].delivered).toBe(0);
    expect(rows[3].delivered).toBe(1);
  });

  it('surfaces that repeats skew toward accounts mid-engagement', () => {
    const rows = bySequence([
      fh({ seq: 1 }),
      fh({ seq: 2, openCaseAtCall: true }),
      fh({ seq: 2, openCaseAtCall: true }),
    ]);
    expect(rows[0].openCaseAtCall).toBe(0);
    expect(rows[1].openCaseAtCall).toBe(2);
    expect(rows[1].eligible).toBe(0);
    expect(rows[1].rate).toBeNull();
  });
});

describe('conversions', () => {
  it('lists only converted, eligible calls, newest first', () => {
    const rows = conversions([
      fh({ id: 1, callDate: '2026-01-05', daysToPpu: 2 }),
      fh({ id: 2, callDate: '2026-04-05', daysToDep: 9 }),
      fh({ id: 3, callDate: '2026-05-05' }),
      fh({ id: 4, callDate: '2026-06-05', openCaseAtCall: true, daysToPpu: 1 }),
    ]);
    expect(rows.map((r) => r.id)).toEqual([2, 1]);
  });
});

describe('sortRows', () => {
  const rows = [
    { name: 'ada', rate: 40 },
    { name: 'cyd', rate: 90 },
    { name: 'bo', rate: null },
    { name: 'dev', rate: 40 },
  ];
  const byRate = (dir) => sortRows(rows, { value: (r) => r.rate, dir }).map((r) => r.name);

  it('sorts numbers descending by default', () => {
    expect(byRate()).toEqual(['cyd', 'ada', 'dev', 'bo']);
  });

  it('sorts ascending when asked', () => {
    expect(byRate('asc')).toEqual(['ada', 'dev', 'cyd', 'bo']);
  });

  it('keeps missing values last in both directions', () => {
    expect(byRate().at(-1)).toBe('bo');
    expect(byRate('asc').at(-1)).toBe('bo');
  });

  it('sorts text case-insensitively by locale', () => {
    const out = sortRows(
      [{ n: 'Zoe' }, { n: 'ada' }, { n: 'Bo' }],
      { value: (r) => r.n, dir: 'asc' },
    );
    expect(out.map((r) => r.n)).toEqual(['ada', 'Bo', 'Zoe']);
  });

  it('breaks ties with the tiebreak, ignoring direction', () => {
    const tiebreak = (a, b) => a.name.localeCompare(b.name);
    const desc = sortRows(rows, { value: (r) => r.rate, dir: 'desc', tiebreak });
    const asc = sortRows(rows, { value: (r) => r.rate, dir: 'asc', tiebreak });
    expect(desc.map((r) => r.name)).toEqual(['cyd', 'ada', 'dev', 'bo']);
    expect(asc.map((r) => r.name)).toEqual(['ada', 'dev', 'cyd', 'bo']);
  });

  it('leaves the input array untouched', () => {
    const before = rows.map((r) => r.name);
    sortRows(rows, { value: (r) => r.rate, dir: 'asc' });
    expect(rows.map((r) => r.name)).toEqual(before);
  });

  it('sinks a consultant with no eligible Free Hours rather than ranking them 0%', () => {
    const reps = byConsultant([
      fh({ consultant: 'Only paying', openCaseAtCall: true, daysToPpu: null }),
      fh({ consultant: 'Converted', daysToPpu: 4 }),
      fh({ consultant: 'Missed', daysToPpu: null }),
    ]);
    const asc = sortRows(reps, { value: (r) => (r.eligible ? r.rate : null), dir: 'asc' });
    expect(asc.map((r) => r.consultant)).toEqual(['Missed', 'Converted', 'Only paying']);
  });
});

describe('eligibility', () => {
  it('frees an account whose earlier consulting case has closed', () => {
    // The whole point of the rule change: past PS work no longer disqualifies.
    expect(canConvert(fh({ openCaseAtCall: false, priorConsultingCase: true }))).toBe(true);
    expect(canConvert(fh({ openCaseAtCall: true }))).toBe(false);
  });

  it('counts an open-case call as delivered but keeps it out of the rate', () => {
    const t = summarize([
      fh({ openCaseAtCall: true, daysToPpu: 5 }),
      fh({ openCaseAtCall: false, daysToPpu: 5 }),
    ]);
    expect(t.delivered).toBe(2);
    expect(t.openCaseAtCall).toBe(1);
    expect(t.eligible).toBe(1);
    expect(t.converted).toBe(1);
    expect(t.rate).toBe(100);
  });
});

describe('trial vs existing customer', () => {
  it('treats no paying SaaS MRR in the call month as a trial', () => {
    expect(isTrial(fh({ payingSaasAtCall: false }))).toBe(true);
    expect(isTrial(fh({ payingSaasAtCall: true }))).toBe(false);
    expect(matchesSegment(fh({ payingSaasAtCall: false }), 'trial')).toBe(true);
    expect(matchesSegment(fh({ payingSaasAtCall: true }), 'customer')).toBe(true);
    expect(matchesSegment(fh({ payingSaasAtCall: true }), 'trial')).toBe(false);
  });

  it('splits delivered into trial and existing-customer counts', () => {
    const t = summarize([
      fh({ payingSaasAtCall: false }),
      fh({ payingSaasAtCall: false }),
      fh({ payingSaasAtCall: true }),
    ]);
    expect(t.trialFreeHours).toBe(2);
    expect(t.customerFreeHours).toBe(1);
  });
});

describe('agreements the rep sent', () => {
  it('rates agreements against trial Free Hours, not all of them', () => {
    const t = summarize([
      fh({ payingSaasAtCall: false, daysToAgreementSent: 3 }),
      fh({ payingSaasAtCall: false, daysToAgreementSent: null }),
      // An existing customer with an agreement must not lift the trial rate.
      fh({ payingSaasAtCall: true, daysToAgreementSent: 1 }),
    ]);
    expect(t.trialFreeHours).toBe(2);
    expect(t.repSentAgreement).toBe(2);
    expect(t.trialRepSentAgreement).toBe(1);
    expect(t.agreementRateOfTrial).toBe(50);
  });

  it('has no agreement rate when there were no trial Free Hours', () => {
    expect(summarize([fh({ payingSaasAtCall: true })]).agreementRateOfTrial).toBeNull();
  });

  it('reports the median days until the rep sent one', () => {
    const t = summarize([
      fh({ daysToAgreementSent: 1 }),
      fh({ daysToAgreementSent: 9 }),
      fh({ daysToAgreementSent: 5 }),
    ]);
    expect(t.medianDaysToAgreementSent).toBe(5);
  });

  it('splits Free Hours four ways by account type and whether one was sent', () => {
    const rows = byAgreementSent([
      fh({ payingSaasAtCall: false, daysToAgreementSent: 2, daysToPpu: 10 }),
      fh({ payingSaasAtCall: false, daysToAgreementSent: null }),
      fh({ payingSaasAtCall: true, daysToAgreementSent: 4 }),
    ]);
    expect(rows.map((r) => r.key)).toEqual(['trial-sent', 'trial-none', 'cust-sent', 'cust-none']);
    expect(rows[0]).toMatchObject({ delivered: 1, converted: 1, sent: true });
    expect(rows[1]).toMatchObject({ delivered: 1, converted: 0, sent: false });
    expect(rows[3].delivered).toBe(0);
  });
});

describe('agreements sent to the rep’s own Free Hour accounts', () => {
  const agr = (o) => ({
    id: o.id,
    accountRecordId: o.account,
    consultant: o.consultant ?? 'Ada Lovelace',
    contractType: o.type ?? 'Pay-Per-Use',
    sentDate: o.date ?? '2026-03-10',
    accepted: o.accepted ?? false,
    month: (o.date ?? '2026-03-10').slice(0, 7),
  });
  const call = (o) => fh({
    consultant: o.consultant ?? 'Ada Lovelace',
    accountRecordId: o.account,
    callDate: o.date ?? '2026-03-01',
    month: (o.date ?? '2026-03-01').slice(0, 7),
  });

  it('counts one the same rep sent to their own Free Hour account', () => {
    const found = agreementsToOwnFreeHourAccounts(
      [call({ account: 100 })],
      [agr({ id: 1, account: 100 })],
    );
    expect(found.map((a) => a.id)).toEqual([1]);
  });

  it('ignores one on that account from a DIFFERENT rep', () => {
    // The proposal desk. This match is the whole reason the column exists.
    expect(agreementsToOwnFreeHourAccounts(
      [call({ account: 100 })],
      [agr({ id: 1, account: 100, consultant: 'Phuong Phan' })],
    )).toEqual([]);
  });

  it('ignores one for an account they never gave a Free Hour to', () => {
    expect(agreementsToOwnFreeHourAccounts(
      [call({ account: 100 })],
      [agr({ id: 1, account: 999 })],
    )).toEqual([]);
  });

  it('does not care when it was sent relative to the Free Hour', () => {
    // Reps often write the agreement during the call, and sometimes before it.
    const calls = [call({ account: 100, date: '2026-03-15' })];
    const sameDay = agr({ id: 1, account: 100, date: '2026-03-15' });
    const before = agr({ id: 2, account: 100, date: '2026-03-02' });
    const longAfter = agr({ id: 3, account: 100, date: '2026-09-30' });
    expect(countAgreementsToOwnFreeHourAccounts(calls, [sameDay, before, longAfter])).toBe(3);
  });

  it('counts two agreements on one account separately', () => {
    expect(countAgreementsToOwnFreeHourAccounts(
      [call({ account: 100 })],
      [agr({ id: 1, account: 100 }), agr({ id: 2, account: 100 })],
    )).toBe(2);
  });

  it('counts one agreement once even when two Free Hours could claim it', () => {
    const calls = [
      call({ account: 100, date: '2026-03-01' }),
      call({ account: 100, date: '2026-03-15' }),
    ];
    expect(countAgreementsToOwnFreeHourAccounts(calls, [agr({ id: 1, account: 100 })])).toBe(1);
  });

  it('gives each consultant only their own', () => {
    const calls = [
      call({ consultant: 'Ada Lovelace', account: 100 }),
      call({ consultant: 'Grace Hopper', account: 200 }),
    ];
    const agreements = [
      agr({ id: 1, account: 100, consultant: 'Ada Lovelace' }),
      agr({ id: 2, account: 200, consultant: 'Grace Hopper' }),
      agr({ id: 3, account: 200, consultant: 'Grace Hopper' }),
    ];
    const by = Object.fromEntries(
      byConsultant(calls, agreements).map((r) => [r.consultant, r.agreementsSent]),
    );
    expect(by['Ada Lovelace']).toBe(1);
    expect(by['Grace Hopper']).toBe(2);
  });

  it('reports zero for a consultant who sent none', () => {
    expect(byConsultant([call({ consultant: 'Zoe Quiet', account: 100 })], [])[0].agreementsSent).toBe(0);
  });

  it('bounds the agreement set to the months on screen', () => {
    const agreements = [
      agr({ id: 1, account: 100, date: '2026-01-20' }),
      agr({ id: 2, account: 100, date: '2026-05-20' }),
    ];
    expect(filterAgreements(agreements, { from: '2026-05' }).map((a) => a.id)).toEqual([2]);
    expect(filterAgreements(agreements, { to: '2026-01' }).map((a) => a.id)).toEqual([1]);
    expect(filterAgreements(agreements, {}).length).toBe(2);
  });

  it('normalizes the BQ REST strings', () => {
    expect(normalizeAgreementRow({
      proposal_id: '77', account_record_id: '4242', consultant: 'Ada',
      contract_type: 'Dedicated', sent_date: '2026-04-09', accepted: 'true',
    })).toEqual({
      id: 77, accountRecordId: 4242, consultant: 'Ada', contractType: 'Dedicated',
      sentDate: '2026-04-09', accepted: true, month: '2026-04',
    });
  });
});

describe('buildAgreementsSentSql', () => {
  it('returns one row per agreement, with the account id to match on', () => {
    const sql = buildAgreementsSentSql();
    expect(sql).toContain('ps_proposals');
    expect(sql).toMatch(/proposal_id/);
    expect(sql).toMatch(/account_record_id/);
    expect(sql).toMatch(/assigned_to AS consultant/);
    // Pre-aggregating would throw away the account, which is what the match needs.
    expect(sql).not.toMatch(/GROUP BY/);
    expect(sql).toMatch(/'Pay-Per-Use','Dedicated','Fast Track Dedicated'/);
    expect(sql).toMatch(/DATE\(created_date\) >= DATE '2026-01-01'/);
  });

  it('refuses a malformed start rather than interpolating it', () => {
    const sql = buildAgreementsSentSql("2026-01-01'; DROP TABLE x --");
    expect(sql).not.toContain('DROP TABLE');
  });
});

describe('buildFreeHoursSql — the new columns', () => {
  const sql = buildFreeHoursSql();

  it('derives eligibility from a consulting case open at the call', () => {
    expect(sql).toMatch(/CaseType = 'Consulting Request'/);
    expect(sql).toMatch(/c\.closed IS NULL OR c\.closed >= v\.call_date/);
    expect(sql).toContain('AS open_case_at_call');
  });

  it('bridges to SaaS MRR through entity_record_id, not account_record_id', () => {
    // Joining MRR straight onto account_record_id matches under 4% of rows.
    expect(sql).toMatch(/int_accounts/);
    expect(sql).toMatch(/sa\.EntityRecordID = a\.entity_record_id/);
    expect(sql).toContain('AS paying_saas_at_call');
  });

  it('counts only agreements the delivering consultant sent themselves', () => {
    expect(sql).toMatch(/p\.assigned_to = v\.consultant/);
    expect(sql).toMatch(new RegExp(`INTERVAL ${AGREEMENT_WINDOW_DAYS} DAY`));
    expect(sql).toContain('AS days_to_agreement_sent');
  });
});

describe('fetchAgreementsSent', () => {
  it('normalizes every row it is handed', async () => {
    const query = async () => ({
      rows: [{
        proposal_id: '4', account_record_id: '100', consultant: 'Ada',
        contract_type: 'Pay-Per-Use', sent_date: '2026-02-14', accepted: 'false',
      }],
    });
    const rows = await fetchAgreementsSent({ query });
    expect(rows).toEqual([{
      id: 4, accountRecordId: 100, consultant: 'Ada', contractType: 'Pay-Per-Use',
      sentDate: '2026-02-14', accepted: false, month: '2026-02',
    }]);
  });
});

describe('fetchFreeHours', () => {
  it('normalizes every row it is handed', async () => {
    const query = async () => ({ rows: [{ fh_id: '1', open_case_at_call: 'true', fh_seq: '3' }] });
    const rows = await fetchFreeHours({ query });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 1, openCaseAtCall: true, seq: 3 });
  });
});
