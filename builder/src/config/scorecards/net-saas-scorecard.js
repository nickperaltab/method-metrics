// builder/src/config/scorecards/net-saas-scorecard.js
// Declares the Net SaaS bridge drill paths. Pure data — no queries, no UI.
// Consumed by DecompositionDrill.jsx (controller) and netSaasSql.js (query builder).

export const netSaasScorecard = {
  id: 'net-saas',
  title: 'Net SaaS Movement',
  status: 'live',
  group: 'revenue',
  grain: 'month',            // V1: month only
  defaultRange: 'latest-complete-month',

  // L1 bridge bars, in render order. `sign` drives the waterfall direction.
  bridge: [
    { key: 'start',      label: 'Start MRR',  type: 'total',  column: 'StartMRR' },
    { key: 'new',        label: 'New',        type: 'delta',  sign: +1, column: 'NewMRR',        drill: 'new' },
    { key: 'expansion',  label: 'Expansion',  type: 'delta',  sign: +1, column: 'Expansions',    drill: 'expansion' },
    { key: 'downgrade',  label: 'Downgrades', type: 'delta',  sign: -1, column: 'Downgrades',    drill: 'downgrade' },
    { key: 'churn',      label: 'Churn',      type: 'delta',  sign: -1, column: 'Cancellations', drill: 'churn' },
    { key: 'end',        label: 'End MRR',    type: 'total',  column: 'p2_saas' },
  ],

  drills: {
    new: {
      mode: 'dimension',
      source: 'int_customer_mrr',
      measure: 'NewMRR',
      defaultDim: 'AttributionChannel',
      dims: ['AttributionChannel', 'Segment', 'Vertical'],
    },
    churn: {
      mode: 'dimension',
      source: 'int_customer_mrr',
      measure: 'Cancellations',
      defaultDim: 'Segment',
      dims: ['Segment', 'CohortAge', 'Vertical', 'SyncType'],
    },
    expansion: {
      mode: 'component',
      source: 'int_mrr_movement_decomposed',
      movementKind: 'expansion',
      components: ['seats', 'apps', 'price'],
    },
    downgrade: {
      mode: 'component',
      source: 'int_mrr_movement_decomposed',
      movementKind: 'downgrade',
      components: ['seats', 'apps', 'price'],
    },
  },

  l3: {
    core: [
      { key: 'Company',  label: 'Company',  format: 'text' },
      { key: 'deltaMrr', label: 'Δ MRR',    format: 'currency' },
      { key: 'Segment',  label: 'Segment',  format: 'text' },
      { key: 'UserTier', label: 'Tier',     format: 'text' },
    ],
    extras: {
      new:        [{ key: 'AttributionChannel', label: 'Channel', format: 'text' },
                   { key: 'signupMonth',        label: 'Signed up', format: 'month' }],
      churn:      [{ key: 'cohortAgeMonths',    label: 'Cohort age (mo)', format: 'number' }],
      expansion:  [{ key: 'seat_mrr', label: 'Seats $', format: 'currency' },
                   { key: 'app_mrr',  label: 'Apps $',  format: 'currency' },
                   { key: 'price_mrr',label: 'Price $', format: 'currency' }],
      downgrade:  [{ key: 'seat_mrr', label: 'Seats $', format: 'currency' },
                   { key: 'app_mrr',  label: 'Apps $',  format: 'currency' },
                   { key: 'price_mrr',label: 'Price $', format: 'currency' }],
    },
  },

  filters: {
    primary:  ['Segment', 'AttributionChannel', 'Vertical', 'UserTier'],
    overflow: ['SignupCountry', 'SyncType', 'HasDEP'],
  },
};

export default netSaasScorecard;
