// builder/src/config/scorecards/grr-industry-scorecard.js
export const grrIndustryScorecard = {
  id: 'grr-industry',
  title: 'GRR by Industry',
  subtitle: 'Annual gross revenue retention sliced by the V7 industry taxonomy (L1→L2→L3) and operating model, from the enrichment data in v7_classification.account_labels. Click any bar to see the accounts and why they were classified that way.',
  status: 'beta',
  labs: true,
  renderer: 'grrIndustry',
};
export default grrIndustryScorecard;
