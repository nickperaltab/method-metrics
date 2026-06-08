// builder/src/config/scorecards/net-saas-scorecard.js
// Declares the Net SaaS bridge drill paths. Pure data — no queries, no UI.
// Consumed by DecompositionDrill.jsx (controller) and netSaasSql.js (query builder).

export const netSaasScorecard = {
  id: 'net-saas',
  title: 'SaaS MRR Movement',
  // Gross SaaS MRR (matches verified v_saas_mrr to the dollar). Runs slightly above
  // Looker's "Total Net SaaS", which nets out SaaS Expense; expense is a cost line,
  // not a customer movement, so the movement bridge tracks gross.
  subtitle: 'Gross SaaS MRR — matches verified v_saas_mrr. Runs slightly above Looker “Total Net SaaS”, which subtracts SaaS Expense.',
  status: 'beta',           // drives the top-right pill on the page + amber dot in nav
  labs: true,               // surfaces in the always-visible "Labs" nav section (experimental, not fully reviewed)
  group: 'revenue',
  grain: 'month',            // V1: month only
  defaultRange: 'latest-complete-month',
  renderer: 'netSaasDrill',  // Scorecard.jsx branches on this to mount DecompositionDrill

  // grain → source views (monthly = today's; annual = the live annual models)
  grains: {
    monthly: {
      label: 'Monthly',
      bridgeView: 'int_customer_mrr',
      decompView: 'int_mrr_movement_decomposed',
      grrMetric: 'v_metric__monthly_grr',
      nrrMetric: 'v_metric__monthly_nrr',
    },
    annual: {
      label: 'Annual',
      bridgeView: 'int_customer_annual_mrr',
      decompView: 'int_annual_mrr_movement_decomposed',
      grrMetric: 'v_metric__annual_grr',
      nrrMetric: 'v_metric__annual_nrr',
    },
  },

  // lens → which DELTA bars show + label mode + headline rate (null = no rate)
  // Start + End always render. NRR excludes New; GRR excludes New AND Expansion.
  lenses: {
    netSaas: { label: 'SaaS MRR', bars: ['new','expansion','downgrade','churn'], labelMode: 'dual', rate: null },
    nrr:     { label: 'NRR',      bars: ['expansion','downgrade','churn'],       labelMode: 'dual',   rate: 'nrr' },
    grr:     { label: 'GRR',      bars: ['downgrade','churn'],                    labelMode: 'dual',   rate: 'grr' },
  },

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
