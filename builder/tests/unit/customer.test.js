// Customer page data layer.
//
// These tables are REAL in BigQuery, so the round trip matters twice over: the
// SQL has to be shaped like the live schema (verified 2026-08-05) and the
// normalizers have to survive the REST encoding — repeated STRING columns as
// [{v}], the audit sections as a JSON string, every scalar as text.
//
// The other half of this file is about *uneven coverage*. An account with no
// audits, no signals and no calls is normal, not an error, and the page must be
// able to tell "nothing happened" apart from "we couldn't look it up".

import { describe, it, expect } from 'vitest';
import { routeMockSql } from '../../src/dev/mockBq.js';
import { COMPANY_ACCOUNTS } from '../../src/dev/fixtures/customer.js';
import {
  buildCustomerOverviewSql,
  buildCustomerCallsSql,
  buildCustomerTranscriptsSql,
  buildCustomerSummariesSql,
  buildCustomerSignalsSql,
  buildCustomerAuditsSql,
  buildCustomerPrepsSql,
  buildAccountActivitySql,
  buildAccountEscalationSql,
  normalizeActivityRow,
  normalizeEscalationRow,
  pickLatestActivity,
  latestActivityFrom,
  actorLabel,
  escalationFlags,
  accountFlagSummary,
  normalizeCustomerRow,
  normalizeCallRow,
  normalizeTranscriptRow,
  normalizeSummaryRow,
  normalizeSignalRow,
  normalizeAuditRow,
  normalizePrepRow,
  buildTimeline,
  groupTimelineByDay,
  countByKind,
  summarizeAudits,
  latestSignals,
  daysSinceLastCall,
  auditCoverageCaveat,
  TIMELINE_KINDS,
} from '../../src/lib/customer.js';
import {
  buildAccountProjectsSql,
  buildAccountWorkLogSql,
  buildAccountProjectEventsSql,
  normalizeProjectRow,
  normalizeWorkEntryRow,
  normalizeEventRow,
  localToday,
} from '../../src/lib/projects.js';
import { buildAccountSessionsSql, buildAccountCasesSql, normalizeSessionRow, normalizeCaseRow } from '../../src/lib/callPrep.js';

const TODAY = localToday();
const NORTHWIND = 900101;   // calls, audits, signals, projects, a prep with a brief
const CEDARLINE = 900103;   // no calls, no audits, no signals — the sparse case
const SUNFIELD = 900109;    // the escalation-risk audit

const rowsFor = (sql) => routeMockSql(sql).rows;
const routeFor = (sql) => routeMockSql(sql).route;

const customerOf = (id) => normalizeCustomerRow(rowsFor(buildCustomerOverviewSql(id))[0]);
const callsOf = (id) => rowsFor(buildCustomerCallsSql(id)).map(normalizeCallRow);
const auditsOf = (id) => rowsFor(buildCustomerAuditsSql(COMPANY_ACCOUNTS[id])).map(normalizeAuditRow);
const signalsOf = (id) => rowsFor(buildCustomerSignalsSql(id)).map(normalizeSignalRow);
const prepsOf = (id) => rowsFor(buildCustomerPrepsSql(id)).map(normalizePrepRow);

describe('routing', () => {
  it('sends each customer query to its own handler', () => {
    // Every one of these names a table that a broader, earlier-written route
    // also matches, so route order is load-bearing.
    expect(routeFor(buildCustomerOverviewSql(NORTHWIND))).toMatch(/^customer overview/);
    expect(routeFor(buildCustomerPrepsSql(NORTHWIND))).toMatch(/^call preps/);
    expect(routeFor(buildCustomerCallsSql(NORTHWIND))).toMatch(/^calls/);
    expect(routeFor(buildCustomerSummariesSql(NORTHWIND))).toMatch(/^call summaries/);
    expect(routeFor(buildCustomerSignalsSql(NORTHWIND))).toMatch(/^call signals/);
    expect(routeFor(buildCustomerAuditsSql('northwindtraders'))).toMatch(/^call audits/);
  });

  it('scopes the account-wide project queries by account', () => {
    const projects = rowsFor(buildAccountProjectsSql(NORTHWIND)).map(normalizeProjectRow);
    expect(projects.length).toBeGreaterThan(0);
    for (const p of projects) expect(p.accountRecordId).toBe(NORTHWIND);

    const work = rowsFor(buildAccountWorkLogSql(NORTHWIND)).map(normalizeWorkEntryRow);
    expect(work.length).toBeGreaterThan(0);
    for (const w of work) expect(w.accountRecordId).toBe(NORTHWIND);

    const events = rowsFor(buildAccountProjectEventsSql(NORTHWIND)).map(normalizeEventRow);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.accountRecordId).toBe(NORTHWIND);
  });
});

describe('customer overview', () => {
  const customer = customerOf(NORTHWIND);

  it('resolves the subdomain the audit tables key on', () => {
    expect(customer.companyAccount).toBe('northwindtraders');
  });

  it('types the operational fields', () => {
    expect(customer.accountRecordId).toBe(NORTHWIND);
    expect(typeof customer.mrrRunRate).toBe('number');
    expect(typeof customer.isActive).toBe('boolean');
    expect(customer.signupDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('nulls out non-positive licence counts', () => {
    // int_accounts documents negatives from credits — a churned fixture account
    // has 0 licences, which must not reach the UI as a real number.
    expect(customerOf(900106).userLicenses).toBeNull();
  });

  it('flags a churned account with its cancellation date', () => {
    const churned = customerOf(900106);
    expect(churned.isActive).toBe(false);
    expect(churned.cancellationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns nothing for an unknown account rather than throwing', () => {
    expect(rowsFor(buildCustomerOverviewSql(999999))).toHaveLength(0);
  });
});

describe('calls', () => {
  const calls = callsOf(NORTHWIND);

  it('returns calls newest first', () => {
    expect(calls.length).toBeGreaterThan(1);
    const dates = calls.map((c) => c.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const call of calls) {
      expect(call.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(call.conversationId).toBeTruthy();
    }
  });

  it('selects no transcript column at all', () => {
    // This is a cost guard, not a style preference. conversations is 291 MB of
    // transcript text with no partitioning or clustering, so touching
    // transcript_text scans the whole table on every page load.
    const sql = buildCustomerCallsSql(NORTHWIND);
    expect(sql).not.toMatch(/transcript/);
    const [row] = rowsFor(sql);
    expect(row).not.toHaveProperty('transcript_text');
    expect(row).not.toHaveProperty('transcript_excerpt');
    expect(row).not.toHaveProperty('transcript_chars');
  });

  it('respects the row cap', () => {
    expect(rowsFor(buildCustomerCallsSql(NORTHWIND, { limit: 2 }))).toHaveLength(2);
  });

  it('returns nothing for a customer that has never been on a call', () => {
    expect(callsOf(CEDARLINE)).toEqual([]);
    expect(daysSinceLastCall([], TODAY)).toBeNull();
  });

  it('measures days since the most recent call', () => {
    expect(daysSinceLastCall(calls, TODAY)).toBe(2);
  });
});

describe('transcripts (lazy)', () => {
  const sql = buildCustomerTranscriptsSql(NORTHWIND);

  it('routes to its own handler, not the call index', () => {
    expect(routeFor(sql)).toMatch(/^call transcripts/);
    expect(routeFor(buildCustomerCallsSql(NORTHWIND))).toMatch(/^calls/);
  });

  it('returns excerpts keyed by conversation id, capped in length', () => {
    const rows = rowsFor(sql).map(normalizeTranscriptRow);
    expect(rows.length).toBe(callsOf(NORTHWIND).length);
    const ids = new Set(callsOf(NORTHWIND).map((c) => c.conversationId));
    for (const row of rows) {
      expect(ids.has(row.conversationId)).toBe(true);
      expect(row.transcriptChars).toBeGreaterThan(0);
      expect(row.transcriptExcerpt.length).toBeLessThanOrEqual(1200);
    }
  });

  it('fetches every call on the account in one query', () => {
    // The scan cost is the same for one row or all of them, so paying it once
    // per account beats paying it per expanded call.
    expect(sql).toMatch(/account_id = \d+/);
    expect(sql).not.toMatch(/conversation_id = /);
  });
});

describe('audits', () => {
  const audits = auditsOf(NORTHWIND);

  it('parses the sections out of the JSON projection', () => {
    // A repeated STRUCT does not survive bigquery.js's one-level {v} unwrap,
    // which is why the SQL ships TO_JSON_STRING instead.
    const [latest] = audits;
    expect(latest.sections.map((x) => x.label)).toEqual(['Opening', 'Scoping', 'Training', 'Next steps']);
    for (const section of latest.sections) expect(typeof section.pct).toBe('number');
  });

  it('unwraps repeated STRING context flags', () => {
    const withFlags = audits.find((a) => a.contextFlags.length);
    expect(withFlags).toBeDefined();
    for (const flag of withFlags.contextFlags) expect(typeof flag).toBe('string');
  });

  it('normalizes both rubrics through one path', () => {
    const free = auditsOf(900107);
    expect(free[0].kind).toBe('FREE');
    expect(free[0].sections.map((x) => x.label)).toEqual(['Opening', 'Discovery', 'Closing']);
    expect(free[0].problemsCount).toBeGreaterThan(0);
    // PPU-only column comes back null on a free-hour row rather than undefined.
    expect(free[0].ttHoursAfterCall).toBeNull();
  });

  it('only returns audits for the requested subdomain', () => {
    for (const audit of audits) expect(audit.auditId.startsWith('psa-')).toBe(true);
    expect(auditsOf(CEDARLINE)).toEqual([]);
  });

  it('leaves a skipped audit out of every score-shaped number', () => {
    const summary = summarizeAudits(audits);
    expect(summary.count).toBe(3);       // it still exists and shows in the timeline
    expect(summary.scoredCount).toBe(2); // but nothing scores it
    expect(summary.skippedCount).toBe(1);
    // Its zeroed sections must not drag the section averages down either.
    expect(summary.sections.find((x) => x.label === 'Opening').averagePct)
      .toBeCloseTo((85 + 80) / 2, 5);
  });

  it('summarizes score, trend and the weakest section', () => {
    const summary = summarizeAudits(audits);
    expect(summary.count).toBe(audits.length);
    expect(summary.averagePct).toBeCloseTo((78 + 71) / 2, 5);
    expect(summary.latest.overallPct).toBe(78);
    expect(summary.delta).toBe(7); // 78 vs 71 on the previous call
    // Sections sort worst-first so the panel leads with the thing to fix.
    expect(summary.sections[0].label).toBe('Scoping');
    expect(summary.sections[0].averagePct).toBeCloseTo((62 + 55) / 2, 5);
  });

  it('surfaces escalation risk', () => {
    const summary = summarizeAudits(auditsOf(SUNFIELD));
    expect(summary.flagged).toBe(1);
    expect(summary.escalations).toHaveLength(1);
    expect(summary.escalations[0].escalationEvidence).toMatch(/trade show/);
  });

  it('returns null rather than zeroes when there are no audits', () => {
    expect(summarizeAudits([])).toBeNull();
  });

  it('explains an absence instead of implying a clean record', () => {
    // The audit tables key on a name string, so "no rows" is genuinely ambiguous
    // — saying so is what keeps the screen honest.
    const caveat = auditCoverageCaveat(customerOf(CEDARLINE), []);
    expect(caveat).toMatch(/cedarlinemill/);
    expect(caveat).toMatch(/display name/);
    expect(auditCoverageCaveat(customerOf(NORTHWIND), auditsOf(NORTHWIND))).toBeNull();
    expect(auditCoverageCaveat({ companyAccount: null }, [])).toMatch(/no subdomain/);
  });
});

describe('signals', () => {
  it('takes the latest non-empty value per field, not the latest row', () => {
    const signals = signalsOf(NORTHWIND);
    expect(signals.length).toBeGreaterThan(0);
    const latest = latestSignals(signals);
    expect(latest.pain.value).toMatch(/PDF/);
    expect(latest.pain.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(latest.statedGoals.value).toBeTruthy();
  });

  it('leaves a field null when no call ever mentioned it', () => {
    // The free-hour fixture has no critical event — a made-up one would be worse
    // than an empty card.
    const latest = latestSignals(signalsOf(900107));
    expect(latest.criticalEvent).toBeNull();
    expect(latest.pain.value).toMatch(/Tickets go missing/);
  });

  it('returns all-null for a customer with no extracted signals', () => {
    const latest = latestSignals(signalsOf(CEDARLINE));
    expect(Object.values(latest).every((v) => v === null)).toBe(true);
  });
});

describe('preps', () => {
  it('joins brief content when it exists and leaves it empty when it does not', () => {
    const preps = prepsOf(NORTHWIND);
    expect(preps.length).toBeGreaterThan(1);
    const withBrief = preps.find((p) => p.top3.length);
    expect(withBrief.top3.length).toBe(3);
    expect(withBrief.whyToday).toBeTruthy();
    expect(withBrief.scheduledTime).toBeTruthy();
    // brief_content stopped 2026-07-16 upstream, so most preps have none.
    const withoutBrief = preps.find((p) => !p.top3.length);
    expect(withoutBrief).toBeDefined();
    expect(withoutBrief.whyToday).toBeNull();
    expect(withoutBrief.scheduledTime).toBeNull();
  });

  it('still carries the snapshot fields the timeline shows', () => {
    const [prep] = prepsOf(NORTHWIND);
    expect(prep.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof prep.depEnrolled).toBe('boolean');
    expect(Number.isInteger(prep.casesOpenCount)).toBe(true);
  });
});

describe('summaries', () => {
  it('keys on company_account_record_id, not account_id', () => {
    const summaries = rowsFor(buildCustomerSummariesSql(NORTHWIND)).map(normalizeSummaryRow);
    expect(summaries.length).toBeGreaterThan(0);
    for (const summary of summaries) {
      expect(summary.accountRecordId).toBe(NORTHWIND);
      expect(summary.summaryText.length).toBeGreaterThan(20);
    }
  });
});

describe('batched account indicators', () => {
  const ids = [NORTHWIND, CEDARLINE, SUNFIELD, 900106];

  it('routes each batched query ahead of the single-table routes', () => {
    // Both union across five tables, so a table-name match would send them to the
    // wrong handler.
    expect(routeFor(buildAccountActivitySql(ids))).toMatch(/^account activity/);
    expect(routeFor(buildAccountEscalationSql(ids))).toMatch(/^account escalations/);
  });

  it('requires at least one account rather than building an empty IN ()', () => {
    expect(() => buildAccountActivitySql([])).toThrow();
    expect(() => buildAccountEscalationSql([])).toThrow();
    expect(() => buildAccountActivitySql(['drop table'])).toThrow();
  });

  it('deduplicates the id list', () => {
    const sql = buildAccountActivitySql([NORTHWIND, NORTHWIND, CEDARLINE]);
    expect(sql.match(/IN \(([\d,\s]+)\)/)[1].split(',')).toHaveLength(2);
  });

  it('returns the newest activity per account with an actor where one exists', () => {
    const rows = rowsFor(buildAccountActivitySql(ids)).map(normalizeActivityRow);
    const latest = pickLatestActivity(rows);
    const northwind = latest.get(NORTHWIND);
    expect(northwind.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(northwind.source).toBeTruthy();
    // Every account in the list has something on record in the fixtures.
    for (const id of ids) expect(latest.has(id)).toBe(true);
  });

  it('never treats an audit as activity', () => {
    // An audit is our review of a call, not a touch on the account — counting one
    // would make a silent account look alive.
    const rows = rowsFor(buildAccountActivitySql(ids)).map(normalizeActivityRow);
    expect(rows.every((r) => r.source !== 'audit')).toBe(true);
    expect(buildAccountActivitySql(ids)).not.toMatch(/ps_call_audit|free_hour_audit/);
  });

  it('agrees with the single-customer path', () => {
    // The list and the page must not disagree about when the account was last
    // touched, so both run the same rules over the same sources.
    const batched = pickLatestActivity(
      rowsFor(buildAccountActivitySql([NORTHWIND])).map(normalizeActivityRow)
    ).get(NORTHWIND);
    const single = latestActivityFrom({
      workLog: rowsFor(buildAccountWorkLogSql(NORTHWIND)).map(normalizeWorkEntryRow),
      projectEvents: rowsFor(buildAccountProjectEventsSql(NORTHWIND)).map(normalizeEventRow),
      sessions: rowsFor(buildAccountSessionsSql(NORTHWIND)).map(normalizeSessionRow),
      calls: callsOf(NORTHWIND),
      preps: prepsOf(NORTHWIND),
    });
    expect(single.date).toBe(batched.date);
    expect(single.source).toBe(batched.source);
  });

  it('prefers a named source over an unnamed one on the same day', () => {
    const rows = [
      { accountRecordId: 1, date: '2026-08-01', actor: null, actorId: 4021, source: 'billed session' },
      { accountRecordId: 1, date: '2026-08-01', actor: 'B. Saltzman', actorId: null, source: 'work log' },
    ];
    expect(pickLatestActivity(rows).get(1).actor).toBe('B. Saltzman');
  });

  it('skips undated rows', () => {
    expect(pickLatestActivity([{ accountRecordId: 1, date: null, source: 'call' }]).size).toBe(0);
  });

  it('labels an unresolvable actor id honestly', () => {
    // TimeTracking only carries AssignedToRecordID and revenue has no staff table
    // to resolve it, so this must not silently render as a blank.
    expect(actorLabel({ actor: null, actorId: 4021 })).toBe('consultant #4021');
    expect(actorLabel({ actor: 'S. Zarei', actorId: 9 })).toBe('S. Zarei');
    expect(actorLabel({ actor: null, actorId: null })).toBeNull();
    expect(actorLabel(null)).toBeNull();
  });

  it('aggregates audit escalations per account, keyed back to the record id', () => {
    const rows = rowsFor(buildAccountEscalationSql(ids)).map(normalizeEscalationRow);
    const byId = new Map(rows.map((r) => [r.accountRecordId, r]));
    const sunfield = byId.get(SUNFIELD);
    expect(sunfield.escalationCount).toBe(1);
    expect(sunfield.flaggedCount).toBe(1);
    expect(sunfield.lastEscalationDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sunfield.worstPct).toBe(54);
    // Northwind has audits but no escalation; Cedarline has no audits at all.
    expect(byId.get(NORTHWIND).escalationCount).toBe(0);
    expect(byId.get(NORTHWIND).auditCount).toBe(3);
    expect(byId.has(CEDARLINE)).toBe(false);
  });

  it('excludes a skipped audit from the scored counts and the worst score', () => {
    // A skipped audit carries overall_pct = 0. Counting it would make Northwind's
    // worst call look like a 0% and understate its average.
    const rows = rowsFor(buildAccountEscalationSql([NORTHWIND])).map(normalizeEscalationRow);
    const [northwind] = rows;
    expect(northwind.auditCount).toBe(3);
    expect(northwind.scoredCount).toBe(2);
    expect(northwind.worstPct).toBe(71);
  });
});

describe('escalation flags', () => {
  const base = {
    customer: { isActive: true },
    audits: [],
    projects: [],
    preps: [],
    cases: [],
    lastActivity: { date: TODAY, actor: 'B. Saltzman', source: 'work log' },
    todayIso: TODAY,
  };
  const codes = (input) => escalationFlags({ ...base, ...input }).map((f) => f.code);

  it('is empty for a healthy, recently-touched account', () => {
    expect(escalationFlags(base)).toEqual([]);
  });

  it('raises an audit escalation as critical, with its evidence', () => {
    const [flagged] = escalationFlags({
      ...base,
      audits: [{ escalationRisk: true, flagged: true, date: '2026-07-18', escalationEvidence: 'said it was late', kind: 'PPU', consultant: 'S. Zarei' }],
    });
    expect(flagged.code).toBe('audit-escalation');
    expect(flagged.severity).toBe('critical');
    expect(flagged.detail).toBe('said it was late');
    expect(flagged.source).toMatch(/PPU audit · S. Zarei/);
  });

  it('does not double-count an escalation as a plain flagged call', () => {
    expect(codes({
      audits: [{ escalationRisk: true, flagged: true, date: '2026-07-18' }],
    })).toEqual(['audit-escalation']);
  });

  it('raises blocked projects, past targets and overdue items', () => {
    const result = codes({
      projects: [
        { status: 'Blocked', projectName: 'A', promisedItems: 1, overdueItems: 2, lastActivityDate: TODAY, targetDate: '2020-01-01' },
      ],
    });
    expect(result).toContain('project-blocked');
    expect(result).toContain('past-target');
    expect(result).toContain('overdue-items');
  });

  it('ignores a past target on a completed project', () => {
    expect(codes({
      projects: [{ status: 'Complete', projectName: 'A', promisedItems: 0, overdueItems: 0, targetDate: '2020-01-01' }],
    })).toEqual([]);
  });

  it('does not treat a low score alone as an escalation', () => {
    // A single 55% is a coaching signal on the consultant, not an account
    // escalation — only the audit's own escalation flag promotes it.
    expect(codes({
      audits: [{ escalationRisk: false, flagged: false, overallPct: 55, date: '2026-07-01' }],
    })).toEqual([]);
  });

  it('escalates a quiet account to stalled as it ages', () => {
    const daysAgo = (n) => new Date(Date.parse(TODAY) - n * 86400000).toISOString().slice(0, 10);
    expect(codes({ lastActivity: { date: daysAgo(10), source: 'call' } })).toEqual([]);
    expect(codes({ lastActivity: { date: daysAgo(35), source: 'call' } })).toContain('quiet');
    expect(codes({ lastActivity: { date: daysAgo(80), source: 'call' } })).toContain('stalled');
  });

  it('flags an account with nothing on record at all', () => {
    expect(codes({ lastActivity: null })).toContain('no-activity');
  });

  it('reports open cases and churn as information, not alarm', () => {
    const flags = escalationFlags({
      ...base,
      cases: [{ isOpen: true }, { isOpen: false }],
      customer: { isActive: false, cancellationDate: '2026-05-01' },
    });
    expect(flags.every((f) => f.severity === 'info')).toBe(true);
    // Within a severity, a dated flag sorts ahead of an undated one — churn has a
    // cancellation date, an open-case count doesn't.
    expect(flags.map((f) => f.code)).toEqual(['churned', 'open-cases']);
  });

  it('ranks critical first, then by recency', () => {
    const flags = escalationFlags({
      ...base,
      cases: [{ isOpen: true }],
      audits: [
        { escalationRisk: true, date: '2026-06-01' },
        { escalationRisk: true, date: '2026-07-20' },
      ],
      projects: [{ status: 'On track', projectName: 'A', promisedItems: 0, overdueItems: 3 }],
    });
    expect(flags.map((f) => f.severity)).toEqual(['critical', 'critical', 'warn', 'info']);
    expect(flags[0].date).toBe('2026-07-20');
  });
});

describe('account flag summary (list view)', () => {
  const todayIso = TODAY;

  it('does not badge a single flagged call — 38% of audited calls are flagged', () => {
    const flags = accountFlagSummary({
      rollup: { atRisk: 0, overdueItems: 0 },
      activity: { date: TODAY },
      escalation: { escalationCount: 0, flaggedCount: 1, lastAuditDate: '2026-07-18' },
      todayIso,
    });
    expect(flags).toEqual([]);
  });

  it('badges a pattern of flagged calls', () => {
    const flags = accountFlagSummary({
      rollup: { atRisk: 0, overdueItems: 0 },
      activity: { date: TODAY },
      escalation: { escalationCount: 0, flaggedCount: 2, lastAuditDate: '2026-07-18' },
      todayIso,
    });
    expect(flags.map((f) => f.code)).toEqual(['audit-flagged']);
  });

  it('summarizes the batched inputs into compact chips', () => {
    const flags = accountFlagSummary({
      rollup: { atRisk: 1, overdueItems: 4 },
      activity: { date: TODAY },
      escalation: { escalationCount: 2, flaggedCount: 3, lastEscalationDate: '2026-07-18', lastAuditDate: '2026-07-18' },
      todayIso,
    });
    // Criticals first; then the dated warn (flagged calls) ahead of the undated
    // overdue-item count.
    expect(flags.map((f) => f.code)).toEqual(['audit-escalation', 'at-risk', 'audit-flagged', 'overdue-items']);
    expect(flags[0].severity).toBe('critical');
  });

  it('is empty for a clean account', () => {
    expect(accountFlagSummary({
      rollup: { atRisk: 0, overdueItems: 0 },
      activity: { date: TODAY },
      escalation: null,
      todayIso,
    })).toEqual([]);
  });

  it('flags silence when the account has no activity row', () => {
    expect(accountFlagSummary({ rollup: { atRisk: 0, overdueItems: 0 }, activity: null, escalation: null, todayIso })
      .map((f) => f.code)).toEqual(['no-activity']);
  });
});

describe('timeline', () => {
  const bundle = () => ({
    customer: customerOf(NORTHWIND),
    calls: callsOf(NORTHWIND),
    summaries: rowsFor(buildCustomerSummariesSql(NORTHWIND)).map(normalizeSummaryRow),
    preps: prepsOf(NORTHWIND),
    audits: auditsOf(NORTHWIND),
    sessions: rowsFor(buildAccountSessionsSql(NORTHWIND)).map(normalizeSessionRow),
    cases: rowsFor(buildAccountCasesSql(NORTHWIND)).map(normalizeCaseRow),
    workLog: rowsFor(buildAccountWorkLogSql(NORTHWIND)).map(normalizeWorkEntryRow),
    projectEvents: rowsFor(buildAccountProjectEventsSql(NORTHWIND)).map(normalizeEventRow),
  });

  it('merges every source into one reverse-chronological stream', () => {
    const timeline = buildTimeline(bundle());
    expect(timeline.length).toBeGreaterThan(15);
    const dates = timeline.map((t) => t.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('includes all seven kinds for a busy account', () => {
    const counts = countByKind(buildTimeline(bundle()));
    for (const kind of TIMELINE_KINDS) {
      expect(counts[kind], `expected at least one ${kind}`).toBeGreaterThan(0);
    }
  });

  it('attaches a same-day summary to its call', () => {
    const timeline = buildTimeline(bundle());
    const withSummary = timeline.filter((t) => t.kind === 'call' && t.summary);
    expect(withSummary.length).toBeGreaterThan(0);
    for (const item of withSummary) expect(item.summary.date).toBe(item.date);
  });

  it('does not deduplicate a call against the session billed for it', () => {
    // Same hour of work, two systems: the call carries the transcript, the
    // session carries the billing decision and the consultant's write-up.
    const timeline = buildTimeline({
      calls: [{ date: '2026-07-01', callType: 'PPU', topic: 'X', conversationId: 'c1' }],
      sessions: [{ date: '2026-07-01', supportType: 'Consulting', durationHours: 1, billable: 'Billable' }],
    });
    expect(timeline).toHaveLength(2);
    expect(timeline.map((t) => t.kind).sort()).toEqual(['call', 'session']);
  });

  it('drops undated rows rather than floating them to the top', () => {
    const timeline = buildTimeline({
      calls: [{ date: null, callType: 'PPU', conversationId: 'c9' }],
      cases: [{ createdDate: null, subject: 'no date' }],
      workLog: [{ workDate: '2026-07-02', summary: 'real', hours: 1 }],
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0].kind).toBe('work');
  });

  it('groups by day, newest day first', () => {
    const days = groupTimelineByDay(buildTimeline(bundle()));
    const dates = days.map((d) => d.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
    expect(days.reduce((sum, d) => sum + d.items.length, 0)).toBe(buildTimeline(bundle()).length);
  });

  it('is empty, not broken, for a customer with nothing on record', () => {
    const timeline = buildTimeline({});
    expect(timeline).toEqual([]);
    expect(groupTimelineByDay(timeline)).toEqual([]);
    const counts = countByKind(timeline);
    for (const kind of TIMELINE_KINDS) expect(counts[kind]).toBe(0);
  });

  it('handles the sparse customer without inventing entries', () => {
    const timeline = buildTimeline({
      calls: callsOf(CEDARLINE),
      audits: auditsOf(CEDARLINE),
      signals: signalsOf(CEDARLINE),
      preps: prepsOf(CEDARLINE),
      projectEvents: rowsFor(buildAccountProjectEventsSql(CEDARLINE)).map(normalizeEventRow),
    });
    const counts = countByKind(timeline);
    expect(counts.call).toBe(0);
    expect(counts.audit).toBe(0);
    // It does have preps and project history, so the page is not blank.
    expect(counts.prep + counts.project).toBeGreaterThan(0);
  });
});
