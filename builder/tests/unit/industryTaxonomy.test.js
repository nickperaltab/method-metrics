import { describe, it, expect } from 'vitest';
import {
  L1_DEFINITIONS,
  SPECIAL_BUCKETS,
  OPERATING_MODELS,
  HOW_WE_LABEL,
  TAXONOMY_VERSION,
  getSegmentDefinition,
} from '../../src/config/industryTaxonomy.js';

// Names MUST match the exact strings written to v7_classification.account_labels
// / v_entity_primary_label, or the dashboard's per-bar lookup silently misses.
// Verified against deployed labels 2026-06-23 (the CSV uses pre-V7.1-rename L1
// names, so do NOT source names from it).
const DEPLOYED_L1 = [
  'Manufacturing & Distribution',
  'Field Services & Trades',
  'Professional & Business Services',
  'Retail & Consumer',
];

// Deployed L2 count per L1 (account_labels, excl. UNCLASSIFIABLE), 2026-06-23.
const L2_COUNT = {
  'Manufacturing & Distribution': 14,
  'Field Services & Trades': 10,
  'Professional & Business Services': 13,
  'Retail & Consumer': 7,
};

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

  it('nests the deployed L2 sub-industries under each L1, each with a one-liner', () => {
    for (const d of L1_DEFINITIONS) {
      expect(d.l2.length).toBe(L2_COUNT[d.name]);
      for (const sub of d.l2) {
        expect(sub.name.length).toBeGreaterThan(0);
        expect(sub.oneLiner.length).toBeGreaterThan(0);
      }
    }
  });
});

// Deployed operating_model values in account_labels (excl. null), 2026-06-23.
const DEPLOYED_OM = [
  'Service_Only', 'Service_With_Products', 'Project_Services', 'Pure_Retailer',
  'B2B_Distributor', 'B2B_Producer', 'DTC_Producer', 'Hybrid_Producer', 'Hospitality',
];

describe('OPERATING_MODELS', () => {
  it('covers exactly the nine deployed operating models', () => {
    expect(OPERATING_MODELS.map((d) => d.name).sort()).toEqual([...DEPLOYED_OM].sort());
  });
  it('gives every operating model a one-liner', () => {
    for (const d of OPERATING_MODELS) expect(d.oneLiner.length).toBeGreaterThan(0);
  });
});

describe('SPECIAL_BUCKETS', () => {
  it('defines the two non-industry bars on the chart (Unclassified is retired)', () => {
    expect(SPECIAL_BUCKETS.map((d) => d.name).sort())
      .toEqual(['Multi-client', 'UNCLASSIFIABLE']);
    for (const d of SPECIAL_BUCKETS) expect(d.oneLiner.length).toBeGreaterThan(0);
  });
});

describe('getSegmentDefinition', () => {
  it('resolves a deployed L1 name', () => {
    expect(getSegmentDefinition('Field Services & Trades').oneLiner).toMatch(/on-site/i);
  });

  it('resolves a deployed L2 sub-industry name (drives drill tooltips)', () => {
    const d = getSegmentDefinition('HVAC, Plumbing & Electrical');
    expect(d).toBeTruthy();
    expect(d.oneLiner.length).toBeGreaterThan(0);
  });

  it('resolves the special buckets', () => {
    expect(getSegmentDefinition('Multi-client')).toBeTruthy();
    expect(getSegmentDefinition('UNCLASSIFIABLE')).toBeTruthy();
  });

  it('resolves an operating model (drives the OM-bar callout + tooltip)', () => {
    const d = getSegmentDefinition('Service_With_Products');
    expect(d).toBeTruthy();
    expect(d.oneLiner.length).toBeGreaterThan(0);
  });

  it('returns null for retired Unclassified and unknown names', () => {
    expect(getSegmentDefinition('Unclassified')).toBeNull();
    expect(getSegmentDefinition('Nonsense Industry')).toBeNull();
  });
});

describe('HOW_WE_LABEL + version', () => {
  it('exposes the four classification principles and a process summary', () => {
    expect(HOW_WE_LABEL.principles.length).toBe(4);
    expect(HOW_WE_LABEL.summary.length).toBeGreaterThan(0);
  });
  it('contains no em dashes in any prose (de-ai)', () => {
    const prose = [
      HOW_WE_LABEL.summary,
      HOW_WE_LABEL.validation,
      ...HOW_WE_LABEL.principles.map((p) => p.text),
      ...L1_DEFINITIONS.flatMap((d) => [d.oneLiner, d.description, ...d.l2.map((s) => s.oneLiner)]),
      ...SPECIAL_BUCKETS.flatMap((d) => [d.oneLiner, d.description]),
      ...OPERATING_MODELS.map((d) => d.oneLiner),
    ].join(' ');
    expect(prose).not.toMatch(/—/);
  });
  it('stamps the taxonomy version', () => {
    expect(TAXONOMY_VERSION).toMatch(/V7/);
  });
});
