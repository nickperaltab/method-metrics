import { describe, it, expect } from 'vitest';
import {
  CALL_PREP_TABLE,
  TIME_TRACKING_TABLE,
  CASES_TABLE,
  ACCOUNTS_TABLE,
  buildConsultantsSql,
  buildBookSql,
  buildAccountSnapshotsSql,
  buildAccountSessionsSql,
  buildAccountCasesSql,
  buildAccountOverviewSql,
} from '../../src/lib/callPrep.js';
import { normalizeSnapshotRow, normalizeSessionRow, normalizeCaseRow, normalizeAccountOverview, computeFlags } from '../../src/lib/callPrep.js';
import { fetchConsultants, fetchBook, fetchAccountSnapshots, fetchAccountSessions, fetchAccountCases } from '../../src/lib/callPrep.js';

describe('buildConsultantsSql', () => {
  it('aggregates consultants from the snapshots table', () => {
    const sql = buildConsultantsSql();
    expect(sql).toContain(CALL_PREP_TABLE);
    expect(sql).toMatch(/GROUP BY consultant/);
    expect(sql).toMatch(/COUNT\(DISTINCT account_record_id\)/);
  });
});

describe('buildBookSql', () => {
  it('filters by consultant and keeps latest row per account', () => {
    const sql = buildBookSql('Brandon Saltzman');
    expect(sql).toContain("consultant = 'Brandon Saltzman'");
    expect(sql).toMatch(/QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY account_record_id ORDER BY snapshot_date DESC\) = 1/);
  });

  it('escapes quotes in consultant names', () => {
    const sql = buildBookSql("O'Brien");
    expect(sql).toContain("O\\'Brien");
    expect(sql).not.toContain("= 'O'Brien'");
  });
});

describe('buildAccountSnapshotsSql', () => {
  it('filters by record id, newest first', () => {
    const sql = buildAccountSnapshotsSql('141376');
    expect(sql).toContain('account_record_id = 141376');
    expect(sql).toMatch(/ORDER BY snapshot_date DESC/);
  });

  it('rejects non-integer record ids', () => {
    expect(() => buildAccountSnapshotsSql('141376; DROP TABLE x')).toThrow();
    expect(() => buildAccountSnapshotsSql('abc')).toThrow();
  });
});

describe('buildAccountSessionsSql', () => {
  it('queries TimeTracking by account, oldest first, excluding deleted', () => {
    const sql = buildAccountSessionsSql('141376');
    expect(sql).toContain(TIME_TRACKING_TABLE);
    expect(sql).toContain('MethodCompanyAccountRecordID = 141376');
    expect(sql).toMatch(/IsDeleted = FALSE/);
    expect(sql).toMatch(/ORDER BY TxnDate/);
  });

  it('rejects non-integer record ids', () => {
    expect(() => buildAccountSessionsSql('1; DROP TABLE x')).toThrow();
    expect(() => buildAccountSessionsSql('abc')).toThrow();
  });
});

describe('normalizeSessionRow', () => {
  it('casts a TimeTracking row to a typed session', () => {
    const s = normalizeSessionRow({
      TxnDate: '2025-07-18', MethodSupportType: 'Free', BillableStatus: 'HasBeenBilled',
      IsDemo: 'false', DurationHours: '1', AssignedToRecordID: '380', Notes: 'Kickoff call',
    });
    expect(s).toEqual({
      date: '2025-07-18', supportType: 'Free', billable: 'HasBeenBilled',
      isDemo: false, durationHours: 1, consultantId: 380, notes: 'Kickoff call',
    });
  });
});

describe('buildAccountCasesSql', () => {
  it('queries Cases by account, newest first, excluding deleted', () => {
    const sql = buildAccountCasesSql('90430');
    expect(sql).toContain(CASES_TABLE);
    expect(sql).toContain('MethodCompanyAccountRecordID = 90430');
    expect(sql).toMatch(/IsDeleted = FALSE/);
    expect(sql).toMatch(/ORDER BY CreatedDate DESC/);
  });

  it('rejects non-integer record ids', () => {
    expect(() => buildAccountCasesSql('1 OR 1=1')).toThrow();
    expect(() => buildAccountCasesSql('abc')).toThrow();
  });
});

describe('buildAccountOverviewSql', () => {
  it('queries int_accounts by account, single row', () => {
    const sql = buildAccountOverviewSql('90430');
    expect(sql).toContain(ACCOUNTS_TABLE);
    expect(sql).toContain('account_record_id = 90430');
    expect(sql).toMatch(/LIMIT 1/);
  });

  it('rejects non-integer record ids', () => {
    expect(() => buildAccountOverviewSql('1; DROP TABLE x')).toThrow();
  });
});

describe('normalizeAccountOverview', () => {
  it('casts an int_accounts row', () => {
    const a = normalizeAccountOverview({
      account_record_id: '90430', mrr_run_rate: '209', user_licenses: '5',
      health_score: '38', is_active: 'true', saas_pay_type: 'Prepay',
    });
    expect(a).toEqual({
      accountRecordId: 90430, mrrRunRate: 209, userLicenses: 5,
      healthScore: 38, isActive: true, saasPayType: 'Prepay',
    });
  });

  it('nulls non-positive license counts (source has negatives) and tolerates a missing row', () => {
    expect(normalizeAccountOverview({ account_record_id: '1', user_licenses: '-2' }).userLicenses).toBe(null);
    expect(normalizeAccountOverview({ account_record_id: '1', user_licenses: '0' }).userLicenses).toBe(null);
    expect(normalizeAccountOverview(undefined)).toBe(null);
  });
});

describe('normalizeCaseRow', () => {
  it('casts a Cases row, derives isOpen, trims timestamps to dates', () => {
    const c = normalizeCaseRow({
      RecordID: '63114', CaseStatus: 'Closed', CasePriority: 'P2-Normal',
      subject: 'Sync Engine Related - Credentials are not saving',
      CreatedDate: '2025-08-14T14:48:04Z', ClosedDate: '2025-08-14T18:25:28Z', ContactName: 'Bill Paschick',
    });
    expect(c).toEqual({
      recordId: 63114, status: 'Closed', isOpen: false, priority: 'P2-Normal',
      subject: 'Sync Engine Related - Credentials are not saving',
      createdDate: '2025-08-14', closedDate: '2025-08-14', contactName: 'Bill Paschick',
    });
  });

  it('marks non-closed statuses open and tolerates nulls', () => {
    const c = normalizeCaseRow({ RecordID: '40347', CaseStatus: 'Waiting on Jira', subject: null, CreatedDate: '2021-02-23T17:22:35Z' });
    expect(c.isOpen).toBe(true);
    expect(c.closedDate).toBe(null);
    expect(c.subject).toBe(null);
  });
});

// BQ REST returns all scalars as strings and REPEATED fields as [{v}] arrays.
const bqRow = {
  account_record_id: '141376',
  account_name: 'Montana Mixers',
  snapshot_date: '2026-07-09',
  call_type: 'PPU',
  consultant: 'Brandon Saltzman',
  account_age_months: '14.5',
  signup_date: '2025-04-20',
  dep_enrolled: 'true',
  multi_entity_parent_name: null,
  sync_fail_count: '0',
  sync_status: 'DISCONNECTED',
  tt_total_hours: '12.5',
  tt_session_count: '4',
  tt_last_session_date: '2026-06-30',
  cases_open_count: '1',
  cases_closed_90d_count: '2',
  dep_signals: [{ v: 'signal-a' }, { v: 'signal-b' }],
  industry_l1: 'Manufacturing',
  industry_l2: null,
  industry_l3: null,
  operating_model: 'B2B',
  bq_confidence: '0.85',
  doc_link: 'https://docs.google.com/document/d/abc',
  created_at: '1.78404058517258E9',
};

describe('normalizeSnapshotRow', () => {
  it('casts numerics, lowercases sync_status, unwraps repeated fields', () => {
    const s = normalizeSnapshotRow(bqRow);
    expect(s.accountRecordId).toBe(141376);
    expect(s.accountName).toBe('Montana Mixers');
    expect(s.syncStatus).toBe('disconnected');
    expect(s.syncFailCount).toBe(0);
    expect(s.casesOpenCount).toBe(1);
    expect(s.ttTotalHours).toBeCloseTo(12.5);
    expect(s.depEnrolled).toBe(true);
    expect(s.depSignals).toEqual(['signal-a', 'signal-b']);
    expect(s.bqConfidence).toBeCloseTo(0.85);
    expect(s.docLink).toBe('https://docs.google.com/document/d/abc');
    expect(s.createdAt).toBe('1.78404058517258E9');
  });

  it('tolerates nulls and missing repeated fields', () => {
    const s = normalizeSnapshotRow({ account_record_id: '90430', account_name: 'Wave Distro' });
    expect(s.accountRecordId).toBe(90430);
    expect(s.depSignals).toEqual([]);
    expect(s.syncStatus).toBe(null);
    expect(s.syncFailCount).toBe(0);
    expect(s.casesOpenCount).toBe(0);
  });

  it('nulls docLink unless it is an http(s) URL', () => {
    expect(normalizeSnapshotRow({ ...bqRow, doc_link: 'javascript:alert(1)' }).docLink).toBe(null);
    expect(normalizeSnapshotRow({ ...bqRow, doc_link: 'https://docs.google.com/document/d/abc' }).docLink)
      .toBe('https://docs.google.com/document/d/abc');
  });
});

describe('computeFlags', () => {
  const base = normalizeSnapshotRow(bqRow);
  const today = '2026-07-14';

  it('flags sync failures', () => {
    expect(computeFlags({ ...base, syncFailCount: 3 }, today)).toContain('sync failing');
    expect(computeFlags(base, today)).not.toContain('sync failing');
  });

  it('flags open cases', () => {
    expect(computeFlags(base, today)).toContain('open cases'); // casesOpenCount: 1
    expect(computeFlags({ ...base, casesOpenCount: 0 }, today)).not.toContain('open cases');
  });

  it('flags stale time tracking at 30+ days, not before', () => {
    expect(computeFlags({ ...base, ttLastSessionDate: '2026-06-14' }, today)).toContain('no recent sessions'); // exactly 30d
    expect(computeFlags({ ...base, ttLastSessionDate: '2026-06-15' }, today)).not.toContain('no recent sessions'); // 29d
    expect(computeFlags({ ...base, ttLastSessionDate: null }, today)).toContain('no recent sessions');
  });

  it('flags missing snapshot', () => {
    expect(computeFlags(null, today)).toEqual(['no snapshot']);
  });
});

describe('fetch functions', () => {
  it('fetchConsultants normalizes count fields', async () => {
    const query = async () => ({
      rows: [{ consultant: 'Brandon Saltzman', account_count: '2', last_snapshot_date: '2026-07-13' }],
    });
    const out = await fetchConsultants({ query });
    expect(out).toEqual([
      { consultant: 'Brandon Saltzman', accountCount: 2, lastSnapshotDate: '2026-07-13' },
    ]);
  });

  it('fetchBook passes built SQL to query and normalizes rows', async () => {
    const seen = [];
    const query = async (sql) => { seen.push(sql); return { rows: [bqRow] }; };
    const out = await fetchBook('Brandon Saltzman', { query });
    expect(seen[0]).toContain("consultant = 'Brandon Saltzman'");
    expect(out[0].accountRecordId).toBe(141376);
  });

  it('fetchAccountSnapshots validates id before querying', async () => {
    const query = async () => ({ rows: [] });
    await expect(fetchAccountSnapshots('bad-id', { query })).rejects.toThrow();
    expect(await fetchAccountSnapshots('141376', { query })).toEqual([]);
  });
});
