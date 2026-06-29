import { describe, it, expect } from 'vitest';
import { toMotionFunnel, RETENTION_HORIZONS } from '../../src/lib/motionFunnelTransform.js';

const rows = [
  { motion: 'talked', trials: 100, synced: 80, demo_booked: 60, demo_attended: 45,
    free_booked: 10, free_attended: 8, converted: 40, customized: 12,
    retained_1mo: 38, eligible_1mo: 40, retained_3mo: 30, eligible_3mo: 35,
    retained_6mo: 0, eligible_6mo: 0, retained_12mo: 0, eligible_12mo: 0 },
  { motion: 'self_serve', trials: 300, synced: 150, demo_booked: 0, demo_attended: 0,
    free_booked: 0, free_attended: 0, converted: 60, customized: 5,
    retained_1mo: 50, eligible_1mo: 60, retained_3mo: 40, eligible_3mo: 55,
    retained_6mo: 0, eligible_6mo: 0, retained_12mo: 0, eligible_12mo: 0 },
];

describe('toMotionFunnel', () => {
  it('splits into talked + self_serve with conversion %', () => {
    const out = toMotionFunnel(rows);
    expect(out.talked.stages.map((s) => s.key)).toEqual(['trial', 'synced', 'converted', 'customized']);
    expect(out.talked.stages[0].count).toBe(100);
    expect(out.talked.stages[1].pctOfTrials).toBe(0.8);   // 80/100
    expect(out.self_serve.stages[2].count).toBe(60);
  });

  it('computes show rate = demo_attended / demo_booked (talked only)', () => {
    const out = toMotionFunnel(rows);
    expect(out.talked.showRate).toBe(0.75);   // 45/60
    expect(out.self_serve.showRate).toBe(null); // no booked
  });

  it('computes retention rate = retained/eligible, null when eligible 0', () => {
    const out = toMotionFunnel(rows);
    expect(out.talked.retention.map((r) => r.k)).toEqual(RETENTION_HORIZONS);
    expect(out.talked.retention[0].rate).toBe(0.95); // 38/40
    expect(out.talked.retention[0].mature).toBe(true);
    const r6 = out.talked.retention.find((r) => r.k === 6);
    expect(r6.rate).toBe(null);   // eligible_6mo = 0
    expect(r6.mature).toBe(false);
  });
});
