// builder/src/config/industryTaxonomy.js
// Plain-English definitions for the V7 industry taxonomy, surfaced on the GRR by
// Industry page so the labels are legible to anyone, including leadership.
//
// SOURCE: "Industry Classification at Method" (DOCUMENT.md) + the V7
// Classification Methodology Brief, in the RevOps classification project.
// `name` strings MUST match the exact l1/l2 values written to
// v7_classification.account_labels / v_entity_primary_label. The dashboard keys
// its per-bar lookup on them. Do NOT source names from TAXONOMY_V7.csv: it still
// uses the pre-V7.1-rename L1 names ("Manufacturing, Wholesale & Distribution",
// "Services & Trades"), which do not match the deployed labels. L2 names in that
// CSV did not change and are reused here.
//
// Prose follows the de-ai rules: no em dashes, no semicolons in narrative.

export const TAXONOMY_VERSION = 'V7.1';
export const TAXONOMY_SOURCE = 'Industry Classification at Method, V7.1 taxonomy and methodology';

// Four real L1 industries, each with its deployed L2 sub-industries. `oneLiner`
// is the at-a-glance essence (used for per-bar hints). `description` is the
// fuller "what this captures" text. Each L2 carries its own one-liner.
export const L1_DEFINITIONS = [
  {
    name: 'Manufacturing & Distribution',
    oneLiner: 'Makes or moves physical products.',
    description:
      'Primary identity is making or moving physical products: manufacturers, wholesalers, and '
      + 'distributors. A manufacturer that also installs is still classified here. Installation is a '
      + 'delivery mechanism, not the identity.',
    l2: [
      { name: 'Industrial & Equipment Distribution', oneLiner: 'Distributes industrial equipment, machinery, and supplies to businesses.' },
      { name: 'Industrial Manufacturing', oneLiner: 'Makes industrial equipment, machinery, metal, and process goods.' },
      { name: 'Consumer Products Manufacturing', oneLiner: 'Makes furniture, fixtures, apparel, and artisan or custom goods.' },
      { name: 'Specialty Distribution', oneLiner: 'Distributes automotive parts, consumer goods, and logistics.' },
      { name: 'Building Materials Manufacturing', oneLiner: 'Makes building materials, prefab components, and packaging.' },
      { name: 'Food & Beverage Manufacturing', oneLiner: 'Produces food and beverage products for wholesale or retail.' },
      { name: 'Building Materials Distribution', oneLiner: 'Distributes building and construction materials.' },
      { name: 'Electronics & Technology Distribution', oneLiner: 'Distributes electronics, technology products, and components.' },
      { name: 'Food & Beverage Distribution', oneLiner: 'Distributes food and beverage to retailers and restaurants.' },
      { name: 'Medical & Pharmaceutical Distribution', oneLiner: 'Distributes medical supplies, devices, and pharmaceuticals.' },
      { name: 'Medical & Life Sciences Manufacturing', oneLiner: 'Makes medical and dental devices, pharma, and biotech products.' },
      { name: 'Electronics & Technology Manufacturing', oneLiner: 'Makes electronic components, devices, and hardware.' },
      { name: 'Agriculture & Farming', oneLiner: 'Farms, ranches, and nurseries producing for wholesale.' },
      { name: 'General Wholesale & Distribution', oneLiner: 'Mixed wholesale or distribution that fits no specific category.' },
    ],
  },
  {
    name: 'Field Services & Trades',
    oneLiner: 'Delivers services on-site to businesses or homes.',
    description:
      'Primary identity is delivering services on-site: HVAC, plumbing and electrical, construction, '
      + 'landscaping, and industrial or commercial field services.',
    l2: [
      { name: 'Industrial & Commercial Field Services', oneLiner: 'On-site industrial and commercial work: welding, inspection, water, repair.' },
      { name: 'Specialty Construction', oneLiner: 'Trade construction: roofing, concrete, masonry, excavation.' },
      { name: 'HVAC, Plumbing & Electrical', oneLiner: 'Mechanical trades: heating and cooling, plumbing, electrical.' },
      { name: 'Home & Property Services', oneLiner: 'Residential upkeep: painting, pest control, repairs.' },
      { name: 'Cleaning & Environmental Services', oneLiner: 'Cleaning, environmental, and waste or recycling services.' },
      { name: 'Home Watch', oneLiner: 'Property monitoring and check-ins for absentee owners.' },
      { name: 'Landscaping & Outdoor Services', oneLiner: 'Lawn care, landscaping, tree work, pool and spa.' },
      { name: 'General Contracting', oneLiner: 'General contractors, builders, and construction managers.' },
      { name: 'Security, Fire & Alarm Systems', oneLiner: 'Installs and services security, fire, and alarm systems.' },
      { name: 'Flooring & Interior Finishing', oneLiner: 'Installs flooring, countertops, tile, and interior finishes.' },
    ],
  },
  {
    name: 'Professional & Business Services',
    oneLiner: 'Knowledge work, advice, and office-based services.',
    description:
      'Primary identity is delivering knowledge work, advice, or office-based services: accounting '
      + 'and bookkeeping, IT services, consulting, marketing and creative.',
    l2: [
      { name: 'Accounting & Bookkeeping', oneLiner: 'CPAs, tax prep, bookkeeping, payroll, fractional CFO.' },
      { name: 'Marketing & Creative Services', oneLiner: 'Marketing, advertising, creative, media, and print.' },
      { name: 'IT Services & Technology', oneLiner: 'Managed IT, IT consulting, data services, telecom.' },
      { name: 'Non-profit & Government', oneLiner: 'Non-profits, charities, government, and religious orgs.' },
      { name: 'Education & Training', oneLiner: 'Schools, training, tutoring, research, and coaching.' },
      { name: 'Software & SaaS', oneLiner: 'Builds or sells its own software or SaaS products.' },
      { name: 'Architectural & Engineering', oneLiner: 'Architecture and engineering firms, technical consulting.' },
      { name: 'Healthcare & Medical Services', oneLiner: 'Medical practices, clinics, and healthcare providers.' },
      { name: 'Real Estate & Property', oneLiner: 'Property management and real estate brokerage.' },
      { name: 'Financial & Insurance Services', oneLiner: 'Financial, insurance, fintech, and payments.' },
      { name: 'Staffing & HR Services', oneLiner: 'Staffing agencies, recruiters, and HR services.' },
      { name: 'Strategy & Consulting', oneLiner: 'Management, strategy, and operations consulting.' },
      { name: 'Legal Services', oneLiner: 'Law firms and legal service providers.' },
    ],
  },
  {
    name: 'Retail & Consumer',
    oneLiner: 'Sells directly to end consumers.',
    description:
      'Primary identity is selling directly to end consumers: retail, food and beverage, personal '
      + 'care and recreation, pet services. Method’s smallest L1, by design. The customer base skews B2B.',
    l2: [
      { name: 'Consumer Retail', oneLiner: 'General and specialty retail to consumers.' },
      { name: 'Automotive Services & Retail', oneLiner: 'Auto repair, dealerships, and automotive retail.' },
      { name: 'Food & Beverage Retail / Hospitality', oneLiner: 'Restaurants, cafes, bakeries, hotels, and tourism.' },
      { name: 'Personal Care & Recreation', oneLiner: 'Personal care, wellness, fitness, sports, and recreation.' },
      { name: 'Events & Entertainment', oneLiner: 'Event planning, entertainment, and venues.' },
      { name: 'Pet Services & Products', oneLiner: 'Pet care services and pet product retail.' },
      { name: 'Agriculture & Farming', oneLiner: 'Farms, ranches, and nurseries selling to consumers.' },
    ],
  },
];

// Non-industry bars that appear on the chart. (Unclassified retired 2026-06-23
// once the last unmapped entities were resolved.)
export const SPECIAL_BUCKETS = [
  {
    name: 'Multi-client',
    oneLiner: 'One billing entity that spans several businesses in different industries.',
    description:
      'A single billing entity, often a partner, reseller, or accountant, paying for multiple '
      + 'distinct businesses in different industries. Flagged as its own bucket rather than forced '
      + 'into one industry. Click a row to see its constituent accounts.',
  },
  {
    name: 'UNCLASSIFIABLE',
    oneLiner: 'No recoverable business identity, so we flag it rather than guess.',
    description:
      'No recoverable business identity from any signal (test accounts, partner-managed shells, '
      + 'dead domains). Flagged rather than guessed. Wrong data is worse than no data.',
  },
];

// The second axis: how a business goes to market. Orthogonal to industry. Names
// MUST match the operating_model values in account_labels (underscored). Source:
// V7 Classification Methodology Brief, Appendix A.
export const OPERATING_MODELS = [
  { name: 'Service_Only', oneLiner: 'No meaningful product revenue. Bookkeepers, cleaners, home watch.' },
  { name: 'Service_With_Products', oneLiner: 'Service-led, with real parts or equipment sales. A plumber selling water heaters.' },
  { name: 'Project_Services', oneLiner: 'Discrete project or contract work. General contractors.' },
  { name: 'Pure_Retailer', oneLiner: 'Product-led, sells to consumers, no real service arm.' },
  { name: 'B2B_Distributor', oneLiner: 'Distributes or wholesales others’ products to businesses.' },
  { name: 'B2B_Producer', oneLiner: 'Manufactures and sells to businesses.' },
  { name: 'DTC_Producer', oneLiner: 'Manufactures and sells direct to consumers.' },
  { name: 'Hybrid_Producer', oneLiner: 'Makes products and sells through multiple channels (DTC and wholesale).' },
  { name: 'Hospitality', oneLiner: 'Restaurants, hotels, tour and charter operators.' },
];

// How an account gets a label, in plain English for the dashboard.
export const HOW_WE_LABEL = {
  summary:
    'Each account is classified on two independent axes: its industry (L1 to L2 to L3) and one of '
    + '9 operating models. We read Method’s own signals first (self-selected vertical, NAICS, '
    + 'employee and customer counts) as priors, enrich from firmographic and web sources, then an '
    + 'LLM makes one identity-based reasoning pass against the V7 taxonomy and scores a confidence. '
    + 'Low-confidence or unrecoverable accounts are flagged for review, never guessed.',
  principles: [
    {
      name: 'Identity over Activity',
      text: 'Classify what the business is, not how it happens to operate. A manufacturer that installs is still a manufacturer.',
    },
    {
      name: 'Storefront Test',
      text: 'Sells to other businesses, it is Distribution. Sells to consumers as its primary channel, it is Retail.',
    },
    {
      name: 'Require Positive Evidence',
      text: 'Never infer from absence. Vague signals get flagged, not defaulted into a bucket.',
    },
    {
      name: 'No Catch-All Defaults',
      text: 'No recoverable identity becomes UNCLASSIFIABLE. Generic catch-all labels are server-rejected.',
    },
  ],
  validation:
    'Validated with inter-rater reliability (Cohen’s Kappa across two independent LLM raters), a '
    + 'MECE structure audit, and duplicate-consistency checks.',
};

// Resolve any chart segment name (L1, L2, or special bucket) to its definition,
// or null if unknown. L2 lookup is what drives the drill-level tooltips.
export function getSegmentDefinition(name) {
  return (
    L1_DEFINITIONS.find((d) => d.name === name)
    || SPECIAL_BUCKETS.find((d) => d.name === name)
    || OPERATING_MODELS.find((d) => d.name === name)
    || L1_DEFINITIONS.flatMap((d) => d.l2).find((s) => s.name === name)
    || null
  );
}
