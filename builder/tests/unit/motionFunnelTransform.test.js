import { describe, it, expect } from 'vitest';
import { toSankey } from '../../src/lib/motionFunnelTransform.js';
import { buildJointSql } from '../../src/lib/motionFunnelSql.js';

// rows: {synced,demo_attended,free_attended,converted,is_customized,n}
const rows = [
  { synced:1, demo_attended:1, free_attended:1, converted:1, is_customized:1, n:100 },
  { synced:1, demo_attended:1, free_attended:0, converted:1, is_customized:0, n:50 },
  { synced:0, demo_attended:0, free_attended:0, converted:0, is_customized:0, n:300 },
];

describe('buildJointSql — boolean split filter', () => {
  const base = { startMonth: '2024-01-01', endMonth: '2026-06-01' };

  it('emits unquoted boolean true for has_dep split', () => {
    const sql = buildJointSql({ ...base, splitKey: 'has_dep', splitValue: 'true' });
    expect(sql).toContain('has_dep = true');
    expect(sql).not.toContain("has_dep = 'true'");
  });

  it('emits unquoted boolean false for has_dep split', () => {
    const sql = buildJointSql({ ...base, splitKey: 'has_dep', splitValue: 'false' });
    expect(sql).toContain('has_dep = false');
    expect(sql).not.toContain("has_dep = 'false'");
  });

  it('emits unquoted boolean true for is_prepay split', () => {
    const sql = buildJointSql({ ...base, splitKey: 'is_prepay', splitValue: 'true' });
    expect(sql).toContain('is_prepay = true');
    expect(sql).not.toContain("is_prepay = 'true'");
  });

  it('emits quoted string for user_tier split', () => {
    const sql = buildJointSql({ ...base, splitKey: 'user_tier', splitValue: 'Solo' });
    expect(sql).toContain("user_tier = 'Solo'");
  });
});

describe('toSankey', () => {
  it('builds Trial source + yes/no nodes per stage, conserving flow', () => {
    const { total, nodes, links } = toSankey(rows, 'paid');
    expect(total).toBe(450);
    // Trial -> Sync(yes) = 150 (two synced rows), Trial -> No sync = 300
    const tSyncYes = links.find(l => l.source === 'Trial' && l.target === 'Sync');
    const tSyncNo  = links.find(l => l.source === 'Trial' && l.target === 'No sync');
    expect(tSyncYes.value).toBe(150);
    expect(tSyncNo.value).toBe(300);
    // Paid stage present under 'paid' goal
    expect(nodes.some(n => n.name === 'Paid project hours')).toBe(true);
  });

  it("convert goal truncates after Converted (no Paid node)", () => {
    const { nodes } = toSankey(rows, 'convert');
    expect(nodes.some(n => n.name === 'Paid project hours')).toBe(false);
    expect(nodes.some(n => n.name === 'Converted')).toBe(true);
  });

  // Regression: BigQuery REST returns BOOL columns as the strings "true"/"false".
  // The transform must treat those as yes/no, not coerce them to 0 (which sent
  // every customer down the "No" path in prod).
  it('handles BigQuery string booleans ("true"/"false")', () => {
    const bqRows = [
      { synced:'true',  demo_attended:'true',  free_attended:'true',  converted:'true',  is_customized:'true',  n:'100' },
      { synced:'true',  demo_attended:'false', free_attended:'false', converted:'false', is_customized:'false', n:'50'  },
      { synced:'false', demo_attended:'false', free_attended:'false', converted:'false', is_customized:'false', n:'300' },
    ];
    const { links } = toSankey(bqRows, 'paid');
    const syncYes = links.find(l => l.source === 'Trial' && l.target === 'Sync');
    const syncNo  = links.find(l => l.source === 'Trial' && l.target === 'No sync');
    expect(syncYes.value).toBe(150); // two "true" rows: 100 + 50
    expect(syncNo.value).toBe(300);  // the "false" row
    // and the deepest yes-path flow exists (Converted -> Paid project hours = 100)
    const paid = links.find(l => l.source === 'Converted' && l.target === 'Paid project hours');
    expect(paid.value).toBe(100);
  });
});
