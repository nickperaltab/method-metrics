// builder/src/config/industryTaxonomy.js
// Plain-English definitions for the V7 industry taxonomy, surfaced on the GRR by
// Industry page so the labels are legible to anyone (incl. leadership).
//
// SOURCE: "Industry Classification at Method" (DOCUMENT.md) + the V7
// Classification Methodology Brief, in the RevOps classification project.
// The `name` strings MUST match the exact l1 values written to
// v7_classification.account_labels / v_entity_primary_label — the dashboard's
// per-bar lookup keys on them. Do NOT source names from TAXONOMY_V7.csv; it
// still uses the pre-V7.1-rename L1 names ("Manufacturing, Wholesale &
// Distribution", "Services & Trades") which do not match the deployed labels.
//
// Scope: L1 + the special buckets + the labeling methodology. L2/L3 definitions
// are a later pass.

export const TAXONOMY_VERSION = 'V7.1';
export const TAXONOMY_SOURCE = 'Industry Classification at Method — V7.1 taxonomy & methodology';

// The four real L1 industries. `oneLiner` is the at-a-glance essence (used for
// per-bar hints); `description` is the fuller "what this captures" text.
export const L1_DEFINITIONS = [
  {
    name: 'Manufacturing & Distribution',
    oneLiner: 'Makes or moves physical products.',
    description:
      'Businesses whose primary identity is making or moving physical products — manufacturers, '
      + 'wholesalers, and distributors. A manufacturer that also installs is still classified here '
      + '(installation is a delivery mechanism, not the identity).',
  },
  {
    name: 'Field Services & Trades',
    oneLiner: 'Delivers services on-site to businesses or homes.',
    description:
      'Businesses whose primary identity is delivering services on-site — HVAC, plumbing & '
      + 'electrical, construction, landscaping, and industrial/commercial field services.',
  },
  {
    name: 'Professional & Business Services',
    oneLiner: 'Knowledge work, advice, and office-based services.',
    description:
      'Businesses whose primary identity is delivering knowledge work, advice, or office-based '
      + 'services — accounting & bookkeeping, IT services, consulting, marketing & creative.',
  },
  {
    name: 'Retail & Consumer',
    oneLiner: 'Sells directly to end consumers.',
    description:
      'Businesses whose primary identity is selling directly to end consumers — retail, food & '
      + 'beverage, personal care & recreation, pet services. Method’s smallest L1, by design '
      + '(the customer base skews B2B).',
  },
];

// Non-industry bars that appear on the chart and confuse people the most.
export const SPECIAL_BUCKETS = [
  {
    name: 'Multi-client',
    oneLiner: 'One billing entity that spans several businesses in different industries.',
    description:
      'A single billing entity (often a partner, reseller, or accountant) paying for multiple '
      + 'distinct businesses in different industries. Flagged as its own bucket rather than forced '
      + 'into one industry. Click a row to see its constituent accounts.',
  },
  {
    name: 'UNCLASSIFIABLE',
    oneLiner: 'No recoverable business identity — flagged, not guessed.',
    description:
      'No recoverable business identity from any signal (test accounts, partner-managed shells, '
      + 'dead domains). Flagged rather than guessed — wrong data is worse than no data.',
  },
  {
    name: 'Unclassified',
    oneLiner: 'Not yet mapped to a labeled account.',
    description:
      'A tiny residual of billing entities with no labeled account behind them — mostly demos '
      + 'and tiny churned accounts. Not the same as UNCLASSIFIABLE (which was assessed and could '
      + 'not be classified).',
  },
];

// How an account gets a label — the plain-English version for the dashboard.
export const HOW_WE_LABEL = {
  summary:
    'Each account is classified on two orthogonal axes: its industry (L1→L2→L3) and one '
    + 'of 9 operating models. We read Method’s own signals first (self-selected vertical, '
    + 'NAICS, employee/customer counts) as priors, enrich from firmographic and web sources, then '
    + 'an LLM makes one identity-based reasoning pass against the V7 taxonomy and scores a '
    + 'confidence. Low-confidence or unrecoverable accounts are flagged for review, never guessed.',
  principles: [
    {
      name: 'Identity over Activity',
      text: 'Classify what the business is, not how it happens to operate. A manufacturer that installs is still a manufacturer.',
    },
    {
      name: 'Storefront Test',
      text: 'Sells to other businesses → Distribution; sells to consumers as its primary channel → Retail.',
    },
    {
      name: 'Require Positive Evidence',
      text: 'Never infer from absence. Vague signals get flagged, not defaulted into a bucket.',
    },
    {
      name: 'No Catch-All Defaults',
      text: 'No recoverable identity → UNCLASSIFIABLE. Generic catch-all labels are server-rejected.',
    },
  ],
  validation:
    'Validated with inter-rater reliability (Cohen’s Kappa across two independent LLM raters), '
    + 'a MECE structure audit, and duplicate-consistency checks.',
};

// Resolve any chart segment name (real L1 or special bucket) to its definition,
// or null if unknown.
export function getSegmentDefinition(name) {
  return (
    L1_DEFINITIONS.find((d) => d.name === name)
    || SPECIAL_BUCKETS.find((d) => d.name === name)
    || null
  );
}
