import { describe, it, expect } from 'vitest';
import {
  CALL_PREP_TABLE,
  buildConsultantsSql,
  buildBookSql,
  buildAccountSnapshotsSql,
} from '../../src/lib/callPrep.js';
import { normalizeSnapshotRow, computeFlags } from '../../src/lib/callPrep.js';

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
  });

  it('tolerates nulls and missing repeated fields', () => {
    const s = normalizeSnapshotRow({ account_record_id: '90430', account_name: 'Wave Distro' });
    expect(s.accountRecordId).toBe(90430);
    expect(s.depSignals).toEqual([]);
    expect(s.syncStatus).toBe(null);
    expect(s.syncFailCount).toBe(0);
    expect(s.casesOpenCount).toBe(0);
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
