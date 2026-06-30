import { describe, it, expect } from 'vitest';
import {
  L1_DEFINITIONS,
  SPECIAL_BUCKETS,
  HOW_WE_LABEL,
  TAXONOMY_VERSION,
  getSegmentDefinition,
} from '../../src/config/industryTaxonomy.js';

// These names MUST match the exact l1 strings written to
// v7_classification.account_labels / v_entity_primary_label, or the dashboard's
// per-bar definition lookup silently misses. Verified against the deployed
// labels 2026-06-23 (the CSV uses pre-V7.1-rename names — do NOT source from it).
const DEPLOYED_L1 = [
  'Manufacturing & Distribution',
  'Field Services & Trades',
  'Professional & Business Services',
  'Retail & Consumer',
];

describe('L1_DEFINITIONS', () => {
  it('covers exactly the four deployed L1 industries', () => {
    expect(L1_DEFINITIONS.map((d) => d.name).sort()).toEqual([...DEPLOYED_L1].sort());
  });

  it('gives every L1 a one-liner and a fuller description', () => {
    for (const d of L1_DEFINITIONS) {
      expect(d.oneLiner.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
    }
  });
});

describe('SPECIAL_BUCKETS', () => {
  it('defines the three non-industry bars that appear on the chart', () => {
    expect(SPECIAL_BUCKETS.map((d) => d.name).sort())
      .toEqual(['Multi-client', 'UNCLASSIFIABLE', 'Unclassified']);
    for (const d of SPECIAL_BUCKETS) expect(d.oneLiner.length).toBeGreaterThan(0);
  });
});

describe('getSegmentDefinition', () => {
  it('resolves a deployed L1 name to its definition', () => {
    const d = getSegmentDefinition('Field Services & Trades');
    expect(d).toBeTruthy();
    expect(d.oneLiner).toMatch(/on-site/i);
  });

  it('resolves the special buckets too', () => {
    expect(getSegmentDefinition('Multi-client')).toBeTruthy();
    expect(getSegmentDefinition('UNCLASSIFIABLE')).toBeTruthy();
    expect(getSegmentDefinition('Unclassified')).toBeTruthy();
  });

  it('returns null for an unknown segment', () => {
    expect(getSegmentDefinition('Nonsense Industry')).toBeNull();
  });
});

describe('HOW_WE_LABEL + version', () => {
  it('exposes the four classification principles and a process summary', () => {
    expect(HOW_WE_LABEL.principles.length).toBe(4);
    expect(HOW_WE_LABEL.summary.length).toBeGreaterThan(0);
  });
  it('stamps the taxonomy version', () => {
    expect(TAXONOMY_VERSION).toMatch(/V7/);
  });
});
