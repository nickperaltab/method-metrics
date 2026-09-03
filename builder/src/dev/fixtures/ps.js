// Synthetic fixtures for the PS screens (/ps, /call-prep, /handoffs) plus the
// account-detail sources (TimeTracking, Cases, int_accounts).
//
// THIS FILE MUST STAY FAKE. method-metrics is a public repo — real account
// names and per-customer MRR are gitignored elsewhere for that reason (see the
// root .gitignore). Every company, contact, note and dollar figure below is
// invented. Never paste a real BQ result in here.
//
// Row shape mirrors the BigQuery REST response as bigquery.js flattens it:
// every scalar is a STRING, and a repeated field is an array of `{ v }`. That
// is what the normalize*Row() functions in lib/callPrep.js and lib/handoffs.js
// expect, so fixtures exercise the same coercion path as production data.
//
// Everything is built inside fixtures() rather than at module scope on purpose.
// Module-level `.flatMap()` calls read as side effects to Rollup, which pinned
// all of this data into the production bundle even though MOCK_MODE folds to
// false there. Behind a function, the whole module tree-shakes away — verified
// by grepping dist/ for a fixture company name after `npm run build`.

const MS_PER_DAY = 86400000;

/** YYYY-MM-DD, `offsetDays` from today. Local, not UTC — matches localIsoDate. */
export function iso(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * MS_PER_DAY);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Consultant names deliberately mix "Brandon Saltzman" and "B. Saltzman" — the
// real snapshots feed writes both conventions for one person, and the fuzzy
// consultantPatternFromEmail() matcher exists to unify them. Fixtures that used
// one spelling would let a regression in that matcher pass unnoticed.
export const ME_FULL = 'Brandon Saltzman';
export const ME_SHORT = 'B. Saltzman';

const str = (v) => (v == null ? null : String(v));
const bool = (v) => (v ? 'true' : 'false');
const repeated = (arr) => (arr || []).map((v) => ({ v: String(v) }));

function snapshot(o) {
  const ageMonths = o.ageMonths ?? 18;
  return {
    account_record_id: str(o.id),
    account_name: o.name,
    snapshot_date: o.date,
    call_type: o.callType ?? 'PPU',
    consultant: o.consultant,
    account_age_months: str(ageMonths),
    signup_date: iso(-Math.round(ageMonths * 30.4)),
    dep_enrolled: bool(o.dep),
    multi_entity_parent_name: str(o.parent ?? null),
    multi_entity_parent_record_id: o.parent ? str(o.parentId ?? 900199) : null,
    parent_is_dep: o.parent ? bool(o.parentIsDep) : null,
    sync_fail_count: str(o.syncFails ?? 0),
    sync_status: o.syncStatus ?? (o.syncFails ? 'FAILING' : 'OK'),
    tt_total_hours: str(o.hours ?? 12.5),
    tt_session_count: str(o.sessions ?? 8),
    tt_last_session_date: str(o.lastSession),
    cases_open_count: str(o.casesOpen ?? 0),
    cases_closed_90d_count: str(o.casesClosed ?? 2),
    dep_signals: repeated(o.depSignals),
    industry_l1: o.industry?.[0] ?? null,
    industry_l2: o.industry?.[1] ?? null,
    industry_l3: o.industry?.[2] ?? null,
    operating_model: o.operatingModel ?? 'Field service',
    bq_confidence: str(o.confidence ?? 0.82),
    doc_link: `https://docs.google.com/document/d/mock-${o.id}`,
    created_at: `${o.date}T13:04:11Z`,
  };
}

function handoff(o) {
  return {
    account_record_id: str(o.id),
    account_name: o.name,
    handoff_date: o.handoffDate,
    outgoing_rep: o.outgoing,
    incoming_rep: o.incoming,
    status: o.status,
    doc_link: `https://docs.google.com/document/d/mock-handoff-${o.id}`,
    open_in_progress: str(o.inProgress ?? 0),
    open_promised: str(o.promised ?? 0),
    catalogue_matches: str(o.catalogue ?? 0),
    flags: repeated(o.flags),
    first_priority: o.firstPriority,
    created_at: `${o.createdAt}T16:20:00Z`,
  };
}

// Ten invented accounts spanning the states the UI has to render: failing sync,
// open cases, a cold account, DEP accounts, a multi-entity child, a churned
// account, and a couple of clean ones so "nothing wrong" also has a look.
function accountSeed() {
  return [
    {
      id: 900101, name: 'Northwind Traders', consultant: ME_FULL, callType: 'PPU',
      ageMonths: 26, syncFails: 3, casesOpen: 2, casesClosed: 4, hours: 41.25,
      sessions: 22, lastSession: iso(-2), dep: true,
      depSignals: ['3 sessions in 30d', 'Multi-entity parent', 'Asked about retainer'],
      industry: ['Wholesale & Distribution', 'Industrial Supply', 'Fasteners'],
      operatingModel: 'Order-to-cash', confidence: 0.91,
      mrr: 1840, licenses: 24, health: 62, active: true, payType: 'Annual',
    },
    {
      id: 900102, name: 'Harborview Dental Group', consultant: ME_SHORT, callType: 'PPU',
      ageMonths: 9, syncFails: 0, casesOpen: 1, casesClosed: 1, hours: 8.5,
      sessions: 6, lastSession: iso(-6), dep: false,
      industry: ['Healthcare', 'Dental', 'Multi-location practice'],
      operatingModel: 'Appointment-based', confidence: 0.74,
      mrr: 640, licenses: 9, health: 78, active: true, payType: 'Monthly',
    },
    {
      id: 900103, name: 'Cedarline Millwork', consultant: ME_FULL, callType: 'FREE',
      ageMonths: 3, syncFails: 0, casesOpen: 0, casesClosed: 0, hours: 2,
      sessions: 2, lastSession: iso(-48), dep: false,
      industry: ['Manufacturing', 'Millwork & Cabinetry', 'Custom fabrication'],
      operatingModel: 'Estimate-to-build', confidence: 0.55,
      mrr: 180, licenses: 3, health: 41, active: true, payType: 'Monthly',
    },
    {
      id: 900104, name: 'Pike & Powell Supply', consultant: ME_SHORT, callType: 'PPU',
      ageMonths: 44, syncFails: 1, casesOpen: 3, casesClosed: 7, hours: 96.75,
      sessions: 51, lastSession: iso(-1), dep: true,
      depSignals: ['Dedicated since Feb', 'Two active projects', 'Custom app in flight'],
      industry: ['Wholesale & Distribution', 'Building Materials', 'Contractor supply'],
      operatingModel: 'Order-to-cash', confidence: 0.95,
      mrr: 3420, licenses: 47, health: 71, active: true, payType: 'Annual',
    },
    {
      id: 900105, name: 'Bright Harbor Logistics', consultant: ME_FULL, callType: 'PPU',
      ageMonths: 15, syncFails: 0, casesOpen: 0, casesClosed: 3, hours: 19,
      sessions: 11, lastSession: iso(-9), dep: false,
      parent: 'Bright Harbor Holdings', parentId: 900190, parentIsDep: true,
      industry: ['Transportation', 'Freight Brokerage', '3PL'],
      operatingModel: 'Dispatch', confidence: 0.68,
      mrr: 1120, licenses: 16, health: 84, active: true, payType: 'Monthly',
    },
    {
      id: 900106, name: 'Tallgrass Landscaping', consultant: ME_FULL, callType: 'PPU',
      ageMonths: 31, syncFails: 0, casesOpen: 0, casesClosed: 1, hours: 33.5,
      sessions: 18, lastSession: iso(-72), dep: false,
      industry: ['Field Service', 'Landscaping', 'Commercial grounds'],
      operatingModel: 'Recurring service', confidence: 0.79,
      mrr: 0, licenses: 0, health: 12, active: false, payType: 'Monthly',
    },
    {
      id: 900107, name: 'Ridgeway Plumbing Co', consultant: ME_SHORT, callType: 'PPU',
      ageMonths: 7, syncFails: 5, casesOpen: 1, casesClosed: 2, hours: 6.25,
      sessions: 5, lastSession: iso(-4), dep: false,
      industry: ['Field Service', 'Plumbing', 'Residential'],
      operatingModel: 'Work order', confidence: 0.63,
      mrr: 460, licenses: 7, health: 49, active: true, payType: 'Monthly',
    },
    {
      id: 900108, name: 'Vantage Signworks', consultant: ME_FULL, callType: 'FREE',
      ageMonths: 1, syncFails: 0, casesOpen: 0, casesClosed: 0, hours: 1,
      sessions: 1, lastSession: iso(-11), dep: false,
      industry: ['Manufacturing', 'Signage', 'Custom print'],
      operatingModel: 'Estimate-to-build', confidence: 0.42,
      mrr: 120, licenses: 2, health: 55, active: true, payType: 'Monthly',
    },
    // Two other consultants' accounts, so the Call Prep consultant list and the
    // "Everyone" views have more than one book in them.
    {
      id: 900109, name: 'Sunfield Nutrition', consultant: 'S. Zarei', callType: 'PPU',
      ageMonths: 21, syncFails: 2, casesOpen: 1, casesClosed: 5, hours: 27,
      sessions: 14, lastSession: iso(-3), dep: true,
      depSignals: ['Weekly cadence', 'Portal rollout'],
      industry: ['Consumer Goods', 'Supplements', 'DTC + wholesale'],
      operatingModel: 'Order-to-cash', confidence: 0.86,
      mrr: 2210, licenses: 31, health: 66, active: true, payType: 'Annual',
    },
    {
      id: 900110, name: 'Lumen Fabrication', consultant: 'Vinesh Gobin', callType: 'PPU',
      ageMonths: 12, syncFails: 0, casesOpen: 0, casesClosed: 2, hours: 15.5,
      sessions: 9, lastSession: iso(-15), dep: false,
      industry: ['Manufacturing', 'Metal Fabrication', 'Job shop'],
      operatingModel: 'Job costing', confidence: 0.72,
      mrr: 880, licenses: 12, health: 74, active: true, payType: 'Monthly',
    },
  ];
}

// Snapshot history: the routine appends one row per prep, so the detail page's
// timeline needs several dates per account. The three accounts prepped `today`
// are what makes the /ps Today panel non-empty.
const HISTORY_OFFSETS = [0, -7, -21, -56];
const PREPPED_TODAY = new Set([900101, 900104, 900109]);

const SUPPORT_TYPES = ['Consulting', 'Dedicated Consultant', 'Support', 'Training'];
const BILLABLE = ['Billable', 'Not Billable', 'Billable'];
const NOTE_TEMPLATES = [
  'Reviewed open work items. Confirmed the invoice screen change is live in production. Customer asked whether the estimate approval email can include a PDF attachment — flagged as a possible customization.',
  'QuickBooks sync walkthrough. Two items were stuck on a missing account mapping; remapped and re-ran. Sync clean at end of call.',
  'Working session on the work-order screen. Added the crew assignment dropdown and a filter for open orders. Customer will test with two techs this week.',
  'Training for two new users on estimates and invoicing. Both comfortable by end of session. Sent recording and the getting-started doc.',
  'Scoping call for the customer portal. Walked through what portal users can see. Customer needs approval from their ops lead before we build.',
  'Follow-up on the open case about duplicate contacts. Root cause was an import run twice; merged the duplicates and showed them the dedupe view.',
];
const CASE_SUBJECTS = [
  'Sync error: unmapped income account',
  'Estimate PDF missing line item descriptions',
  'New user cannot see the Work Orders tab',
  'Duplicate contacts after import',
  'Invoice email template not applying',
  'Portal login link expired',
];
const CONTACTS = ['Dana Whitcombe', 'Marcus Reyes', 'Priya Nandakumar', 'Ellis Vaughn', 'Tomas Berg'];

// revenue.Activity — Comments arrive as CRM rich text, so these carry real tags
// and entities to exercise stripHtml() rather than reading as clean prose.
const ACTIVITY_TYPES = [
  'Demo', 'AI Summary - Demo', 'Chat Incoming', 'Phone Call Outgoing',
  'Email Incoming & Outgoing', 'Phone Call Incoming', 'Chat Incoming',
];
const ACTIVITY_COMMENTS = [
  '<p>Walked the estimate flow end to end. Customer wants package pricing with terms text instead of itemised lines.</p>',
  '<p><strong>Meeting Summary</strong></p><p>Reviewed onboarding progress; QuickBooks sync confirmed clean &amp; no open blockers.</p>',
  'Question<br>The customer asked how to create jobs from an approved estimate.',
  '<p>Called to check in on setup &nbsp;&mdash; left voicemail.</p>',
  '<div>Sent the getting-started guide and booked the follow-up session.</div>',
  '<p>Customer could not log in; reset the password and confirmed access.</p>',
];

// call_prep.opportunity_fit — one row per motion, matching the four the routine
// always assesses. Northwind is the interesting case: two flagged motions with
// signals and a caveat.
const FIT_SEEDS = {
  900101: [
    { motion: 'method_pay', fit: 'strong', hook: 'overdue_invoice_reminders',
      signals: ['AR chased manually in TT notes', 'No gateway connected'],
      rationale: 'Two sessions mention chasing overdue invoices by hand, and no payment gateway is connected.',
      caveats: 'Method Pay hook naming is not confirmed with Product — do not present as a named feature.' },
    { motion: 'dep', fit: 'moderate',
      signals: ['22 sessions over 26 months', 'Recurring sync topic across consultants'],
      rationale: '41 billed hours across 22 sessions, with the same QuickBooks sync topic re-explained to three consultants.' },
    { motion: 'ppu', fit: 'current', signals: ['current_ppu_booking'],
      rationale: 'Today’s booking is a PPU session.' },
    { motion: 'free_hour', fit: 'none', signals: [],
      rationale: 'Free Hour was used in the first month; the account is on paid consulting now.' },
  ],
  900103: [
    { motion: 'method_pay', fit: 'none', signals: [], rationale: 'No payment friction anywhere in account history.' },
    { motion: 'dep', fit: 'none', signals: [],
      rationale: 'Account is ~3 months old with 2 sessions — no volume, complexity or continuity signal.' },
    { motion: 'ppu', fit: 'moderate', signals: ['Second free session requested'],
      rationale: 'A second scoping request arrived after the free hour was used.' },
    { motion: 'free_hour', fit: 'current', signals: ['current_free_hour_booking'],
      rationale: 'Today’s booking is the account’s complimentary Free Hour.' },
  ],
};

function build() {
  const seeds = accountSeed();

  const SNAPSHOTS = seeds.flatMap((seed) =>
    HISTORY_OFFSETS
      .filter((offset) => offset !== 0 || PREPPED_TODAY.has(seed.id))
      .map((offset, i) =>
        snapshot({
          ...seed,
          date: iso(offset),
          // Older snapshots looked healthier — gives the timeline something to say.
          syncFails: i === 0 ? seed.syncFails : 0,
          casesOpen: i === 0 ? seed.casesOpen : Math.max(0, (seed.casesOpen ?? 0) - 1),
          hours: +((seed.hours ?? 12) * (1 - i * 0.18)).toFixed(2),
          sessions: Math.max(1, Math.round((seed.sessions ?? 8) * (1 - i * 0.2))),
        })
      )
  );

  // revenue.int_accounts rows, keyed the way the board's LEFT JOIN expects.
  const ACCOUNTS = seeds.map((s) => ({
    account_record_id: str(s.id),
    mrr_run_rate: str(s.mrr),
    user_licenses: str(s.licenses),
    health_score: str(s.health),
    is_active: bool(s.active),
    saas_pay_type: s.payType,
  }));

  // revenue.TimeTracking — the session timeline on the account page. Rotating
  // support types and billable statuses so all the timeline badges appear.
  const SESSIONS = seeds.flatMap((seed) => {
    const count = Math.min(seed.sessions ?? 6, 9);
    return Array.from({ length: count }, (_, i) => ({
      _account: str(seed.id),
      TxnDate: iso(-(i * 14 + 2)),
      MethodSupportType:
        seed.dep && i % 3 === 1 ? 'Dedicated Consultant' : SUPPORT_TYPES[i % SUPPORT_TYPES.length],
      BillableStatus: BILLABLE[i % BILLABLE.length],
      IsDemo: bool(false),
      DurationHours: str([1, 1.5, 2, 0.5, 1.25][i % 5]),
      AssignedToRecordID: str(4021),
      Notes: NOTE_TEMPLATES[(seed.id + i) % NOTE_TEMPLATES.length],
    }));
  });

  // revenue.Cases — open + closed mix per account so both branches of the
  // isOpen split have rows. CaseSubject is null on the open ones, which is what
  // makes the query's COALESCE(CaseSubject, Subject) worth exercising.
  const CASES = seeds.flatMap((seed) => {
    const open = seed.casesOpen ?? 0;
    const closed = Math.min(seed.casesClosed ?? 0, 4);
    return [
      ...Array.from({ length: open }, (_, i) => ({
        _account: str(seed.id),
        RecordID: str(seed.id * 10 + i),
        CaseStatus: i === 0 ? 'In Progress' : 'Assigned',
        CasePriority: i === 0 ? 'High' : 'Normal',
        CaseSubject: null,
        Subject: CASE_SUBJECTS[(seed.id + i) % CASE_SUBJECTS.length],
        CreatedDate: `${iso(-(i * 9 + 5))}T09:12:00Z`,
        ClosedDate: null,
        ContactName: CONTACTS[(seed.id + i) % CONTACTS.length],
      })),
      ...Array.from({ length: closed }, (_, i) => ({
        _account: str(seed.id),
        RecordID: str(seed.id * 10 + 50 + i),
        CaseStatus: 'Closed',
        CasePriority: 'Normal',
        CaseSubject: CASE_SUBJECTS[(seed.id + i + 2) % CASE_SUBJECTS.length],
        Subject: null,
        CreatedDate: `${iso(-(i * 17 + 30))}T14:40:00Z`,
        ClosedDate: `${iso(-(i * 17 + 24))}T11:02:00Z`,
        ContactName: CONTACTS[(seed.id + i + 1) % CONTACTS.length],
      })),
    ];
  });

  // revenue.Activity — the brief's "Recent activities". Every account gets a
  // run so the section is never empty, newest first.
  const ACTIVITIES = seeds.flatMap((seed) =>
    Array.from({ length: 7 }, (_, i) => ({
      _account: str(seed.id),
      RecordID: str(seed.id * 100 + i),
      occurred_on: iso(-(i * 4 + 1)),
      ActivityType: ACTIVITY_TYPES[(seed.id + i) % ACTIVITY_TYPES.length],
      ActivityStatus: 'Completed',
      AssignedToRecordID: str(455 + ((seed.id + i) % 3)),
      Comments: ACTIVITY_COMMENTS[(seed.id + i) % ACTIVITY_COMMENTS.length],
    }))
  );

  // call_prep.opportunity_fit — only two accounts are seeded, so the page's
  // "no assessment yet" branch stays reachable.
  const OPPORTUNITY_FIT = Object.entries(FIT_SEEDS).flatMap(([id, rows]) =>
    rows.map((r) => ({
      _account: str(id),
      account_record_id: str(id),
      account_name: seeds.find((s) => String(s.id) === id)?.name ?? null,
      motion: r.motion,
      fit: r.fit,
      rationale: r.rationale,
      signals: repeated(r.signals),
      recommended_hook: r.hook ?? null,
      caveats: r.caveats ?? null,
      assessed_date: iso(0),
      review_status: 'new',
      first_flagged_date: iso(0),
    }))
  );

  // call_prep.handoffs — empty in real BQ today (see docs/ps-hub.md), so these
  // fixtures are the only way to see the Handoffs screens with content. One row
  // per status change, newest first per account.
  const HANDOFFS = [
    // Incoming to me, mid-lifecycle, with history.
    handoff({
      id: 900109, name: 'Sunfield Nutrition', handoffDate: iso(-4), outgoing: 'S. Zarei',
      incoming: ME_FULL, status: 'Shared', inProgress: 3, promised: 2, catalogue: 5,
      flags: ['Promised work outstanding', 'Sync failing at handoff'],
      firstPriority: 'Confirm the portal rollout timeline before the next billing cycle.',
      createdAt: iso(-2),
    }),
    handoff({
      id: 900109, name: 'Sunfield Nutrition', handoffDate: iso(-4), outgoing: 'S. Zarei',
      incoming: ME_FULL, status: 'Ready', inProgress: 3, promised: 2, catalogue: 5,
      flags: ['Promised work outstanding'],
      firstPriority: 'Confirm the portal rollout timeline before the next billing cycle.',
      createdAt: iso(-4),
    }),
    handoff({
      id: 900109, name: 'Sunfield Nutrition', handoffDate: iso(-4), outgoing: 'S. Zarei',
      incoming: ME_FULL, status: 'Draft', inProgress: 4, promised: 2, catalogue: 5,
      flags: [], firstPriority: 'Review open work items with S. Zarei.',
      createdAt: iso(-6),
    }),
    // Outgoing from me.
    handoff({
      id: 900106, name: 'Tallgrass Landscaping', handoffDate: iso(-12), outgoing: ME_SHORT,
      incoming: 'Vinesh Gobin', status: 'Complete', inProgress: 0, promised: 0, catalogue: 2,
      flags: ['Account churned'], firstPriority: 'No action — account cancelled 2 weeks ago.',
      createdAt: iso(-10),
    }),
    // Someone else's, so the "Everyone" list differs from "Mine".
    handoff({
      id: 900110, name: 'Lumen Fabrication', handoffDate: iso(-1), outgoing: 'Vinesh Gobin',
      incoming: 'S. Zarei', status: 'Questions Pending', inProgress: 2, promised: 1, catalogue: 1,
      flags: ['Unanswered questions'], firstPriority: 'Get answers on the job-costing rollup.',
      createdAt: iso(-1),
    }),
  ];


  // ── Free Hours ───────────────────────────────────────────────────────────
  // Shaped to mirror the real distribution so the screen gets designed against
  // reality: most Free Hours are an account's first and convert around 30%;
  // repeats are fewer and skew toward accounts mid-engagement, so they sit
  // outside the rate. Roughly 40% go to existing SaaS customers rather than
  // trials, and the delivering rep sends the agreement on about 1 trial Free
  // Hour in 10 — a proposal desk writes the rest. See lib/freeHours.js.
  const freeHour = (o) => ({
    fh_id: String(o.id),
    account_record_id: String(o.account),
    account: o.name,
    consultant: o.consultant,
    call_date: o.date,
    cohort_month: o.date.slice(0, 7),
    fh_seq: String(o.seq ?? 1),
    open_case_at_call: String(!!o.openCase),
    paying_saas_at_call: String(!!o.payingSaas),
    saas_state_unknown: 'false',
    prior_consulting_case: String(!!o.priorCase),
    days_to_ppu: o.ppu == null ? null : String(o.ppu),
    days_to_dep: o.dep == null ? null : String(o.dep),
    days_to_agreement: o.signed == null ? null : String(o.signed),
    days_to_agreement_sent: o.sent == null ? null : String(o.sent),
    paid_hours_90d: String(o.hours ?? 0),
    days_elapsed: String(o.elapsed ?? 120),
  });

  const withLastFh = (rows) => {
    const last = new Map();
    const count = new Map();
    for (const r of rows) {
      const k = r.account_record_id;
      if (!last.has(k) || r.call_date > last.get(k)) last.set(k, r.call_date);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    return rows.map((r) => ({
      ...r,
      last_fh_month: last.get(r.account_record_id).slice(0, 7),
      account_fh_count: String(count.get(r.account_record_id)),
    }));
  };


  // One row per consultant per month, matching buildUtilizationSql(). The eight
  // hour buckets are disjoint, so a row's fields add up to everything that
  // consultant logged that month; the mock would otherwise let a bad `total`
  // pass unnoticed.
  //
  // Shapes worth keeping: a rep carrying heavy bankable time, one whose month is
  // almost all internal project work, and the current month with no bankable
  // hours at all (that is what a real in-progress month looks like, since unused
  // dedicated time is only posted on the last day).
  const utilMonth = (o) => ({
    consultant: o.consultant,
    month: o.month,
    entries: String(o.entries ?? 40),
    dedicated_hours: String(o.dedicated ?? 0),
    ppu_hours: String(o.ppu ?? 0),
    free_hours: String(o.free ?? 0),
    other_hours: String(o.other ?? 0),
    unused_dedicated_hours: String(o.unused ?? 0),
    discounted_paid_hours: String(o.discountedPaid ?? 0),
    discounted_free_hours: String(o.discountedFree ?? 0),
    internal_project_hours: String(o.internalProject ?? 0),
    internal_other_hours: String(o.internalOther ?? 0),
  });

  // Hours are sized to a real consultant month: roughly 105-135 logged. A month
  // over ~200 is the signature of the DurationHours + DurationMinutes doubling.
  // Three closed months plus the month the clock is in, so the in-progress
  // banner and the grey dot always have something to attach to.
  const utilMonths = (() => {
    const d = new Date();
    const at = (back) => {
      const m = new Date(d.getFullYear(), d.getMonth() - back, 1);
      return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    };
    return [at(3), at(2), at(1), at(0)];
  })();

  const UTILIZATION = [
    // A full book: mostly dedicated, a normal amount of bankable time.
    ...utilMonths.map((month, i) => utilMonth({
      consultant: ME_FULL, month, entries: 96 - i,
      dedicated: 85 + i * 2, ppu: 7, free: 3,
      unused: month === utilMonths[3] ? 0 : 12 + i, discountedPaid: 1.5,
      internalProject: 2, internalOther: 1,
    })),
    // Heavy bankable time: a book of dedicated accounts that under-use their hours.
    ...utilMonths.map((month, i) => utilMonth({
      consultant: 'Vinesh Gobin', month, entries: 70,
      dedicated: 60, ppu: 3, free: 6,
      unused: month === utilMonths[3] ? 0 : 30 - i * 2, discountedPaid: 4.5,
      internalOther: 3,
    })),
    // Mostly internal project work, so the rate lands far below the others.
    ...utilMonths.map((month, i) => utilMonth({
      consultant: 'Cheryl Tong', month, entries: 52,
      dedicated: 45, ppu: 11, free: 2,
      unused: month === utilMonths[3] ? 0 : 3.5,
      internalProject: 24 + i, internalOther: 6,
    })),
    // Only two months on the team, which is what billablePerMonth exists to handle.
    ...utilMonths.slice(2).map((month) => utilMonth({
      consultant: 'Phuong Phan', month, entries: 31,
      dedicated: 55, free: 4.5, discountedPaid: 1, internalOther: 10.5,
    })),
  ];

  // One row per PS agreement. Accounts and consultants line up with FREE_HOURS
  // below so the account+consultant match the screen does has something to hit,
  // and two deliberately do NOT: an agreement on a Free Hour account written by
  // a different rep (the proposal desk), and one for an account that never had a
  // Free Hour. Both must be excluded by the match.
  const agreement = (o) => ({
    proposal_id: String(o.id),
    account_record_id: String(o.account),
    consultant: o.consultant,
    contract_type: o.type ?? 'Pay-Per-Use',
    sent_date: o.date,
    accepted: bool(o.accepted),
  });

  const AGREEMENTS = [
    // Sent by the rep who ran the Free Hour — these count.
    agreement({ id: 9001, account: 4242, consultant: ME_FULL, date: iso(-118), accepted: true }),
    agreement({ id: 9002, account: 4415, consultant: 'Vinesh Gobin', date: iso(-87), type: 'Dedicated' }),
    agreement({ id: 9003, account: 4415, consultant: 'Cheryl Tong', date: iso(-29), accepted: true }),
    // Second agreement on an account that already had one — counted separately,
    // which is why the match de-duplicates on proposal id rather than account.
    agreement({ id: 9004, account: 4242, consultant: ME_FULL, date: iso(-100) }),
    // The proposal desk: right account, wrong rep. Must not count for anyone.
    agreement({ id: 9005, account: 4488, consultant: 'Phuong Phan', date: iso(-66) }),
    // An account nobody ran a Free Hour on. Must not count.
    agreement({ id: 9006, account: 4999, consultant: ME_FULL, date: iso(-20) }),
    // Right rep and account, sent months after the Free Hour. Counts: there is
    // no ordering or window test, only the period the screen is showing.
    agreement({ id: 9007, account: 4310, consultant: ME_FULL, date: iso(-2) }),
  ];

  const FREE_HOURS = withLastFh([
    // Converted, first Free Hour — the common winning shape.
    freeHour({ id: 8001, sent: 2, payingSaas: true, account: 4242, name: 'northwind-supply', consultant: ME_FULL, date: iso(-120), ppu: 6, signed: 3, hours: 12.5, elapsed: 120 }),
    freeHour({ id: 8002, sent: 5, account: 4310, name: 'lumen-fabrication', consultant: ME_FULL, date: iso(-96), dep: 11, signed: 8, hours: 24, elapsed: 96 }),
    freeHour({ id: 8003, sent: 1, payingSaas: true, account: 4415, name: 'harbor-freight-co', consultant: 'Vinesh Gobin', date: iso(-88), ppu: 2, signed: 0, hours: 6, elapsed: 88 }),
    freeHour({ id: 8004, sent: 12, account: 4488, name: 'cedar-mill-works', consultant: 'Cheryl Tong', date: iso(-70), dep: 21, signed: 16, hours: 30, elapsed: 70 }),
    // Did not convert.
    freeHour({ id: 8005, payingSaas: true, account: 4501, name: 'atlas-plumbing', consultant: ME_FULL, date: iso(-64), elapsed: 64 }),
    freeHour({ id: 8006, account: 4523, name: 'quill-and-press', consultant: 'Vinesh Gobin', date: iso(-58), elapsed: 58 }),
    freeHour({ id: 8007, account: 4544, name: 'bayside-marine', consultant: 'Cheryl Tong', date: iso(-51), elapsed: 51 }),
    freeHour({ id: 8008, account: 4560, name: 'ridgeline-hvac', consultant: ME_FULL, date: iso(-44), elapsed: 44 }),
    // Repeat Free Hours: mostly accounts mid-engagement, so out of the rate.
    freeHour({ id: 8009, account: 4242, name: 'northwind-supply', consultant: ME_FULL, date: iso(-38), seq: 2, openCase: true, priorCase: true, hours: 4, elapsed: 38 }),
    freeHour({ id: 8010, account: 4310, name: 'lumen-fabrication', consultant: 'Vinesh Gobin', date: iso(-30), seq: 2, openCase: true, priorCase: true, elapsed: 30 }),
    freeHour({ id: 8011, account: 4242, name: 'northwind-supply', consultant: ME_FULL, date: iso(-12), seq: 3, openCase: true, priorCase: true, elapsed: 12 }),
    // A repeat that did convert — rarer, but it happens.
    freeHour({ id: 8012, sent: 4, payingSaas: true, account: 4415, name: 'harbor-freight-co', consultant: 'Cheryl Tong', date: iso(-33), seq: 2, priorCase: true, ppu: 9, signed: 5, hours: 8, elapsed: 33 }),
    // Too recent to have had a full 30 days — drives the "still converting" note.
    freeHour({ id: 8013, account: 4601, name: 'granite-state-tile', consultant: ME_FULL, date: iso(-6), elapsed: 6 }),
    freeHour({ id: 8014, account: 4622, name: 'oakfield-dental', consultant: 'Vinesh Gobin', date: iso(-3), ppu: 1, signed: 1, hours: 2, elapsed: 3 }),
  ]);

  return { SNAPSHOTS, ACCOUNTS, SESSIONS, CASES, HANDOFFS, ACTIVITIES, OPPORTUNITY_FIT, FREE_HOURS, AGREEMENTS, UTILIZATION };
}

let cache = null;

/**
 * The fixture tables, built once on first use. Relative dates are resolved at
 * that moment, so "today" always means today rather than whenever the module
 * happened to be imported.
 */
export function fixtures() {
  if (!cache) cache = build();
  return cache;
}
