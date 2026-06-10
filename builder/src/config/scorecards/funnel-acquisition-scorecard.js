// builder/src/config/scorecards/funnel-acquisition-scorecard.js
export const funnelAcquisitionScorecard = {
  id: 'acquisition-funnel',
  title: 'Acquisition Funnel',
  subtitle: 'Cohort funnel: of the trials that started each month, how many synced and converted. $ shown at conversion only (DEP/Core split); retention lives in SaaS MRR Movement.',
  status: 'beta',
  labs: true,
  renderer: 'funnelDrill',
  segments: [
    { key: null, label: 'All' },
    { key: 'CompanySize', label: 'Company size' },
    { key: 'Assisted', label: 'Assisted (demo/PS touch)' },
  ],
  maturityDays: 90,
};
export default funnelAcquisitionScorecard;
