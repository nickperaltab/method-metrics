import { describe, it, expect } from 'vitest';
import { toSankey } from '../../src/lib/motionFunnelTransform.js';

// rows: {synced,demo_attended,free_attended,converted,is_customized,n}
const rows = [
  { synced:1, demo_attended:1, free_attended:1, converted:1, is_customized:1, n:100 },
  { synced:1, demo_attended:1, free_attended:0, converted:1, is_customized:0, n:50 },
  { synced:0, demo_attended:0, free_attended:0, converted:0, is_customized:0, n:300 },
];

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
});
