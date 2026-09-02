// Fixture-backed stand-in for queryBq(). Active only in MOCK_MODE.
//
// This is not a SQL engine. It reads just enough out of each query — which
// table, which record id, which consultant pattern, whether it wants the
// latest row per account — to return the right slice of the fixtures in
// builder/src/dev/fixtures/. That keeps navigation real: clicking an account on
// the board lands on that account's detail page with that account's sessions.
//
// Adding a screen? Add a fixture table and one entry to ROUTES. An unmatched
// query returns zero rows and logs `[mock] unrouted query` with the SQL, so a
// blank new screen tells you exactly what to add rather than failing silently.

import { mockWarn } from './mockMode.js';
import { fixtures } from './fixtures/ps.js';
import { COMPANY_ACCOUNTS } from './fixtures/customer.js';
// Project reads come from the writable dev store, not straight from the
// fixtures, so an edit made in the UI shows up on the next query — while still
// travelling through the real SQL builders and normalizers.
import { storeSnapshot } from './mockStore.js';
import { customerFixtures } from './fixtures/customer.js';
import { SKIPPED_RATING } from '../lib/customer.js';

// Fully-qualified table names as the data layers write them.
const T = {
  snapshots: 'call_prep.snapshots',
  handoffs: 'call_prep.handoffs',
  accounts: 'revenue.int_accounts',
  timeTracking: 'revenue.TimeTracking',
  cases: 'revenue.Cases',
  // None of these exist in BigQuery yet — the project tracker's backing store is
  // still an open decision, so the dev store is its only source today.
  projects: 'call_prep.projects',
  projectItems: 'call_prep.project_items',
  projectEvents: 'call_prep.project_events',
  projectWorkLog: 'call_prep.project_work_log',
  reps: 'call_prep.reps',
  // These five DO exist in BigQuery (verified 2026-08-05) — the fixtures mirror
  // their shape and their uneven coverage so the customer page gets designed
  // against reality. See the header of lib/customer.js.
  conversations: 'customer_signals.v_conversations',
  callSummaries: 'customer_signals.call_summaries',
  callSignals: 'customer_signals.signals_by_call',
  psAudit: 'call_audits.ps_call_audit',
  freeHourAudit: 'call_audits.free_hour_audit',
  briefContent: 'call_prep.brief_content',
  account: 'revenue.Account',
  opportunityFit: 'call_prep.opportunity_fit',
  activity: 'revenue.Activity',
  freeHourOutcomes: 'call_prep.free_hour_outcomes',
  psProposals: 'call_prep.ps_proposals',
};

const hits = (sql, table) => sql.includes(table);

/** First integer matched by `re`, or null. */
function intOf(sql, re) {
  const m = sql.match(re);
  return m ? Number(m[1]) : null;
}

/** A single-quoted SQL literal captured by `re`, with backslash escapes undone. */
function literalOf(sql, re) {
  const raw = sql.match(re)?.[1];
  return raw == null ? null : raw.replace(/\\(.)/g, '$1');
}

/**
 * The REGEXP_CONTAINS(LOWER(col), r'…') predicates in a query, as testable
 * matchers. Several queries OR two of them together (handoffs matches both
 * outgoing_rep and incoming_rep), so callers treat the list as "any match".
 */
function consultantMatchers(sql) {
  return [...sql.matchAll(/REGEXP_CONTAINS\(LOWER\((\w+)\), r'([^']+)'\)/g)].map(
    ([, field, pattern]) => ({ field, re: new RegExp(pattern) })
  );
}

function matchesAnyConsultant(row, matchers) {
  if (!matchers.length) return true;
  return matchers.some(({ field, re }) => re.test(String(row[field] ?? '').toLowerCase()));
}

/** Emulate `QUALIFY ROW_NUMBER() OVER (PARTITION BY account_record_id ORDER BY <col> DESC) = 1`. */
function latestPerAccount(rows, orderCol) {
  const best = new Map();
  for (const row of rows) {
    const key = row.account_record_id;
    const current = best.get(key);
    if (!current || String(row[orderCol]) > String(current[orderCol])) best.set(key, row);
  }
  return [...best.values()];
}

function qualifyOrderCol(sql) {
  const m = sql.match(
    /QUALIFY ROW_NUMBER\(\) OVER \(PARTITION BY account_record_id ORDER BY (\w+) DESC\)/
  );
  return m ? m[1] : null;
}

const desc = (col) => (a, b) => String(b[col] ?? '').localeCompare(String(a[col] ?? ''));
const asc = (col) => (a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? ''));

/** Drop the `_account` join helper the fixtures carry; BQ never returns it. */
const clean = (rows) => rows.map(({ _account, ...rest }) => rest);

/** Every id in the first `IN (…)` list — the batched indicator queries' scope. */
function idsIn(sql) {
  const list = sql.match(/IN \(([\d,\s]+)\)/)?.[1];
  return list ? list.split(',').map((n) => Number(n.trim())).filter(Number.isFinite) : [];
}

/** Today as YYYY-MM-DD, standing in for BQ's CURRENT_DATE(). */
function localIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Order matters: the board query names both snapshots and int_accounts, so its
// route has to be tested before the generic snapshots routes.
const ROUTES = [
  // ── Cross-account indicators ─────────────────────────────────────────────
  // These two union across five tables each, so they must be matched before any
  // single-table route. Detected on their own column aliases rather than on a
  // table name, which is what makes that safe.
  {
    name: 'account activity (batched, all sources)',
    when: (sql) => /AS activity_date/.test(sql),
    rows: (sql) => {
      const ids = new Set(idsIn(sql));
      const store = storeSnapshot();
      const out = [];
      const push = (accountId, date, actor, actorId, source, detail) => {
        if (!date || !ids.has(Number(accountId))) return;
        out.push({
          account_id: String(accountId),
          activity_date: String(date).slice(0, 10),
          actor: actor ?? null,
          actor_id: actorId == null ? null : String(actorId),
          source,
          detail: detail ?? null,
        });
      };
      // Latest row per account per source — mirrors the QUALIFY in the real SQL.
      const latest = (rows, accountKey, dateKey) => {
        const best = new Map();
        for (const row of rows) {
          const key = Number(row[accountKey]);
          const current = best.get(key);
          if (!current || String(row[dateKey]) > String(current[dateKey])) best.set(key, row);
        }
        return [...best.values()];
      };

      for (const r of latest(store.PROJECT_WORK_LOG, 'account_record_id', 'work_date')) {
        push(r.account_record_id, r.work_date, r.author, null, 'work log', r.summary);
      }
      for (const r of latest(store.PROJECT_EVENTS, 'account_record_id', 'event_date')) {
        push(r.account_record_id, r.event_date, r.author, null, 'project', r.summary);
      }
      for (const r of latest(fixtures().SESSIONS, '_account', 'TxnDate')) {
        push(r._account, r.TxnDate, null, r.AssignedToRecordID, 'billed session', r.MethodSupportType);
      }
      for (const r of latest(customerFixtures().CONVERSATIONS, 'account_id', 'occurred_at')) {
        push(r.account_id, r.occurred_at, null, null, 'call', r.topic);
      }
      for (const r of latest(fixtures().SNAPSHOTS, 'account_record_id', 'snapshot_date')) {
        push(r.account_record_id, r.snapshot_date, r.consultant, null, 'call prep', r.call_type);
      }
      return out.sort((a, b) => a.account_id.localeCompare(b.account_id) || desc('activity_date')(a, b));
    },
  },
  {
    name: 'account escalations (batched audits)',
    when: (sql) => /AS escalation_count/.test(sql),
    rows: (sql) => {
      const ids = new Set(idsIn(sql));
      const byAccount = new Map();
      for (const audit of customerFixtures().AUDITS) {
        const id = Number(
          Object.keys(COMPANY_ACCOUNTS).find((key) => COMPANY_ACCOUNTS[key] === audit._company_account)
        );
        if (!ids.has(id)) continue;
        const agg = byAccount.get(id)
          ?? { audits: 0, scored: 0, escalations: 0, flagged: 0, lastEscalation: null, worst: null, lastAudit: null };
        agg.audits += 1;
        if (audit.escalation_risk === 'true') {
          agg.escalations += 1;
          if (!agg.lastEscalation || audit.audit_date > agg.lastEscalation) agg.lastEscalation = audit.audit_date;
        }
        if (audit.flagged === 'true') agg.flagged += 1;
        // A skipped audit scores 0 and must not become the "worst" call.
        if (audit.rating !== SKIPPED_RATING) {
          agg.scored += 1;
          const pct = Number(audit.overall_pct);
          if (agg.worst == null || pct < agg.worst) agg.worst = pct;
        }
        if (!agg.lastAudit || audit.audit_date > agg.lastAudit) agg.lastAudit = audit.audit_date;
        byAccount.set(id, agg);
      }
      return [...byAccount.entries()].map(([id, agg]) => ({
        account_id: String(id),
        audit_count: String(agg.audits),
        scored_count: String(agg.scored),
        escalation_count: String(agg.escalations),
        flagged_count: String(agg.flagged),
        last_escalation_date: agg.lastEscalation,
        worst_pct: agg.worst == null ? null : String(agg.worst),
        last_audit_date: agg.lastAudit,
      }));
    },
  },

  // ── Customer page ────────────────────────────────────────────────────────
  // These come first because each names a table that a later, broader route
  // also matches (int_accounts, snapshots).
  {
    name: 'customer overview (int_accounts + Account)',
    when: (sql) => hits(sql, T.accounts) && hits(sql, T.account),
    rows: (sql) => {
      const id = intOf(sql, /account_record_id = (\d+)/);
      const base = fixtures().ACCOUNTS.find((a) => Number(a.account_record_id) === id);
      if (!base) return [];
      // Vertical/sector/signup come off the account's latest snapshot here; in
      // BigQuery they come from revenue.Account, which the fixtures don't model.
      const snap = fixtures().SNAPSHOTS
        .filter((s) => Number(s.account_record_id) === id)
        .sort(desc('snapshot_date'))[0];
      return [{
        ...base,
        company_account: COMPANY_ACCOUNTS[id] ?? `acct${id}`,
        entity_record_id: String(id + 500000),
        vertical: snap?.industry_l1 ?? null,
        sector: snap?.industry_l2 ?? null,
        signup_date: snap?.signup_date ?? null,
        cancellation_date: base.is_active === 'true' ? null : localIso(),
      }];
    },
  },
  {
    // Serves both the customer page's prep list and the call-prep account brief;
    // the two queries differ only in their column list.
    name: 'call preps + brief content',
    when: (sql) => hits(sql, T.snapshots) && hits(sql, T.briefContent),
    rows: (sql) => {
      const id = intOf(sql, /account_record_id = (\d+)/);
      const briefs = new Map(
        customerFixtures().BRIEFS.map((b) => [`${b.account_record_id}|${b.snapshot_date}`, b])
      );
      return fixtures().SNAPSHOTS
        .filter((s) => Number(s.account_record_id) === id)
        .map((s) => {
          const brief = briefs.get(`${s.account_record_id}|${s.snapshot_date}`);
          return {
            ...s,
            scheduled_time: brief?.scheduled_time ?? null,
            top_3: brief?.top_3 ?? [],
            why_today: brief?.why_today ?? null,
            business_context: brief?.business_context ?? null,
            contact_name: brief?.contact_name ?? null,
            contact_email: brief?.contact_email ?? null,
            contact_phone: brief?.contact_phone ?? null,
            website: brief?.website ?? null,
          };
        })
        .sort(desc('snapshot_date'));
    },
  },
  {
    // Transcript excerpts, checked before the call index: the real queries differ
    // only in their column list, and the excerpt one is the narrower match.
    name: 'call transcripts (lazy)',
    when: (sql) => hits(sql, T.conversations) && /transcript_excerpt/.test(sql),
    rows: (sql) => {
      const id = intOf(sql, /account_id = (\d+)/);
      const limit = intOf(sql, /LIMIT (\d+)/) ?? 100;
      return customerFixtures().CONVERSATIONS
        .filter((c) => Number(c.account_id) === id)
        .sort(desc('occurred_at'))
        .slice(0, limit)
        .map((c) => ({
          conversation_id: c.conversation_id,
          transcript_chars: c.transcript_chars,
          transcript_excerpt: c.transcript_excerpt,
        }));
    },
  },
  {
    name: 'calls (v_conversations)',
    when: (sql) => hits(sql, T.conversations),
    rows: (sql) => {
      const id = intOf(sql, /account_id = (\d+)/);
      const limit = intOf(sql, /LIMIT (\d+)/) ?? 100;
      // The real call index selects no transcript column at all — mirror that,
      // so a component can't accidentally rely on one being present.
      return customerFixtures().CONVERSATIONS
        .filter((c) => Number(c.account_id) === id)
        .sort(desc('occurred_at'))
        .slice(0, limit)
        .map(({ transcript_chars, transcript_excerpt, ...rest }) => rest);
    },
  },
  {
    name: 'call summaries',
    when: (sql) => hits(sql, T.callSummaries),
    rows: (sql) => {
      const id = intOf(sql, /company_account_record_id = (\d+)/);
      return customerFixtures().SUMMARIES
        .filter((s) => Number(s.company_account_record_id) === id)
        .sort(desc('created_date'));
    },
  },
  {
    name: 'call signals',
    when: (sql) => hits(sql, T.callSignals),
    rows: (sql) => {
      const id = intOf(sql, /account_id = (\d+)/);
      return customerFixtures().SIGNALS
        .filter((s) => Number(s.account_id) === id)
        .sort(desc('occurred_at'));
    },
  },
  {
    name: 'call audits (both rubrics)',
    when: (sql) => hits(sql, T.psAudit) || hits(sql, T.freeHourAudit),
    rows: (sql) => {
      // The real query keys on the subdomain-style name, not an id — which is
      // exactly why audit coverage is partial. Mirror that here rather than
      // quietly matching on account id.
      const wanted = literalOf(sql, /LOWER\(TRIM\(account\)\) = '((?:[^'\\]|\\.)*)'/);
      return customerFixtures().AUDITS
        .filter((a) => !wanted || a._company_account === wanted)
        .map(({ _company_account, ...rest }) => rest)
        .sort(desc('audit_date'));
    },
  },
  {
    name: 'board (latest snapshot per account + int_accounts)',
    when: (sql) => hits(sql, T.snapshots) && hits(sql, T.accounts),
    rows: (sql) => {
      const { SNAPSHOTS, ACCOUNTS } = fixtures();
      const matchers = consultantMatchers(sql);
      const mine = SNAPSHOTS.filter((r) => matchesAnyConsultant(r, matchers));
      const overview = new Map(ACCOUNTS.map((a) => [a.account_record_id, a]));
      return latestPerAccount(mine, 'snapshot_date')
        .map((r) => ({ ...r, ...(overview.get(r.account_record_id) ?? {}) }))
        .sort(desc('snapshot_date'));
    },
  },
  {
    // Powers the customer picker on the new-project form. Must precede the
    // generic snapshots routes, which would return whole snapshot rows.
    name: 'account options (DISTINCT accounts from snapshots)',
    when: (sql) => hits(sql, T.snapshots) && /SELECT DISTINCT\s+account_record_id/.test(sql),
    rows: () => {
      const seen = new Map();
      for (const row of fixtures().SNAPSHOTS) {
        if (row.account_name && !seen.has(row.account_record_id)) {
          seen.set(row.account_record_id, {
            account_record_id: row.account_record_id,
            account_name: row.account_name,
          });
        }
      }
      return [...seen.values()].sort(asc('account_name'));
    },
  },
  {
    name: 'consultants (GROUP BY consultant)',
    when: (sql) => hits(sql, T.snapshots) && /GROUP BY\s+consultant/.test(sql),
    rows: () => {
      const { SNAPSHOTS } = fixtures();
      const byConsultant = new Map();
      for (const row of SNAPSHOTS) {
        const entry = byConsultant.get(row.consultant) ?? { accounts: new Set(), last: '' };
        entry.accounts.add(row.account_record_id);
        if (row.snapshot_date > entry.last) entry.last = row.snapshot_date;
        byConsultant.set(row.consultant, entry);
      }
      return [...byConsultant.entries()]
        .map(([consultant, e]) => ({
          consultant,
          account_count: String(e.accounts.size),
          last_snapshot_date: e.last,
        }))
        .sort(asc('consultant'));
    },
  },
  {
    name: 'snapshots for one account',
    when: (sql) => hits(sql, T.snapshots) && /account_record_id = \d+/.test(sql),
    rows: (sql) => {
      const id = intOf(sql, /account_record_id = (\d+)/);
      return fixtures()
        .SNAPSHOTS.filter((r) => Number(r.account_record_id) === id)
        .sort(desc('snapshot_date'));
    },
  },
  {
    name: 'snapshots for one day (Today panel)',
    when: (sql) => hits(sql, T.snapshots) && /snapshot_date = DATE '/.test(sql),
    rows: (sql) => {
      const day = sql.match(/snapshot_date = DATE '(\d{4}-\d{2}-\d{2})'/)?.[1];
      const matchers = consultantMatchers(sql);
      return fixtures()
        .SNAPSHOTS.filter((r) => r.snapshot_date === day && matchesAnyConsultant(r, matchers))
        .sort(asc('account_name'));
    },
  },
  {
    name: 'book (snapshots for one named consultant)',
    when: (sql) => hits(sql, T.snapshots),
    rows: (sql) => {
      const wanted = literalOf(sql, /consultant = '((?:[^'\\]|\\.)*)'/);
      const matchers = consultantMatchers(sql);
      const scoped = fixtures().SNAPSHOTS.filter(
        (r) => (!wanted || r.consultant === wanted) && matchesAnyConsultant(r, matchers)
      );
      const orderCol = qualifyOrderCol(sql);
      const rows = orderCol ? latestPerAccount(scoped, orderCol) : scoped;
      return rows.sort(desc('snapshot_date'));
    },
  },
  {
    // Agreements sent, a different grain from Free Hours: every proposal a
    // consultant wrote, whether or not a Free Hour came first. Must precede the
    // free-hour route only in spirit — it keys off the GROUP BY, which the
    // free-hour query never has.
    name: 'agreements sent by consultant',
    when: (sql) => hits(sql, T.psProposals) && /GROUP BY consultant, month/.test(sql),
    rows: () => [...fixtures().AGREEMENTS],
  },
  {
    name: 'free hour outcomes',
    when: (sql) => hits(sql, T.freeHourOutcomes),
    // The screen filters by period, consultant and segment client-side, so the
    // whole set comes back and only the ORDER BY has to be honoured here.
    rows: () => [...fixtures().FREE_HOURS].sort((a, b) => b.call_date.localeCompare(a.call_date)),
  },
  {
    name: 'handoffs',
    when: (sql) => hits(sql, T.handoffs),
    rows: (sql) => {
      const id = intOf(sql, /account_record_id = (\d+)/);
      const incoming = literalOf(sql, /incoming_rep = '((?:[^'\\]|\\.)*)'/);
      const matchers = consultantMatchers(sql);
      // Base fixtures plus any handoff created by reassigning a project, so a
      // reassignment made on the tracker shows up on the Handoffs screens.
      const all = [...fixtures().HANDOFFS, ...storeSnapshot().HANDOFFS];
      let rows = all.filter((r) => matchesAnyConsultant(r, matchers));
      if (id != null) rows = rows.filter((r) => Number(r.account_record_id) === id);
      if (incoming) rows = rows.filter((r) => r.incoming_rep === incoming);
      const orderCol = qualifyOrderCol(sql);
      if (orderCol) rows = latestPerAccount(rows, orderCol);
      return rows.sort(desc('created_at'));
    },
  },
  // The projects route must precede the items and work-log routes:
  // buildProjectsSql names all three (its CTEs aggregate them).
  {
    name: 'projects (+ item and work rollups)',
    when: (sql) => hits(sql, T.projects),
    rows: (sql) => {
      const { PROJECTS, PROJECT_ITEMS, PROJECT_WORK_LOG } = storeSnapshot();
      const today = localIso();

      // Mirrors itemRollupSql() in lib/projects.js — keep the two in step.
      const items = new Map();
      for (const it of PROJECT_ITEMS) {
        const r = items.get(it.project_id)
          ?? { open: 0, overdue: 0, promisedOpen: 0, promisedTotal: 0, onTime: 0, promisedHours: 0 };
        const done = it.status === 'Done';
        const promised = it.is_promised === 'true';
        if (!done) {
          r.open += 1;
          if (it.due_date && it.due_date < today) r.overdue += 1;
          if (promised) r.promisedOpen += 1;
        }
        if (promised) {
          r.promisedTotal += 1;
          if (done && (!it.due_date || (it.closed_date && it.closed_date <= it.due_date))) r.onTime += 1;
        }
        r.promisedHours += Number(it.estimate_hours ?? 0);
        items.set(it.project_id, r);
      }

      // Mirrors workRollupSql().
      const work = new Map();
      for (const e of PROJECT_WORK_LOG) {
        const r = work.get(e.project_id) ?? { hours: 0, billable: 0, last: null };
        const hours = Number(e.hours ?? 0);
        r.hours += hours;
        if (e.billable === 'Billable') r.billable += hours;
        if (!r.last || e.work_date > r.last) r.last = e.work_date;
        work.set(e.project_id, r);
      }

      const round = (n) => String(Math.round(n * 100) / 100);
      // Scoped by project id (detail page) or by account (customer page).
      const wanted = literalOf(sql, /project_id = '([^']*)'/);
      const account = intOf(sql, /account_record_id = (\d+)/);
      return PROJECTS
        .filter((p) => !wanted || p.project_id === wanted)
        .filter((p) => account == null || Number(p.account_record_id) === account)
        .map((p) => {
          const i = items.get(p.project_id)
            ?? { open: 0, overdue: 0, promisedOpen: 0, promisedTotal: 0, onTime: 0, promisedHours: 0 };
          const w = work.get(p.project_id) ?? { hours: 0, billable: 0, last: null };
          return {
            ...p,
            open_items: String(i.open),
            overdue_items: String(i.overdue),
            promised_items: String(i.promisedOpen),
            promised_total: String(i.promisedTotal),
            promised_on_time: String(i.onTime),
            promised_hours: round(i.promisedHours),
            logged_hours: round(w.hours),
            billable_hours: round(w.billable),
            last_work_date: w.last,
          };
        })
        .sort(desc('last_activity_date'));
    },
  },
  {
    name: 'project work items',
    when: (sql) => hits(sql, T.projectItems),
    rows: (sql) => {
      const wanted = literalOf(sql, /project_id = '([^']*)'/);
      return storeSnapshot()
        .PROJECT_ITEMS.filter((i) => !wanted || i.project_id === wanted)
        .sort(asc('due_date'));
    },
  },
  {
    // Scoped by project (detail page) or by account (customer page timeline).
    name: 'project work log',
    when: (sql) => hits(sql, T.projectWorkLog),
    rows: (sql) => {
      const wanted = literalOf(sql, /project_id = '([^']*)'/);
      const account = intOf(sql, /account_record_id = (\d+)/);
      return storeSnapshot()
        .PROJECT_WORK_LOG.filter((e) => !wanted || e.project_id === wanted)
        .filter((e) => account == null || Number(e.account_record_id) === account)
        .sort((a, b) => desc('work_date')(a, b) || desc('entry_id')(a, b));
    },
  },
  {
    name: 'project activity log',
    when: (sql) => hits(sql, T.projectEvents),
    rows: (sql) => {
      const wanted = literalOf(sql, /project_id = '([^']*)'/);
      const account = intOf(sql, /account_record_id = (\d+)/);
      return storeSnapshot()
        .PROJECT_EVENTS.filter((e) => !wanted || e.project_id === wanted)
        .filter((e) => account == null || Number(e.account_record_id) === account)
        .sort(desc('event_date'));
    },
  },
  {
    name: 'reps',
    when: (sql) => hits(sql, T.reps),
    rows: () => storeSnapshot().REPS.filter((r) => r.is_active === 'true').sort(asc('name')),
  },
  {
    name: 'int_accounts overview',
    when: (sql) => hits(sql, T.accounts),
    rows: (sql) => {
      const { ACCOUNTS } = fixtures();
      const id = intOf(sql, /account_record_id = (\d+)/);
      return id == null ? ACCOUNTS : ACCOUNTS.filter((a) => Number(a.account_record_id) === id);
    },
  },
  {
    name: 'TimeTracking sessions',
    when: (sql) => hits(sql, T.timeTracking),
    rows: (sql) => {
      const id = intOf(sql, /MethodCompanyAccountRecordID = (\d+)/);
      return clean(fixtures().SESSIONS.filter((s) => Number(s._account) === id)).sort(asc('TxnDate'));
    },
  },
  {
    name: 'Cases',
    when: (sql) => hits(sql, T.cases),
    rows: (sql) => {
      const id = intOf(sql, /MethodCompanyAccountRecordID = (\d+)/);
      // The real query projects COALESCE(CaseSubject, Subject) AS subject — the
      // fixtures keep both raw columns, so apply that projection here rather
      // than pre-flattening it and hiding the coalesce from the normalizer.
      return clean(fixtures().CASES.filter((c) => Number(c._account) === id))
        .map(({ CaseSubject, Subject, ...rest }) => ({ ...rest, subject: CaseSubject ?? Subject }))
        .sort(desc('CreatedDate'));
    },
  },
  {
    name: 'opportunity fit (per motion)',
    when: (sql) => hits(sql, T.opportunityFit),
    rows: (sql) => {
      const id = intOf(sql, /account_record_id = (\d+)/);
      return clean(fixtures().OPPORTUNITY_FIT.filter((r) => Number(r._account) === id))
        .sort((a, b) => desc('assessed_date')(a, b) || a.motion.localeCompare(b.motion));
    },
  },
  {
    name: 'recent activities',
    when: (sql) => hits(sql, T.activity),
    rows: (sql) => {
      const id = intOf(sql, /MethodCompanyAccountRecordID = (\d+)/);
      const limit = intOf(sql, /LIMIT (\d+)/) ?? 10;
      return clean(fixtures().ACTIVITIES.filter((a) => Number(a._account) === id))
        .sort(desc('occurred_on'))
        .slice(0, limit);
    },
  },
  {
    name: 'connectivity probe',
    when: (sql) => /^\s*SELECT 1\s*$/i.test(sql),
    rows: () => [{ f0_: '1' }],
  },
];

/** Schema block in the shape runQueryBq() derives from the REST response. */
function schemaOf(rows) {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((name) => ({ name, type: 'STRING', mode: 'NULLABLE' }));
}

// A little latency so skeletons/spinners are actually visible while designing.
const LATENCY_MS = Number(import.meta.env?.VITE_MOCK_LATENCY ?? 140);

export function routeMockSql(sql) {
  const route = ROUTES.find((r) => r.when(sql));
  if (!route) {
    mockWarn('unrouted query — add a fixture route in src/dev/mockBq.js', sql);
    return { rows: [], route: null };
  }
  return { rows: route.rows(sql), route: route.name };
}

export async function mockQueryBq(sql) {
  const { rows, route } = routeMockSql(sql);
  if (LATENCY_MS > 0) await new Promise((r) => setTimeout(r, LATENCY_MS));
  console.debug(`[mock] ${route ?? 'unrouted'} → ${rows.length} row(s)`);
  return { rows, schema: schemaOf(rows) };
}
