import { describe, it, expect } from 'vitest';
import {
  consultantPatternFromEmail,
  localIsoDate,
  buildMyTodaySql,
  buildMyBoardSql,
  buildMyHandoffsSql,
  normalizeBoardRow,
  compareBoardRows,
  summarizeBoard,
  fetchMyToday,
  fetchMyBoard,
  fetchMyHandoffs,
} from '../../src/lib/psOverview.js';

describe('consultantPatternFromEmail', () => {
  it('matches both name conventions the snapshots feed writes', () => {
    const re = new RegExp(consultantPatternFromEmail('b.saltzman@method.me'));
    expect(re.test('brandon saltzman')).toBe(true);
    expect(re.test('b. saltzman')).toBe(true);
    expect(re.test('b saltzman')).toBe(true);
  });

  it('does not match a different person with the same initial', () => {
    const re = new RegExp(consultantPatternFromEmail('s.zarei@method.me'));
    expect(re.test('sherry zarei')).toBe(true);
    expect(re.test('s. zarei')).toBe(true);
    expect(re.test('safwan hossain')).toBe(false);
    expect(re.test('s. hossain')).toBe(false);
  });

  it('anchors so a last name is not matched as a substring', () => {
    const re = new RegExp(consultantPatternFromEmail('e.tran@method.me'));
    expect(re.test('eric tran')).toBe(true);
    expect(re.test('eric transom')).toBe(false);
  });

  it('returns null when the address has no first/last structure', () => {
    expect(consultantPatternFromEmail('support@method.me')).toBe(null);
    expect(consultantPatternFromEmail('')).toBe(null);
    expect(consultantPatternFromEmail(null)).toBe(null);
  });

  it('returns null rather than a pattern for non-letter local parts', () => {
    // Keeps anything quote- or backslash-bearing out of the SQL literal.
    expect(consultantPatternFromEmail("o'brien.x@method.me")).toBe(null);
    expect(consultantPatternFromEmail('a.b1@method.me')).toBe(null);
  });
});

describe('localIsoDate', () => {
  it('uses local calendar date, not UTC', () => {
    // 2026-07-30 23:30 local — toISOString() would roll this to the 31st for
    // anyone west of UTC.
    expect(localIsoDate(new Date(2026, 6, 30, 23, 30))).toBe('2026-07-30');
    expect(localIsoDate(new Date(2026, 0, 5, 0, 15))).toBe('2026-01-05');
  });
});

describe('buildMyTodaySql', () => {
  it('filters to the day and the consultant pattern', () => {
    const sql = buildMyTodaySql('b.saltzman@method.me', '2026-07-30');
    expect(sql).toContain("snapshot_date = DATE '2026-07-30'");
    expect(sql).toContain("REGEXP_CONTAINS(LOWER(consultant), r'^b[a-z]*\\.? +saltzman$')");
  });

  it('rejects a malformed date', () => {
    expect(() => buildMyTodaySql('b.saltzman@method.me', "2026-07-30' OR 1=1--")).toThrow();
    expect(() => buildMyTodaySql('b.saltzman@method.me', 'today')).toThrow();
  });

  it('throws when the email cannot be scoped to a consultant', () => {
    expect(() => buildMyTodaySql('support@method.me', '2026-07-30')).toThrow();
  });
});

describe('buildMyBoardSql', () => {
  it('keeps the latest snapshot per account and joins the account model', () => {
    const sql = buildMyBoardSql('b.saltzman@method.me');
    expect(sql).toMatch(/QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY account_record_id ORDER BY snapshot_date DESC\) = 1/);
    expect(sql).toContain('LEFT JOIN');
    expect(sql).toContain('int_accounts');
    expect(sql).toContain('USING (account_record_id)');
  });
});

describe('buildMyHandoffsSql', () => {
  it('matches me on either side of the transition', () => {
    const sql = buildMyHandoffsSql('b.saltzman@method.me');
    expect(sql).toContain('LOWER(outgoing_rep)');
    expect(sql).toContain('LOWER(incoming_rep)');
    expect(sql).toMatch(/OR REGEXP_CONTAINS/);
  });
});

// BQ REST returns all scalars as strings; the board row is a snapshot joined
// to int_accounts, so both sets of columns arrive flat on one row.
const boardRow = {
  account_record_id: '141376',
  account_name: 'Montana Mixers',
  snapshot_date: '2026-07-09',
  call_type: 'PPU',
  consultant: 'Brandon Saltzman',
  dep_enrolled: 'false',
  sync_fail_count: '0',
  cases_open_count: '1',
  tt_last_session_date: '2026-01-16',
  mrr_run_rate: '463.0',
  user_licenses: '10',
  health_score: '56.0',
  is_active: 'true',
  saas_pay_type: 'Monthly',
};

describe('normalizeBoardRow', () => {
  it('flattens snapshot + account overview and computes flags', () => {
    const r = normalizeBoardRow(boardRow, '2026-07-30');
    expect(r.accountRecordId).toBe(141376);
    expect(r.accountName).toBe('Montana Mixers');
    expect(r.overview.mrrRunRate).toBe(463);
    expect(r.overview.userLicenses).toBe(10);
    expect(r.overview.isActive).toBe(true);
    // 1 open case + last session in January → both flags.
    expect(r.flags).toContain('open cases');
    expect(r.flags).toContain('no recent sessions');
  });

  it('tolerates an account with no int_accounts match', () => {
    const r = normalizeBoardRow({ account_record_id: '999', account_name: 'Ghost Co' }, '2026-07-30');
    expect(r.overview.mrrRunRate).toBe(null);
    expect(r.overview.userLicenses).toBe(null);
    expect(r.flags).toContain('no recent sessions');
  });
});

describe('compareBoardRows', () => {
  const row = (flags, last, name) => ({ flags, ttLastSessionDate: last, accountName: name });

  it('puts the most-flagged account first', () => {
    const rows = [
      row([], '2026-07-01', 'Calm Co'),
      row(['open cases', 'sync failing'], '2026-07-20', 'Loud Co'),
      row(['open cases'], '2026-07-10', 'Middling Co'),
    ].sort(compareBoardRows);
    expect(rows.map((r) => r.accountName)).toEqual(['Loud Co', 'Middling Co', 'Calm Co']);
  });

  it('breaks ties on the coldest account, then name', () => {
    const rows = [
      row(['open cases'], '2026-07-20', 'Recent Co'),
      row(['open cases'], '2026-01-05', 'Cold Co'),
    ].sort(compareBoardRows);
    expect(rows[0].accountName).toBe('Cold Co');
  });

  it('sorts a never-touched account as cold, not as most recent', () => {
    const rows = [
      row(['open cases'], '2026-07-20', 'Recent Co'),
      row(['open cases'], null, 'Never Co'),
    ].sort(compareBoardRows);
    expect(rows[0].accountName).toBe('Never Co');
  });
});

describe('summarizeBoard', () => {
  const mk = (mrr, licenses, isActive, flags) => ({
    flags,
    overview: { mrrRunRate: mrr, userLicenses: licenses, isActive },
  });

  it('totals MRR and seats across active accounts only', () => {
    const out = summarizeBoard([
      mk(463, 10, true, []),
      mk(119, 3, true, ['open cases']),
      mk(999, 50, false, []),
    ]);
    expect(out.accounts).toBe(3);
    expect(out.activeMrr).toBe(582);
    expect(out.licenses).toBe(13);
    expect(out.needsAttention).toBe(1);
  });

  it('counts an account with no overview as active and contributes nothing', () => {
    const out = summarizeBoard([{ flags: [], overview: null }]);
    expect(out.accounts).toBe(1);
    expect(out.activeMrr).toBe(0);
    expect(out.licenses).toBe(0);
  });
});

describe('fetch functions', () => {
  it('fetchMyToday normalizes snapshot rows', async () => {
    const seen = [];
    const query = async (sql) => { seen.push(sql); return { rows: [boardRow] }; };
    const out = await fetchMyToday('b.saltzman@method.me', '2026-07-30', { query });
    expect(seen[0]).toContain("DATE '2026-07-30'");
    expect(out[0].accountName).toBe('Montana Mixers');
  });

  it('fetchMyBoard returns rows already sorted by attention', async () => {
    const query = async () => ({
      rows: [
        { ...boardRow, account_record_id: '1', account_name: 'Quiet', cases_open_count: '0', tt_last_session_date: '2026-07-29' },
        { ...boardRow, account_record_id: '2', account_name: 'Noisy', cases_open_count: '3', sync_fail_count: '2' },
      ],
    });
    const out = await fetchMyBoard('b.saltzman@method.me', '2026-07-30', { query });
    expect(out[0].accountName).toBe('Noisy');
    expect(out[1].flags).toEqual([]);
  });

  it('fetchMyHandoffs normalizes handoff rows', async () => {
    const query = async () => ({
      rows: [{ account_record_id: '141376', account_name: 'Montana Mixers', status: 'Shared', outgoing_rep: 'Brandon Saltzman' }],
    });
    const out = await fetchMyHandoffs('b.saltzman@method.me', { query });
    expect(out[0].status).toBe('Shared');
    expect(out[0].flags).toEqual([]);
  });
});
