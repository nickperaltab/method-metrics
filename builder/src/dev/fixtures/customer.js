// Synthetic fixtures for the customer page's BigQuery sources: Zoom calls and
// transcripts, AI call summaries, extracted call signals, scored call audits, and
// call-prep brief content.
//
// THIS FILE MUST STAY FAKE — same rule as the other fixtures. Public repo, and
// this is the one place where the real data is customer conversation transcripts
// and scored consultant performance. Never paste a real row in here.
//
// Unlike the project tracker, these tables DO exist in BigQuery, so these
// fixtures exist to mirror their shape and their unevenness, not to stand in for
// a missing store. Coverage was verified 2026-08-05 and is deliberately
// reproduced here so the UI gets designed against reality:
//
//   - Most accounts have several calls; a few have none.
//   - Audits exist for only some accounts, and stop mid-July.
//   - call_summaries is a single day's backfill — most calls have no summary.
//   - Signals are sparse and older than the calls they came from.
//   - brief_content exists for a couple of preps and then stops.
//
// Rating strings use the real vocabulary observed in call_audits.ps_call_audit:
// Excellent / Good / Needs Coaching / Unsatisfactory.

import { iso, ME_FULL, ME_SHORT } from './ps.js';

const str = (v) => (v == null ? null : String(v));
const bool = (v) => (v ? 'true' : 'false');
const repeated = (arr) => (arr || []).map((v) => ({ v: String(v) }));
const ts = (day, time = '15:30:00') => `${day}T${time}Z`;

// account_record_id → subdomain-style company_account, matching the accounts in
// fixtures/ps.js. The audit tables key on this string, not on the id.
export const COMPANY_ACCOUNTS = {
  900101: 'northwindtraders',
  900102: 'harborviewdental',
  900103: 'cedarlinemill',
  900104: 'pikepowell',
  900105: 'brightharbor3',
  900106: 'tallgrasslawn',
  900107: 'ridgewayplumb',
  900108: 'vantagesigns',
  900109: 'sunfieldnutri',
  900110: 'lumenfab2',
};

const TRANSCRIPT_BODIES = [
  `Consultant: Thanks for making time. Last week we left off on the approval routing — did you get a chance to try it with a live order?
Customer: We did. Two of the three went through fine. The third one sat waiting because the approver was out.
Consultant: That's the delegate rule. We can set a fallback approver so it doesn't stall.
Customer: That would help. Honestly the bigger thing is the estimate email — my customers keep asking for the PDF attached.
Consultant: Noted. That's a customization; let me scope it and come back with a price.
Customer: How long would that take? We've got a big quote going out at the end of the month.
Consultant: I'll have the scope to you in two days. Build is likely under a week once approved.`,

  `Consultant: Before we get into the screens, how is the team finding the new work order layout?
Customer: The techs like it. The office side is still double-entering into the spreadsheet because they don't trust it yet.
Consultant: That's worth fixing — the double entry is where errors come from. Can we walk through what the spreadsheet does that Method doesn't?
Customer: Mostly the crew assignment view. They want to see the whole week at a glance.
Consultant: That's a calendar view we can build from the same data. Let me show you what's possible today first.`,

  `Consultant: The sync errors from Friday — I cleared those. All three were items created directly in QuickBooks.
Customer: My bookkeeper does that when she's in a hurry. Is that going to keep happening?
Consultant: It will unless we agree a rule: items get created in Method, then sync out. I can show her the error list so she can catch it herself.
Customer: Let's do that. Separately — we're opening a second location in the fall. Will any of this need to change?
Consultant: It might. Multi-location changes how you'd want inventory and orders separated. Worth a proper conversation before you sign a lease.`,

  `Consultant: This is our free consultation, so my goal today is to understand the business and see whether Method is a fit.
Customer: We're a plumbing outfit, six techs, all the scheduling is on a whiteboard and paper tickets.
Consultant: What breaks most often?
Customer: Tickets go missing. We invoice late, sometimes weeks late, and then we chase the money.
Consultant: So the cost is cash flow, not just admin time. Do you know roughly how much is sitting uninvoiced right now?
Customer: Probably twenty thousand.
Consultant: That's the number that matters. Let me show you what a work-order-to-invoice flow looks like.`,

  `Consultant: Quick check-in ahead of the cutover Thursday. Where are we on the driver list?
Customer: Our dispatcher has it, she's cleaning up the phone numbers.
Consultant: As long as it's with me by Wednesday morning we're fine. I'll do the import and validate before we go live.
Customer: What happens if something's wrong after we switch?
Consultant: We keep the old board read-only for two weeks. Nothing gets deleted. If we need to fall back we can.`,

  `Consultant: You asked about the portal — let me be clear about what portal users can and can't see.
Customer: My worry is one customer seeing another customer's pricing.
Consultant: They can't. The portal scopes to the logged-in contact's account. Pricing is per-account.
Customer: Okay. And who approves the spend on this?
Consultant: That's my next question for you.
Customer: My ops lead. She's back Monday. Send me the one-pager and I'll walk her through it.`,
];

const SUMMARY_BODIES = [
  'Follow-up on approval routing. Two of three test orders passed; the third stalled on an absent approver — fallback approver rule proposed. Customer raised the estimate-approval PDF attachment again and asked for scope and price. Deadline pressure: a large quote goes out end of month.',
  'Work order layout is landing with field techs but the office is still double-entering into a spreadsheet for the weekly crew view. Agreed to look at a calendar view built off the same data before building anything new.',
  'Cleared three sync errors caused by items created directly in QuickBooks. Agreed a process rule and to train the bookkeeper on the sync error list. Customer disclosed a second location opening in the fall — flagged as a scoping conversation before they commit to a lease.',
  'Free consultation with a six-tech plumbing business. Whiteboard scheduling, paper tickets, roughly $20k sitting uninvoiced. Cash flow, not admin time, is the cost. Demonstrated work-order-to-invoice flow.',
];

function conversation(o) {
  return {
    conversation_id: str(o.id),
    source: 'zoom',
    occurred_at: ts(o.date, o.time ?? '15:30:00'),
    call_type: o.callType,
    link_status: 'matched',
    account_id: str(o.accountId),
    company_account: COMPANY_ACCOUNTS[o.accountId],
    topic: str(o.topic),
    participants: str(o.participants),
    // The real call index selects no transcript columns; the mock route strips
    // these two off for that query and keeps them for the lazy transcript query.
    transcript_chars: String(o.transcript.length),
    transcript_excerpt: o.transcript.slice(0, 1200),
  };
}

function summary(o) {
  return {
    activity_record_id: str(o.activityId),
    company_account_record_id: str(o.accountId),
    activity_type: 'Zoom Meeting',
    zoom_meeting_id: str(o.zoomId),
    contact_email: str(o.contactEmail),
    created_date: ts(o.date, '18:04:00'),
    summary_text: o.text,
  };
}

function signal(o) {
  return {
    conversation_id: str(o.conversationId),
    account_id: str(o.accountId),
    call_type: o.callType,
    occurred_at: ts(o.date, '15:30:00'),
    is_impact_relevant: bool(o.relevant ?? true),
    situation: str(o.situation),
    pain: str(o.pain),
    impact: str(o.impact),
    critical_event: str(o.criticalEvent),
    decision: str(o.decision),
    stated_goals: str(o.statedGoals),
    whitespace_signals: str(o.whitespace),
    evidence: str(o.evidence),
    extraction_status: 'ok',
  };
}

// Section pcts are 0–100, matching the real tables. sections_json mirrors the
// TO_JSON_STRING projection in lib/customer.js.
function audit(o) {
  const sections = o.kind === 'FREE'
    ? [
      { label: 'Opening', pct: o.sections[0] },
      { label: 'Discovery', pct: o.sections[1] },
      { label: 'Closing', pct: o.sections[2] },
    ]
    : [
      { label: 'Opening', pct: o.sections[0] },
      { label: 'Scoping', pct: o.sections[1] },
      { label: 'Training', pct: o.sections[2] },
      { label: 'Next steps', pct: o.sections[3] },
    ];
  return {
    _company_account: COMPANY_ACCOUNTS[o.accountId],
    audit_kind: o.kind,
    id: str(o.id),
    audit_date: o.date,
    call_type: o.callType,
    consultant: o.consultant,
    duration_min: str(o.durationMin),
    overall_pct: str(o.overallPct),
    rating: o.rating,
    flagged: bool(o.flagged),
    escalation_risk: bool(o.escalation),
    escalation_evidence: str(o.escalationEvidence ?? null),
    highlights: str(o.highlights),
    insights: str(o.insights),
    context_flags: repeated(o.contextFlags),
    sections_json: JSON.stringify(sections),
    problems_count: str(o.problemsCount ?? null),
    unactioned_count: str(o.unactionedCount ?? null),
    tt_hours_after_call: str(o.ttHoursAfterCall ?? null),
  };
}

function brief(o) {
  return {
    account_record_id: str(o.accountId),
    snapshot_date: o.date,
    scheduled_time: ts(o.date, o.time ?? '14:00:00'),
    top_3: repeated(o.top3),
    why_today: str(o.whyToday),
    business_context: str(o.businessContext),
    contact_name: str(o.contactName),
    contact_email: str(o.contactEmail),
    contact_phone: str(o.contactPhone ?? null),
    website: str(o.website ?? null),
  };
}

function build() {
  let callCounter = 0;
  const nextCallId = () => `conv-${String(++callCounter).padStart(4, '0')}`;

  // Calls per account. Northwind and Pike & Powell are chatty; Vantage Signworks
  // has one free-hour call and nothing since; Cedarline has none at all — the UI
  // must handle a customer with zero call history.
  const CALL_PLAN = [
    { accountId: 900101, offsets: [-2, -16, -30, -47, -61], callType: 'PPU', topic: 'Order-to-cash build review', participants: 'Dana Whitcombe; B. Saltzman' },
    { accountId: 900104, offsets: [-1, -12, -26, -40, -55, -70], callType: 'PPU', topic: 'Contractor portal UAT', participants: 'Marcus Reyes; B. Saltzman' },
    { accountId: 900102, offsets: [-6, -20], callType: 'PPU', topic: 'Multi-location scheduling discovery', participants: 'Priya Nandakumar; B. Saltzman' },
    { accountId: 900109, offsets: [-3, -18, -33], callType: 'PPU', topic: 'Wholesale pricing tiers', participants: 'Ellis Vaughn; S. Zarei' },
    { accountId: 900105, offsets: [-9, -24], callType: 'PPU', topic: 'Dispatch cutover readiness', participants: 'Tomas Berg; B. Saltzman' },
    { accountId: 900107, offsets: [-4, -35], callType: 'FREE', topic: 'Free consultation — plumbing ops', participants: 'Dana Whitcombe; B. Saltzman' },
    { accountId: 900108, offsets: [-11], callType: 'FREE', topic: 'Free consultation — signage shop', participants: 'Marcus Reyes; B. Saltzman' },
    { accountId: 900106, offsets: [-72], callType: 'PPU', topic: 'Recurring service review', participants: 'Ellis Vaughn; B. Saltzman' },
    { accountId: 900110, offsets: [-15, -29], callType: 'PPU', topic: 'Job costing rollup', participants: 'Tomas Berg; V. Gobin' },
    // 900103 (Cedarline) deliberately has no calls.
  ];

  const CONVERSATIONS = CALL_PLAN.flatMap((plan) =>
    plan.offsets.map((offset, i) =>
      conversation({
        id: nextCallId(),
        accountId: plan.accountId,
        date: iso(offset),
        time: ['15:30:00', '13:00:00', '17:15:00'][i % 3],
        callType: plan.callType,
        topic: i === 0 ? plan.topic : `${plan.topic} (session ${plan.offsets.length - i})`,
        participants: plan.participants,
        transcript: TRANSCRIPT_BODIES[(plan.accountId + i) % TRANSCRIPT_BODIES.length],
      })
    )
  );

  // Summaries exist for a handful of calls only — the real table is a one-day
  // backfill, so most calls in the timeline will have no summary attached.
  const SUMMARIES = [
    summary({ activityId: 5501, accountId: 900101, zoomId: '8891234567', contactEmail: 'dana@northwind.example', date: iso(-2), text: SUMMARY_BODIES[0] }),
    summary({ activityId: 5502, accountId: 900104, zoomId: '8891234568', contactEmail: 'marcus@pikepowell.example', date: iso(-1), text: SUMMARY_BODIES[1] }),
    summary({ activityId: 5503, accountId: 900101, zoomId: '8891234569', contactEmail: 'dana@northwind.example', date: iso(-16), text: SUMMARY_BODIES[2] }),
    summary({ activityId: 5504, accountId: 900107, zoomId: '8891234570', contactEmail: 'ops@ridgeway.example', date: iso(-4), text: SUMMARY_BODIES[3] }),
  ];

  // Signals are sparser still, and older than the newest calls.
  const SIGNALS = [
    signal({
      conversationId: 'conv-0002', accountId: 900101, callType: 'PPU', date: iso(-16),
      situation: 'Wholesale distributor, 24 users, running orders and invoicing in Method with QuickBooks sync. Second location planned for the fall.',
      pain: 'Estimate approval emails go out without the PDF, so customers call to ask for it. Approvals stall when the named approver is away.',
      impact: 'Quotes are delayed by a day or two each time, and a large end-of-month quote is at risk.',
      criticalEvent: 'Large quote going out end of month; second location lease decision in the fall.',
      decision: 'Ops lead approves customization spend; owner signs anything over $5k.',
      statedGoals: 'Get quotes out same-day. Stop double-handling approvals.',
      whitespace: 'Multi-location inventory separation; customer portal for order status.',
      evidence: 'Customer: "my customers keep asking for the PDF attached" / "we\'ve got a big quote going out at the end of the month".',
    }),
    signal({
      conversationId: 'conv-0011', accountId: 900104, callType: 'PPU', date: iso(-26),
      situation: 'Building-materials supplier, 47 users, three branches, contractor portal in UAT.',
      pain: 'Branch managers cannot filter open orders to their own branch, so they scan the whole list.',
      impact: 'Roughly an hour a day per branch manager, and orders get missed at the busiest branch.',
      criticalEvent: 'Portal go-live committed to contractors for next month.',
      decision: 'Ops lead owns UAT sign-off.',
      statedGoals: 'Contractors self-serve order status without phoning the branch.',
      whitespace: 'Delivery scheduling; pricing tiers by contractor volume.',
      evidence: 'Customer: "they want to see the whole week at a glance".',
    }),
    signal({
      conversationId: 'conv-0018', accountId: 900109, callType: 'PPU', date: iso(-33),
      situation: 'Supplements maker selling DTC and wholesale, 31 users, portal rollout mid-build.',
      pain: 'Wholesale pricing tiers are maintained in a spreadsheet and re-keyed per order.',
      impact: 'Pricing errors reach invoices; two credits issued last quarter.',
      criticalEvent: 'Wholesale trade show in the autumn — portal was promised for it.',
      decision: 'Founder decides; controller must agree the tier logic.',
      statedGoals: 'One price list, applied automatically per customer tier.',
      whitespace: 'Inventory forecasting; EDI with two large retailers.',
      evidence: 'Customer described re-keying prices "every single order".',
    }),
    signal({
      conversationId: 'conv-0022', accountId: 900107, callType: 'FREE', date: iso(-35),
      situation: 'Plumbing contractor, six techs, whiteboard scheduling and paper tickets.',
      pain: 'Tickets go missing; invoicing runs weeks late.',
      impact: 'About $20k sitting uninvoiced at any time.',
      criticalEvent: null,
      decision: 'Owner decides alone.',
      statedGoals: 'Invoice the same week the work is done.',
      whitespace: 'Tech mobile access; recurring maintenance contracts.',
      evidence: 'Customer: "probably twenty thousand" uninvoiced.',
    }),
  ];

  // Audits: present for five accounts, absent for the rest — and none newer than
  // mid-July, mirroring the real tables having stopped. That absence is what
  // auditCoverageCaveat() has to explain.
  const AUDITS = [
    audit({
      kind: 'PPU', id: 'psa-1001', accountId: 900101, date: iso(-16), callType: 'PPU',
      consultant: ME_FULL, durationMin: 47, overallPct: 78, rating: 'Meets Expectations', flagged: false, escalation: false,
      sections: [85, 62, 90, 75], ttHoursAfterCall: 1.5,
      highlights: 'Strong opening — recapped the previous session and set an agenda in the first two minutes. Training on the invoice screen was hands-on rather than shown.',
      insights: 'Scoping is the weak section: the PDF attachment request was acknowledged but not scoped on the call, and no price or date was committed. That is the item now sitting overdue.',
      contextFlags: ['Customization requested', 'Deadline mentioned'],
    }),
    audit({
      kind: 'PPU', id: 'psa-1002', accountId: 900101, date: iso(-30), callType: 'PPU',
      consultant: ME_FULL, durationMin: 52, overallPct: 71, rating: 'Needs Coaching', flagged: false, escalation: false,
      sections: [80, 55, 82, 68], ttHoursAfterCall: 2,
      highlights: 'Good use of the customer\'s own data in the walkthrough.',
      insights: 'Next steps were agreed verbally but not written into a follow-up. Two items from this call had to be re-established on the following one.',
      contextFlags: ['Repeat topic'],
    }),
    audit({
      kind: 'PPU', id: 'psa-1003', accountId: 900104, date: iso(-12), callType: 'PPU',
      consultant: ME_SHORT, durationMin: 61, overallPct: 91, rating: 'Excellent', flagged: false, escalation: false,
      sections: [95, 88, 92, 89], ttHoursAfterCall: 1,
      highlights: 'Textbook UAT session: script-led, defects captured with steps to reproduce, owner and date on every one.',
      insights: 'Nothing material. Consider recording the approval-routing walkthrough for their internal training.',
      contextFlags: ['UAT'],
    }),
    audit({
      kind: 'PPU', id: 'psa-1004', accountId: 900109, date: iso(-18), callType: 'PPU',
      consultant: 'S. Zarei', durationMin: 38, overallPct: 54, rating: 'Unsatisfactory',
      flagged: true, escalation: true,
      escalationEvidence: 'Customer said "this was supposed to be live before the trade show" and asked twice what they were being billed for. No reset of expectations was offered on the call.',
      sections: [70, 48, 55, 42], ttHoursAfterCall: 0.5,
      highlights: 'Consultant was well prepared on the technical detail of the pricing tiers.',
      insights: 'The call needed a timeline reset and did not get one. The blocking dependency (tier pricing sheet) was mentioned in passing rather than made the single agreed action. Recommend a manager-supported reset call before more build hours.',
      contextFlags: ['Escalation risk', 'Past committed date', 'Blocked dependency'],
    }),
    audit({
      kind: 'FREE', id: 'fha-2001', accountId: 900107, date: iso(-35), callType: 'FREE',
      consultant: ME_SHORT, durationMin: 44, overallPct: 83, rating: 'Meets Expectations', flagged: false, escalation: false,
      sections: [90, 88, 70], problemsCount: 3, unactionedCount: 1,
      highlights: 'Opening script delivered in full. Excellent discovery — quantified the uninvoiced amount, which turned an admin complaint into a cash-flow case.',
      insights: 'Closing was softer: PPU was explained but no next session was booked on the call, and the dedicated option was never mentioned despite six techs and clear growth.',
      contextFlags: ['PPU explained', 'DEP not explained'],
    }),
    // A skipped audit: the routine declined to score the call, so overall_pct is
    // 0. Nothing score-shaped may count it — averaging it in would make Northwind
    // look like it had a catastrophic call.
    audit({
      kind: 'PPU', id: 'psa-1005', accountId: 900101, date: iso(-44), callType: 'PPU',
      consultant: ME_FULL, durationMin: 4, overallPct: 0, rating: 'Skipped',
      flagged: false, escalation: false, sections: [0, 0, 0, 0],
      highlights: null,
      insights: 'Call was under five minutes and rescheduled; not scored.',
      contextFlags: ['Skipped — call too short'],
    }),
    audit({
      kind: 'FREE', id: 'fha-2002', accountId: 900108, date: iso(-11), callType: 'FREE',
      consultant: ME_FULL, durationMin: 29, overallPct: 66, rating: 'Needs Coaching', flagged: true, escalation: false,
      sections: [75, 60, 62], problemsCount: 2, unactionedCount: 2,
      highlights: 'Kept to time and was honest about what Method would not do well.',
      insights: 'Both problems the customer raised were left unactioned — no follow-up booked, no recommendation made. A one-line recommendation at the end would likely have converted this.',
      contextFlags: ['No recommendation made', 'Short call'],
    }),
  ];

  // brief_content for two recent preps only — the real table stopped 2026-07-16,
  // so most preps in the timeline have no agenda attached.
  const BRIEFS = [
    brief({
      accountId: 900101, date: iso(0), time: '14:00:00',
      top3: [
        'Close the estimate-approval PDF scope — it is 3 days overdue',
        'Confirm the phase 2 deferral in writing',
        'Check the reorder-point report mockup landed',
      ],
      whyToday: 'Overdue promised item plus a large quote going out end of month.',
      businessContext: 'Wholesale distributor, 24 users, second location planned for the fall.',
      contactName: 'Dana Whitcombe',
      contactEmail: 'dana@northwind.example',
      contactPhone: '(555) 0142-887',
      // Scheme-less, like every real brief_content row — exercises toWebsiteUrl.
      website: 'northwind.example',
    }),
    brief({
      accountId: 900104, date: iso(0), time: '11:30:00',
      top3: [
        'Walk UAT script 3 (order approvals)',
        'Agree the branch filter scope',
        'Book the branch manager training',
      ],
      whyToday: 'UAT is the critical path to the committed portal go-live.',
      businessContext: 'Building-materials supplier, 47 users, three branches.',
      contactName: 'Marcus Reyes',
      contactEmail: 'marcus@pikepowell.example',
      contactPhone: '(555) 0198-204',
      website: 'https://pikepowell.example',
    }),
  ];

  return { CONVERSATIONS, SUMMARIES, SIGNALS, AUDITS, BRIEFS };
}

let cache = null;

/** The customer-page fixture tables, built once on first use. */
export function customerFixtures() {
  if (!cache) cache = build();
  return cache;
}
