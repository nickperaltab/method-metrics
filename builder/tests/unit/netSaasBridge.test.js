import { describe, it, expect } from 'vitest';
import { normalizeBridge, computeDelta, applyLens } from '../../src/lib/netSaasTransform.js';
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

describe('applyLens', () => {
  const bars = [
    { key:'start', label:'Start', type:'total', value:100000 },
    { key:'new', label:'New', type:'delta', value:8000 },
    { key:'expansion', label:'Expansion', type:'delta', value:5000 },
    { key:'downgrade', label:'Downgrades', type:'delta', value:-3000 },
    { key:'churn', label:'Churn', type:'delta', value:-4000 },
    { key:'end', label:'End', type:'total', value:106000 },
  ];
  const NET = { bars:['new','expansion','downgrade','churn'], labelMode:'dollar', rate:null };
  const GRR = { bars:['downgrade','churn'], labelMode:'dual', rate:'grr' };
  const NRR = { bars:['expansion','downgrade','churn'], labelMode:'dual', rate:'nrr' };

  it('netSaas: all delta bars visible, no pct', () => {
    const out = applyLens(bars, NET, 100000);
    const byKey = Object.fromEntries(out.map(b=>[b.key,b]));
    expect(byKey.new.visible).toBe(true);
    expect(byKey.expansion.visible).toBe(true);
    expect(byKey.new.pct).toBeNull();
    expect(byKey.start.visible).toBe(true);
    expect(byKey.end.visible).toBe(true);
  });
  it('grr: new + expansion hidden; downgrade/churn visible with pct of start', () => {
    const out = applyLens(bars, GRR, 100000);
    const byKey = Object.fromEntries(out.map(b=>[b.key,b]));
    expect(byKey.new.visible).toBe(false);
    expect(byKey.expansion.visible).toBe(false);
    expect(byKey.downgrade.visible).toBe(true);
    expect(byKey.downgrade.pct).toBeCloseTo(-0.03, 5); // -3000/100000
    expect(byKey.churn.pct).toBeCloseTo(-0.04, 5);
    expect(byKey.start.pct).toBeNull(); // Start never gets a %
  });
  it('nrr: new hidden; expansion visible with pct', () => {
    const out = applyLens(bars, NRR, 100000);
    const byKey = Object.fromEntries(out.map(b=>[b.key,b]));
    expect(byKey.new.visible).toBe(false);
    expect(byKey.expansion.visible).toBe(true);
    expect(byKey.expansion.pct).toBeCloseTo(0.05, 5);
  });
  it('totals always visible and never carry a pct', () => {
    const out = applyLens(bars, GRR, 100000);
    const byKey = Object.fromEntries(out.map(b=>[b.key,b]));
    expect(byKey.start.visible).toBe(true);
    expect(byKey.end.visible).toBe(true);
    expect(byKey.end.pct).toBeNull();
  });
});
