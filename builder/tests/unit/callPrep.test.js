import { describe, it, expect } from 'vitest';
import {
  CALL_PREP_TABLE,
  buildConsultantsSql,
  buildBookSql,
  buildAccountSnapshotsSql,
} from '../../src/lib/callPrep.js';

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
