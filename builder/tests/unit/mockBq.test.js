// Guards the offline UI-dev fixtures (src/dev/) against drift.
//
// The point of these tests is the round trip: feed the *real* SQL builders to
// the mock router, then push what comes back through the *real* normalizers. A
// renamed BQ column or a fixture typo breaks here instead of showing up as a
// silently blank panel two weeks later.

import { describe, it, expect } from 'vitest';
import { routeMockSql } from '../../src/dev/mockBq.js';
import { ME_FULL, ME_SHORT } from '../../src/dev/fixtures/ps.js';
import {
  buildFreeHoursSql,
  buildAgreementsSentSql,
  normalizeFreeHourRow,
  normalizeAgreementRow,
  summarize,
  bySequence,
  byConsultant,
  countAgreementsToOwnFreeHourAccounts,
} from '../../src/lib/freeHours.js';
import {
  buildConsultantsSql,
  buildBookSql,
  buildAccountSnapshotsSql,
  buildAccountSessionsSql,
  buildAccountCasesSql,
  buildAccountOverviewSql,
  buildAccountOpportunityFitSql,
  buildAccountActivitiesSql,
  normalizeOpportunityFitRow,
  normalizeActivityRow,
  latestFitByMotion,
  MOTION_ORDER,
  normalizeSnapshotRow,
  normalizeSessionRow,
  normalizeCaseRow,
  normalizeAccountOverview,
} from '../../src/lib/callPrep.js';
import {
  buildMyTodaySql,
  buildMyBoardSql,
  buildMyHandoffsSql,
  localIsoDate,
  normalizeBoardRow,
  summarizeBoard,
} from '../../src/lib/psOverview.js';
import {
  buildHandoffsSql,
  buildAccountHandoffsSql,
  normalizeHandoffRow,
} from '../../src/lib/handoffs.js';

const EMAIL = 'b.saltzman@method.me';
const TODAY = localIsoDate();
const NORTHWIND = 900101;

const rowsFor = (sql) => routeMockSql(sql).rows;
const routeFor = (sql) => routeMockSql(sql).route;

describe('mock router — consultants', () => {
  const rows = rowsFor(buildConsultantsSql());

  it('aggregates every consultant in the fixtures', () => {
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.map((r) => r.consultant)).toContain(ME_FULL);
    expect(rows.map((r) => r.consultant)).toContain(ME_SHORT);
  });

  it('returns counts as strings, the way the BQ REST API does', () => {
    for (const row of rows) {
      expect(typeof row.account_count).toBe('string');
      expect(Number(row.account_count)).toBeGreaterThan(0);
      expect(row.last_snapshot_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('mock router — /ps Today panel', () => {
  const rows = rowsFor(buildMyTodaySql(EMAIL, TODAY));

  it('is never empty, so the panel always has something to design against', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it('returns only today, and only this consultant under either name spelling', () => {
    const names = new Set(rows.map((r) => r.consultant));
    for (const row of rows) expect(row.snapshot_date).toBe(TODAY);
    for (const name of names) expect([ME_FULL, ME_SHORT]).toContain(name);
  });

  it('survives normalizeSnapshotRow with typed values', () => {
    const snap = normalizeSnapshotRow(rows[0]);
    expect(Number.isInteger(snap.accountRecordId)).toBe(true);
    expect(typeof snap.accountName).toBe('string');
    expect(typeof snap.depEnrolled).toBe('boolean');
    expect(Array.isArray(snap.depSignals)).toBe(true);
  });
});

describe('mock router — /ps board', () => {
  const sql = buildMyBoardSql(EMAIL);
  const rows = rowsFor(sql);

  it('takes the board route, not the plain-snapshots route', () => {
    expect(routeFor(sql)).toMatch(/^board/);
  });

  it('returns one row per account (latest snapshot only)', () => {
    const ids = rows.map((r) => r.account_record_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows.length).toBeGreaterThanOrEqual(5);
  });

  it('merges the int_accounts columns the LEFT JOIN asks for', () => {
    for (const row of rows) {
      expect(row).toHaveProperty('mrr_run_rate');
      expect(row).toHaveProperty('user_licenses');
      expect(row).toHaveProperty('health_score');
      expect(row).toHaveProperty('is_active');
      expect(row).toHaveProperty('saas_pay_type');
    }
  });

  it('normalizes into board rows with an overview and computed flags', () => {
    const board = rows.map((r) => normalizeBoardRow(r, TODAY));
    for (const entry of board) {
      expect(entry.overview).not.toBeNull();
      expect(Array.isArray(entry.flags)).toBe(true);
    }
    // The fixtures deliberately include a failing sync, open cases and a cold
    // account, so every attention state has a row to render.
    const flags = new Set(board.flatMap((b) => b.flags));
    expect(flags).toContain('sync failing');
    expect(flags).toContain('open cases');
    expect(flags).toContain('no recent sessions');
  });

  it('produces a non-zero stat row', () => {
    const stats = summarizeBoard(rows.map((r) => normalizeBoardRow(r, TODAY)));
    expect(stats.accounts).toBeGreaterThan(0);
    expect(stats.activeMrr).toBeGreaterThan(0);
    expect(stats.licenses).toBeGreaterThan(0);
    expect(stats.needsAttention).toBeGreaterThan(0);
  });

  it('excludes a churned account from active MRR', () => {
    const board = rows.map((r) => normalizeBoardRow(r, TODAY));
    expect(board.some((b) => b.overview?.isActive === false)).toBe(true);
  });
});

describe('mock router — call-prep book and account detail', () => {
  it('returns one row per account for a named consultant', () => {
    const rows = rowsFor(buildBookSql(ME_FULL));
    expect(rows.length).toBeGreaterThan(0);
    const ids = rows.map((r) => r.account_record_id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of rows) expect(row.consultant).toBe(ME_FULL);
  });

  it('returns full snapshot history for one account, newest first', () => {
    const rows = rowsFor(buildAccountSnapshotsSql(NORTHWIND));
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) expect(Number(row.account_record_id)).toBe(NORTHWIND);
    const dates = rows.map((r) => r.snapshot_date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('returns sessions in date order without the fixture join key', () => {
    const rows = rowsFor(buildAccountSessionsSql(NORTHWIND));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).not.toHaveProperty('_account');
    const dates = rows.map((r) => r.TxnDate);
    expect([...dates].sort()).toEqual(dates);
    const session = normalizeSessionRow(rows[0]);
    expect(typeof session.durationHours).toBe('number');
    expect(typeof session.notes).toBe('string');
  });

  it('returns every assessed motion for an account', () => {
    const fit = rowsFor(buildAccountOpportunityFitSql(NORTHWIND)).map(normalizeOpportunityFitRow);
    expect(fit.length).toBeGreaterThan(0);
    expect(new Set(fit.map((f) => f.motion))).toEqual(new Set(MOTION_ORDER));
    expect(fit.some((f) => f.signals.length > 0)).toBe(true);
    expect(fit.some((f) => f.caveats)).toBe(true);
    const ordered = latestFitByMotion(fit, TODAY);
    expect(ordered.map((f) => f.motion)).toEqual(MOTION_ORDER);
  });

  it('returns activities newest first with the markup stripped', () => {
    const acts = rowsFor(buildAccountActivitiesSql(NORTHWIND)).map(normalizeActivityRow);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.length).toBeLessThanOrEqual(10);
    const dates = acts.map((a) => a.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    for (const a of acts) {
      expect(a).not.toHaveProperty('_account');
      expect(a.notes).not.toMatch(/[<>]|&nbsp;/);
    }
  });

  it('returns both open and closed cases', () => {
    const cases = rowsFor(buildAccountCasesSql(NORTHWIND)).map(normalizeCaseRow);
    expect(cases.some((c) => c.isOpen)).toBe(true);
    expect(cases.some((c) => !c.isOpen)).toBe(true);
    // CaseSubject is null on open fixtures; the COALESCE with Subject must hold.
    for (const c of cases) expect(typeof c.subject).toBe('string');
  });

  it('returns an account overview for the detail header', () => {
    const rows = rowsFor(buildAccountOverviewSql(NORTHWIND));
    expect(rows).toHaveLength(1);
    const overview = normalizeAccountOverview(rows[0]);
    expect(overview.accountRecordId).toBe(NORTHWIND);
    expect(overview.mrrRunRate).toBeGreaterThan(0);
    expect(overview.isActive).toBe(true);
  });
});

describe('mock router — handoffs', () => {
  it('collapses the status history to the latest row per account', () => {
    const rows = rowsFor(buildHandoffsSql());
    const ids = rows.map((r) => r.account_record_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const handoff = normalizeHandoffRow(rows[0]);
    expect(typeof handoff.status).toBe('string');
    expect(Array.isArray(handoff.flags)).toBe(true);
  });

  it('keeps the full history on the account timeline', () => {
    const rows = rowsFor(buildAccountHandoffsSql(900109));
    expect(rows.length).toBeGreaterThan(1);
    const statuses = rows.map((r) => r.status);
    expect(statuses).toContain('Shared');
    expect(statuses).toContain('Draft');
  });

  it('scopes "my handoffs" to rows on either side of my name', () => {
    const mine = rowsFor(buildMyHandoffsSql(EMAIL)).map(normalizeHandoffRow);
    const ids = mine.map((h) => h.accountRecordId);
    expect(ids).toContain(900109); // incoming to me
    expect(ids).toContain(900106); // outgoing from me
    expect(ids).not.toContain(900110); // neither side is me
  });
});

describe('free hours', () => {
  const calls = () => rowsFor(buildFreeHoursSql()).map(normalizeFreeHourRow);

  it('routes the real SQL and normalizes what comes back', () => {
    const rows = calls();
    expect(rows.length).toBeGreaterThan(0);
    // A fixture typo would surface here as nulls rather than as a blank screen.
    expect(rows.every((c) => c.account && c.consultant && c.callDate && c.month)).toBe(true);
    expect(rows.every((c) => Number.isInteger(c.seq) && c.seq >= 1)).toBe(true);
  });

  it('honours the newest-first ordering the screen relies on', () => {
    const dates = calls().map((c) => c.callDate);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('routes the agreements-sent query to its own route, not the Free Hour one', () => {
    // Both queries name a call_prep table; only this one has the GROUP BY.
    expect(routeFor(buildAgreementsSentSql())).toBe('agreements sent by consultant');
    expect(routeFor(buildFreeHoursSql())).toBe('free hour outcomes');
  });

  it('serves one row per agreement, with the account id to match on', () => {
    const rows = rowsFor(buildAgreementsSentSql()).map(normalizeAgreementRow);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Number.isInteger(r.id))).toBe(true);
    expect(rows.every((r) => Number.isInteger(r.accountRecordId))).toBe(true);
    expect(rows.every((r) => r.consultant && /^\d{4}-\d{2}-\d{2}$/.test(r.sentDate))).toBe(true);
    expect(rows.every((r) => typeof r.accepted === 'boolean')).toBe(true);
    // ids must be unique or the de-duplication in the match is meaningless
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });

  it('credits only agreements the rep sent to their own Free Hour accounts', () => {
    const agreements = rowsFor(buildAgreementsSentSql()).map(normalizeAgreementRow);
    const all = calls();
    const mine = all.filter((c) => c.consultant === ME_FULL);
    const credited = countAgreementsToOwnFreeHourAccounts(mine, agreements);

    expect(credited).toBeGreaterThan(0);
    // The fixtures deliberately include an agreement from the proposal desk, one
    // for an account with no Free Hour, and one outside the window — so the
    // credited count must come in under the raw total.
    expect(credited).toBeLessThan(agreements.length);
    expect(countAgreementsToOwnFreeHourAccounts(all, agreements)).toBeLessThan(agreements.length);
  });

  it('attaches agreements to the consultant rows the table renders', () => {
    const agreements = rowsFor(buildAgreementsSentSql()).map(normalizeAgreementRow);
    const reps = byConsultant(calls(), agreements);
    expect(reps.length).toBeGreaterThan(0);
    // Every rep row carries a number, and at least one of them sent something.
    expect(reps.every((r) => Number.isInteger(r.agreementsSent))).toBe(true);
    expect(reps.some((r) => r.agreementsSent > 0)).toBe(true);
  });

  it('splits trial from existing-customer Free Hours', () => {
    const t2 = summarize(calls());
    expect(t2.trialFreeHours + t2.customerFreeHours).toBe(t2.delivered);
    expect(t2.customerFreeHours).toBeGreaterThan(0);
    expect(t2.trialRepSentAgreement).toBeLessThanOrEqual(t2.trialFreeHours);
  });

  it('summarizes into a shape the screen can render', () => {
    const t = summarize(calls());
    expect(t.delivered).toBeGreaterThan(0);
    expect(t.eligible + t.openCaseAtCall).toBe(t.delivered);
    expect(t.converted).toBeLessThanOrEqual(t.eligible);
    expect(t.ppu + t.dep).toBe(t.converted);
    expect(t.medianDaysToAgreement).not.toBeNull();
  });

  it('keeps repeat Free Hours skewed toward accounts mid-engagement', () => {
    const seq = bySequence(calls());
    const first = seq.find((b) => b.key === '1st');
    const second = seq.find((b) => b.key === '2nd');
    expect(first.delivered).toBeGreaterThan(0);
    expect(first.openCaseAtCall).toBe(0);
    expect(second.openCaseAtCall).toBeGreaterThan(0);
  });
});

describe('mock router — unmatched SQL', () => {
  it('returns zero rows and no route rather than throwing', () => {
    const result = routeMockSql('SELECT * FROM `project-for-method-dw.revenue.SomethingNew`');
    expect(result.route).toBeNull();
    expect(result.rows).toEqual([]);
  });
});
