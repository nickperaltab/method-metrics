import { describe, it, expect } from 'vitest';
import { normalizeBridge, computeDelta } from '../../src/lib/netSaasTransform.js';
import netSaasScorecard from '../../src/config/scorecards/net-saas-scorecard.js';

const ROW = { start_mrr:100000, new_mrr:8000, expansion_mrr:5000, downgrade_mrr:3000, churn_mrr:4000, end_mrr:106000 };

describe('normalizeBridge', () => {
  it('produces signed bar values: downgrades and churn negative', () => {
    const bars = normalizeBridge(ROW, netSaasScorecard);
    const byKey = Object.fromEntries(bars.map(b => [b.key, b.value]));
    expect(byKey.new).toBe(8000);
    expect(byKey.expansion).toBe(5000);
    expect(byKey.downgrade).toBe(-3000);
    expect(byKey.churn).toBe(-4000);
    expect(byKey.start).toBe(100000);
    expect(byKey.end).toBe(106000);
  });
  it('net saas = new + expansion - downgrade - churn', () => {
    const bars = normalizeBridge(ROW, netSaasScorecard);
    const net = bars.filter(b=>b.type==='delta').reduce((s,b)=>s+b.value,0);
    expect(net).toBe(6000); // 8000+5000-3000-4000
  });
});

describe('computeDelta', () => {
  it('returns absolute and pct change vs prior', () => {
    expect(computeDelta(8000, 5000)).toEqual({ abs: 3000, pct: 0.6, direction: 'up' });
  });
  it('handles prior=0 without dividing by zero', () => {
    const d = computeDelta(8000, 0);
    expect(d.abs).toBe(8000);
    expect(d.pct).toBeNull();
    expect(d.direction).toBe('up');
  });
  it('down direction for negative movement getting more negative', () => {
    expect(computeDelta(-4000, -3000).direction).toBe('down');
  });
});
