import { describe, it, expect } from 'vitest';
import {
  FINDINGS_TABLE,
  FINDING_TYPES,
  buildMyFindingsSql,
  buildAllFindingsSql,
  normalizeFindingRow,
  canonicalMissingElement,
  typeRank,
  findingAgeDays,
  isOpen,
  compareFindings,
  summarizeFindings,
  groupByAccount,
  fetchMyFindings,
} from '../../src/lib/eod.js';

const TODAY = '2026-08-13';

/** A normalized finding, with only the fields a given assertion cares about set. */
const f = (o) => ({
  findingId: o.id ?? 'x',
  accountRecordId: o.account ?? 1,
  accountName: o.name ?? 'Acme',
  accountIsDep: o.dep ?? false,
  findingType: o.type ?? 'followup_missing',
  status: o.status ?? 'open',
  firstSeen: o.firstSeen ?? TODAY,
  ...o,
});

describe('buildMyFindingsSql', () => {
  it('scopes to the consultant, dedupes on finding_id, and bounds the scan', () => {
    const sql = buildMyFindingsSql('b.saltzman@method.me');
    expect(sql).toContain(FINDINGS_TABLE);
    expect(sql).toMatch(/REGEXP_CONTAINS\(LOWER\(consultant\), r'\^b\[a-z\]\*\\\.\? \+saltzman\$'\)/);
    expect(sql).toMatch(/QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY finding_id ORDER BY created_at DESC\) = 1/);
    expect(sql).toMatch(/run_date >= DATE_SUB\(CURRENT_DATE\(\), INTERVAL 60 DAY\)/);
  });

  it('partitions on finding_id, not account — one account can carry three findings', () => {
    expect(buildMyFindingsSql('b.saltzman@method.me')).not.toContain('PARTITION BY account_record_id');
  });

  it('honours an explicit window and rejects a junk one', () => {
    expect(buildMyFindingsSql('b.saltzman@method.me', { sinceDays: 7 })).toContain('INTERVAL 7 DAY');
    expect(buildMyFindingsSql('b.saltzman@method.me', { sinceDays: -1 })).toContain('INTERVAL 60 DAY');
    expect(buildMyFindingsSql('b.saltzman@method.me', { sinceDays: '5; DROP' })).toContain('INTERVAL 60 DAY');
  });

  it('refuses an address with no first/last structure', () => {
    expect(() => buildMyFindingsSql('support@method.me')).toThrow(/Can't derive a consultant name/);
  });
});

describe('buildAllFindingsSql', () => {
  it('drops the consultant predicate but keeps the dedupe', () => {
    const sql = buildAllFindingsSql();
    expect(sql).not.toContain('REGEXP_CONTAINS');
    expect(sql).toMatch(/PARTITION BY finding_id/);
  });
});

describe('normalizeFindingRow', () => {
  it('types a raw BQ REST row', () => {
    const row = normalizeFindingRow({
      finding_id: 'brandon-saltzman-141508-followup_missing-2026-08-07',
      run_date: '2026-08-07',
      consultant: 'Brandon Saltzman',
      account_record_id: '141508',
      account_is_dep: 'true',
      finding_type: 'followup_missing',
      missing_elements: [{ v: 'recap' }, { v: 'delivery_date' }],
      days_since_touch: '3',
      status: 'drafted',
      draft_id: 'r38089',
    });
    expect(row.accountRecordId).toBe(141508);
    expect(row.accountIsDep).toBe(true);
    expect(row.missingElements).toEqual(['recap', 'delivery_date']);
    expect(row.daysSinceTouch).toBe(3);
    expect(row.draftId).toBe('r38089');
  });

  it('accepts a plain array for the repeated field, as fixtures supply it', () => {
    expect(normalizeFindingRow({ missing_elements: ['recap'] }).missingElements).toEqual(['recap']);
  });

  it('keeps a null days_since_touch null rather than coercing it to 0', () => {
    // An account with no touch on record at all is not an account touched today.
    expect(normalizeFindingRow({ days_since_touch: null }).daysSinceTouch).toBeNull();
  });

  it('collapses the two spellings the routine writes for the estimate element', () => {
    // The live table holds both `hours_estimate` and `time_estimate` for the
    // same check; rendering both would show one gap as two.
    const row = normalizeFindingRow({
      missing_elements: [{ v: 'hours_estimate' }, { v: 'time_estimate' }, { v: 'recap' }],
    });
    expect(row.missingElements).toEqual(['time_estimate', 'recap']);
  });
});

describe('canonicalMissingElement', () => {
  it('maps hours_estimate onto time_estimate and leaves others alone', () => {
    expect(canonicalMissingElement('hours_estimate')).toBe('time_estimate');
    expect(canonicalMissingElement('TIME_ESTIMATE')).toBe('time_estimate');
    expect(canonicalMissingElement('recap')).toBe('recap');
  });
});

describe('typeRank', () => {
  it('orders client-facing gaps ahead of bookkeeping, unknown last', () => {
    expect(typeRank('followup_missing')).toBeLessThan(typeRank('email_not_logged'));
    expect(typeRank('email_not_logged')).toBeLessThan(typeRank('mia'));
    expect(typeRank('something_new')).toBe(FINDING_TYPES.length);
  });
});

describe('findingAgeDays', () => {
  it('ages from first_seen, so a carried finding is not zero days old', () => {
    expect(findingAgeDays({ firstSeen: '2026-08-09' }, TODAY)).toBe(4);
    expect(findingAgeDays({ firstSeen: TODAY }, TODAY)).toBe(0);
  });

  it('returns null when the date is missing or malformed', () => {
    expect(findingAgeDays({ firstSeen: null }, TODAY)).toBeNull();
    expect(findingAgeDays({ firstSeen: 'no-touch' }, TODAY)).toBeNull();
  });
});

describe('isOpen', () => {
  it('counts open and drafted as live work, not dismissed or resolved', () => {
    expect(isOpen({ status: 'open' })).toBe(true);
    expect(isOpen({ status: 'drafted' })).toBe(true);
    expect(isOpen({ status: 'dismissed' })).toBe(false);
    expect(isOpen({ status: 'resolved' })).toBe(false);
  });
});

describe('compareFindings', () => {
  it('puts the oldest gap first regardless of type', () => {
    const old = f({ firstSeen: '2026-08-08', type: 'mia' });
    const fresh = f({ firstSeen: TODAY, type: 'followup_missing' });
    expect([fresh, old].sort((a, b) => compareFindings(a, b, TODAY))[0]).toBe(old);
  });

  it('breaks an age tie on type, then on DEP', () => {
    const followup = f({ type: 'followup_missing' });
    const logging = f({ type: 'email_not_logged' });
    expect([logging, followup].sort((a, b) => compareFindings(a, b, TODAY))[0]).toBe(followup);

    const dep = f({ type: 'mia', dep: true, name: 'Zeta' });
    const ppu = f({ type: 'mia', dep: false, name: 'Alpha' });
    expect([ppu, dep].sort((a, b) => compareFindings(a, b, TODAY))[0]).toBe(dep);
  });
});

describe('summarizeFindings', () => {
  it('counts live work by type and ignores settled findings', () => {
    const stats = summarizeFindings([
      f({ id: 'a', account: 1, type: 'followup_missing', status: 'open' }),
      f({ id: 'b', account: 1, type: 'email_not_logged', status: 'drafted' }),
      f({ id: 'c', account: 2, type: 'mia', status: 'open' }),
      f({ id: 'd', account: 3, type: 'mia', status: 'dismissed' }),
      f({ id: 'e', account: 4, type: 'followup_missing', status: 'resolved' }),
    ]);
    expect(stats.open).toBe(3);
    expect(stats.accounts).toBe(2);
    expect(stats.followupMissing).toBe(1);
    expect(stats.emailNotLogged).toBe(1);
    expect(stats.mia).toBe(1);
    expect(stats.drafted).toBe(1);
    expect(stats.resolved).toBe(1);
  });
});

describe('groupByAccount', () => {
  it('keeps every finding for an account together', () => {
    const groups = groupByAccount([
      f({ id: 'a', account: 1, name: 'Acme', type: 'mia' }),
      f({ id: 'b', account: 1, name: 'Acme', type: 'followup_missing' }),
      f({ id: 'c', account: 2, name: 'Beta', type: 'followup_missing' }),
    ], TODAY);
    expect(groups).toHaveLength(2);
    const acme = groups.find((g) => g.accountRecordId === 1);
    expect(acme.findings).toHaveLength(2);
    expect(acme.findings[0].findingType).toBe('followup_missing');
  });

  it('ranks an account by its most urgent finding', () => {
    const groups = groupByAccount([
      f({ id: 'a', account: 1, name: 'Acme', firstSeen: TODAY }),
      f({ id: 'b', account: 2, name: 'Beta', firstSeen: '2026-08-06' }),
    ], TODAY);
    expect(groups[0].accountRecordId).toBe(2);
  });
});

describe('fetchMyFindings', () => {
  it('normalizes what the query returns', async () => {
    const query = async () => ({ rows: [{ finding_id: 'a', account_record_id: '7', status: 'open' }] });
    const rows = await fetchMyFindings('b.saltzman@method.me', { query });
    expect(rows).toEqual([expect.objectContaining({ findingId: 'a', accountRecordId: 7 })]);
  });
});
