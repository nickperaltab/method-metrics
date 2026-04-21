import { describe, it, expect } from 'vitest';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
}

const { hydrateKeys, snapshotFreshness } = await import('../../src/lib/sql/keys.js');

describe('hydrateKeys', () => {
  it('converts numeric string keys to numbers', () => {
    const m = hydrateKeys({ '54': { labels: ['2026-01'], data: [1] } });
    expect(m.get(54)).toEqual({ labels: ['2026-01'], data: [1] });
    expect(m.has('54')).toBe(false);
  });

  it('leaves compound keys as strings', () => {
    const m = hydrateKeys({ '54:week': { labels: ['W1'], data: [2] } });
    expect(m.get('54:week')).toBeTruthy();
  });

  it('returns empty Map for {}', () => {
    expect(hydrateKeys({}).size).toBe(0);
  });

  it('returns empty Map for null', () => {
    expect(hydrateKeys(null).size).toBe(0);
  });
});

describe('snapshotFreshness', () => {
  it('fresh for <=30h', () => {
    const ts = new Date(Date.now() - 20 * 3600e3).toISOString();
    expect(snapshotFreshness(ts)).toBe('fresh');
  });
  it('stale for 30-48h', () => {
    const ts = new Date(Date.now() - 40 * 3600e3).toISOString();
    expect(snapshotFreshness(ts)).toBe('stale');
  });
  it('expired for >48h', () => {
    const ts = new Date(Date.now() - 60 * 3600e3).toISOString();
    expect(snapshotFreshness(ts)).toBe('expired');
  });
  it('expired for null', () => {
    expect(snapshotFreshness(null)).toBe('expired');
  });
});
