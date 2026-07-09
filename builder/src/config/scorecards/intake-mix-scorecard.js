// builder/src/config/scorecards/intake-mix-scorecard.js
// Quarterly mix of new business (trials + new paying customers) by business
// size, benchmarked against the live top-30%-by-MRR customer fingerprint, plus
// customization attach per cohort. Answers: "are we acquiring the profile that
// retains and expands?"
export const intakeMixScorecard = {
  id: 'intake-mix',
  title: 'Intake Mix',
  subtitle: 'Are we acquiring the customers we want? Quarterly mix of new trials and new paying customers by business size (from their synced QuickBooks invoice volume), benchmarked against the profile of our top 30% of customers by MRR, plus customization attach per cohort.',
  status: 'beta',
  labs: true,
  renderer: 'intakeMix',
};
export default intakeMixScorecard;
