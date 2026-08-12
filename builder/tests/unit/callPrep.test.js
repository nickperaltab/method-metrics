import { describe, it, expect } from 'vitest';
import {
  CALL_PREP_TABLE,
  BRIEF_CONTENT_TABLE,
  TIME_TRACKING_TABLE,
  CASES_TABLE,
  ACCOUNTS_TABLE,
  OPPORTUNITY_FIT_TABLE,
  ACTIVITY_TABLE,
  buildAccountOpportunityFitSql,
  buildAccountActivitiesSql,
  normalizeActivityRow,
  stripHtml,
  toWebsiteUrl,
  latestFitByMotion,
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
    expect(sql).toMatch(/ORDER BY s\.snapshot_date DESC/);
  });

  it('left joins the written brief so preps without one still return', () => {
    const sql = buildAccountSnapshotsSql('141376');
    expect(sql).toContain(BRIEF_CONTENT_TABLE);
    expect(sql).toMatch(/LEFT JOIN/);
    expect(sql).toMatch(/b\.top_3/);
    expect(sql).toMatch(/b\.why_today/);
  });

  // Both tables are append-only with no key: a routine that runs twice in a day
  // leaves two rows for one (account, date). Without both QUALIFYs that shows
  // the same date twice in the picker and fans the join out.
  it('keeps one row per snapshot date on both sides of the join', () => {
    const sql = buildAccountSnapshotsSql('141376');
    expect(sql).toMatch(/PARTITION BY account_record_id, snapshot_date ORDER BY created_at DESC/);
    expect(sql).toMatch(/PARTITION BY s\.snapshot_date ORDER BY s\.created_at DESC/);
  });

  it('rejects non-integer record ids', () => {
    expect(() => buildAccountSnapshotsSql('141376; DROP TABLE x')).toThrow();
    expect(() => buildAccountSnapshotsSql('abc')).toThrow();
  });
});

describe('toWebsiteUrl', () => {
  // Every historical brief_content row stores a bare host, not a URL.
  it('gives a bare domain a scheme', () => {
    expect(toWebsiteUrl('primodoors.com')).toBe('https://primodoors.com');
    expect(toWebsiteUrl('arrowconservation.com/about')).toBe('https://arrowconservation.com/about');
  });

  it('leaves an absolute URL alone', () => {
    expect(toWebsiteUrl('http://example.com')).toBe('http://example.com');
    expect(toWebsiteUrl('https://example.com/x')).toBe('https://example.com/x');
  });

  it('refuses anything that is not a plain host', () => {
    expect(toWebsiteUrl('javascript:alert(1)')).toBeNull();
    expect(toWebsiteUrl('data:text/html,<script>')).toBeNull();
    expect(toWebsiteUrl('not a domain')).toBeNull();
    expect(toWebsiteUrl('localhost')).toBeNull();
    expect(toWebsiteUrl('')).toBeNull();
    expect(toWebsiteUrl(null)).toBeNull();
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

describe('buildAccountOpportunityFitSql', () => {
  it('reads every assessment for the account, newest first', () => {
    const sql = buildAccountOpportunityFitSql('141376');
    expect(sql).toContain(OPPORTUNITY_FIT_TABLE);
    expect(sql).toContain('account_record_id = 141376');
    expect(sql).toMatch(/ORDER BY assessed_date DESC/);
  });

  it('rejects non-integer record ids', () => {
    expect(() => buildAccountOpportunityFitSql('1; DROP TABLE x')).toThrow();
  });
});

describe('buildAccountActivitiesSql', () => {
  it('queries Activity by account, newest first, excluding deleted', () => {
    const sql = buildAccountActivitiesSql('141376');
    expect(sql).toContain(ACTIVITY_TABLE);
    expect(sql).toContain('MethodCompanyAccountRecordID = 141376');
    expect(sql).toMatch(/IsDeleted = FALSE/);
    expect(sql).toMatch(/LIMIT 10/);
  });

  // mockBq's batched cross-account route matches on `AS activity_date`; if this
  // query ever uses that alias again, mock mode silently serves the wrong rows.
  it('does not alias its date column activity_date', () => {
    expect(buildAccountActivitiesSql('141376')).not.toMatch(/AS activity_date/);
  });

  it('rejects non-integer record ids and limits', () => {
    expect(() => buildAccountActivitiesSql('abc')).toThrow();
    expect(() => buildAccountActivitiesSql('141376', '10; DROP TABLE x')).toThrow();
  });
});

describe('stripHtml', () => {
  it('reduces CRM rich text to plain prose', () => {
    expect(stripHtml('<p>Called Tom &amp; left a vm&nbsp;today</p>')).toBe('Called Tom & left a vm today');
  });

  it('turns block ends into line breaks', () => {
    expect(stripHtml('<p>One</p><p>Two</p>')).toBe('One\nTwo');
  });

  it('drops script bodies rather than inlining them', () => {
    expect(stripHtml('<script>alert(1)</script>hello')).toBe('hello');
  });

  it('returns null for empty or markup-only input', () => {
    expect(stripHtml('')).toBeNull();
    expect(stripHtml('<p></p>')).toBeNull();
    expect(stripHtml(null)).toBeNull();
  });
});

describe('normalizeActivityRow', () => {
  it('casts an Activity row to a typed activity', () => {
    expect(normalizeActivityRow({
      RecordID: '1749823', occurred_on: '2026-08-04', ActivityType: 'Demo',
      ActivityStatus: 'Completed', AssignedToRecordID: '455', Comments: '<p>Walked the estimate flow.</p>',
    })).toEqual({
      recordId: 1749823, date: '2026-08-04', type: 'Demo', status: 'Completed',
      agentId: 455, notes: 'Walked the estimate flow.',
    });
  });
});

describe('latestFitByMotion', () => {
  const row = (motion, assessedDate, fit) => ({ motion, assessedDate, fit, signals: [] });

  it('keeps the newest assessment per motion in reading order', () => {
    const out = latestFitByMotion([
      row('ppu', '2026-08-01', 'current'),
      row('method_pay', '2026-08-10', 'strong'),
      row('method_pay', '2026-07-01', 'none'),
    ], '2026-08-10');
    expect(out.map((r) => r.motion)).toEqual(['method_pay', 'ppu']);
    expect(out[0].fit).toBe('strong');
  });

  it('ignores assessments made after the prep being read', () => {
    const out = latestFitByMotion([
      row('dep', '2026-08-10', 'strong'),
      row('dep', '2026-07-01', 'none'),
    ], '2026-07-15');
    expect(out).toHaveLength(1);
    expect(out[0].fit).toBe('none');
  });

  it('still returns motions outside the known set', () => {
    const out = latestFitByMotion([row('partner_referral', '2026-08-10', 'strong')], '2026-08-10');
    expect(out.map((r) => r.motion)).toEqual(['partner_referral']);
  });

  it('tolerates no rows', () => {
    expect(latestFitByMotion(null, '2026-08-10')).toEqual([]);
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
