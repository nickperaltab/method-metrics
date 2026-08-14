import { describe, it, expect } from 'vitest';
import {
  HANDOFF_TABLE,
  HANDOFF_STATUSES,
  buildHandoffsSql,
  buildHandoffsForIncomingSql,
  buildAccountHandoffsSql,
  normalizeHandoffRow,
  statusRank,
  fetchHandoffs,
  fetchHandoffsForIncoming,
  fetchAccountHandoffs,
} from '../../src/lib/handoffs.js';

describe('buildHandoffsSql', () => {
  it('keeps the latest row per account, newest first', () => {
    const sql = buildHandoffsSql();
    expect(sql).toContain(HANDOFF_TABLE);
    expect(sql).toMatch(/QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY account_record_id ORDER BY created_at DESC\) = 1/);
    expect(sql).toMatch(/ORDER BY created_at DESC/);
  });
});

describe('buildHandoffsForIncomingSql', () => {
  it('filters by incoming rep and keeps latest per account', () => {
    const sql = buildHandoffsForIncomingSql('Jane Rep');
    expect(sql).toContain("incoming_rep = 'Jane Rep'");
    expect(sql).toMatch(/QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY account_record_id ORDER BY created_at DESC\) = 1/);
  });

  it('escapes quotes in rep names', () => {
    const sql = buildHandoffsForIncomingSql("O'Brien");
    expect(sql).toContain("O\\'Brien");
    expect(sql).not.toContain("= 'O'Brien'");
  });
});

describe('buildAccountHandoffsSql', () => {
  it('filters by record id, newest first', () => {
    const sql = buildAccountHandoffsSql('141376');
    expect(sql).toContain('account_record_id = 141376');
    expect(sql).toMatch(/ORDER BY created_at DESC/);
  });

  it('rejects non-integer record ids', () => {
    expect(() => buildAccountHandoffsSql('141376; DROP TABLE x')).toThrow();
    expect(() => buildAccountHandoffsSql('abc')).toThrow();
  });
});

// BQ REST returns all scalars as strings and REPEATED fields as [{v}] arrays.
const bqRow = {
  account_record_id: '141376',
  account_name: 'Montana Mixers',
  handoff_date: '2026-07-29',
  outgoing_rep: 'Brandon Saltzman',
  incoming_rep: 'Jane Rep',
  status: 'Shared',
  doc_link: 'https://docs.google.com/document/d/abc',
  open_in_progress: '2',
  open_promised: '3',
  catalogue_matches: '1',
  flags: [{ v: 'open cases' }, { v: 'sync failing' }],
  first_priority: 'Finish the invoice approval workflow',
  created_at: '2026-07-29T14:00:00Z',
};

describe('normalizeHandoffRow', () => {
  it('casts numerics, unwraps repeated flags, keeps strings', () => {
    const h = normalizeHandoffRow(bqRow);
    expect(h.accountRecordId).toBe(141376);
    expect(h.accountName).toBe('Montana Mixers');
    expect(h.outgoingRep).toBe('Brandon Saltzman');
    expect(h.incomingRep).toBe('Jane Rep');
    expect(h.status).toBe('Shared');
    expect(h.openInProgress).toBe(2);
    expect(h.openPromised).toBe(3);
    expect(h.catalogueMatches).toBe(1);
    expect(h.flags).toEqual(['open cases', 'sync failing']);
    expect(h.firstPriority).toBe('Finish the invoice approval workflow');
    expect(h.docLink).toBe('https://docs.google.com/document/d/abc');
    expect(h.createdAt).toBe('2026-07-29T14:00:00Z');
  });

  it('tolerates nulls and missing repeated fields', () => {
    const h = normalizeHandoffRow({ account_record_id: '90430', account_name: 'Wave Distro' });
    expect(h.accountRecordId).toBe(90430);
    expect(h.flags).toEqual([]);
    expect(h.openInProgress).toBe(0);
    expect(h.openPromised).toBe(0);
    expect(h.catalogueMatches).toBe(0);
    expect(h.incomingRep).toBe(null);
    expect(h.docLink).toBe(null);
  });

  it('nulls docLink unless it is an http(s) URL', () => {
    expect(normalizeHandoffRow({ ...bqRow, doc_link: 'javascript:alert(1)' }).docLink).toBe(null);
    expect(normalizeHandoffRow({ ...bqRow, doc_link: 'https://docs.google.com/document/d/abc' }).docLink)
      .toBe('https://docs.google.com/document/d/abc');
  });
});

describe('statusRank', () => {
  it('orders statuses along the lifecycle', () => {
    expect(statusRank('Draft')).toBeLessThan(statusRank('Shared'));
    expect(statusRank('Shared')).toBeLessThan(statusRank('Complete'));
  });

  it('sorts unknown statuses last', () => {
    expect(statusRank('Whatever')).toBe(HANDOFF_STATUSES.length);
    expect(statusRank(null)).toBe(HANDOFF_STATUSES.length);
  });
});

describe('fetch functions', () => {
  it('fetchHandoffs passes built SQL to query and normalizes rows', async () => {
    const seen = [];
    const query = async (sql) => { seen.push(sql); return { rows: [bqRow] }; };
    const out = await fetchHandoffs({ query });
    expect(seen[0]).toMatch(/QUALIFY ROW_NUMBER/);
    expect(out[0].accountRecordId).toBe(141376);
    expect(out[0].status).toBe('Shared');
  });

  it('fetchHandoffsForIncoming filters by rep', async () => {
    const seen = [];
    const query = async (sql) => { seen.push(sql); return { rows: [bqRow] }; };
    const out = await fetchHandoffsForIncoming('Jane Rep', { query });
    expect(seen[0]).toContain("incoming_rep = 'Jane Rep'");
    expect(out[0].incomingRep).toBe('Jane Rep');
  });

  it('fetchAccountHandoffs validates id before querying', async () => {
    const query = async () => ({ rows: [] });
    await expect(fetchAccountHandoffs('bad-id', { query })).rejects.toThrow();
    expect(await fetchAccountHandoffs('141376', { query })).toEqual([]);
  });
});
