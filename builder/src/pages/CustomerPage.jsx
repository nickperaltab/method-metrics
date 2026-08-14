// Customer page — Route: #/accounts/:recordId
//
// Everything known about one account, on one screen: who they are, what we're
// delivering, what they've told us, how our calls have been scored, and a merged
// timeline of every call, prep, audit, billed session, case and work-log entry.
//
// Most of this reads REAL BigQuery tables (see the header of lib/customer.js);
// only the projects section depends on the tracker's not-yet-chosen store. So
// every section loads independently via Promise.allSettled: an account with no
// audits, or a production session where the projects tables don't exist, still
// renders everything else instead of one page-wide error.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchCustomer,
  fetchCustomerCalls,
  fetchCustomerSummaries,
  fetchCustomerSignals,
  fetchCustomerAudits,
  fetchCustomerPreps,
  fetchCustomerTranscripts,
  buildTimeline,
  summarizeAudits,
  latestSignals,
  daysSinceLastCall,
  auditCoverageCaveat,
  latestActivityFrom,
  escalationFlags,
  actorLabel,
} from '../lib/customer';
import {
  fetchAccountSessions,
  fetchAccountCases,
} from '../lib/callPrep';
import {
  fetchAccountProjects,
  fetchAccountWorkLog,
  fetchAccountProjectEvents,
  compareProjects,
  isComplete,
  localToday,
} from '../lib/projects';
import { hoursEfficiency, formatHours, formatRatio, ratingTone } from '../lib/efficiency';
import { canWrite } from '../lib/projectsStore';
import Timeline from '../components/customer/Timeline';
import FeedbackPanel from '../components/customer/FeedbackPanel';
import SignalsPanel from '../components/customer/SignalsPanel';
import { FlagPanel, FlagBadges, LastActivity } from '../components/customer/Flags';
import { s, tone, Stat, StatusChip, Tag, SectionHead, TrackerStyles } from '../components/projects/ui';

const styles = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginTop: 12 },
  name: { fontSize: 24, fontWeight: 700, color: '#1a1a1a' },
  sub: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  chips: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 },
  actions: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 },
  partial: {
    fontSize: 13, color: '#6b7280', background: '#fafbfc', border: '1px dashed #e2e5e9',
    borderRadius: 8, padding: '10px 14px', marginBottom: 20, lineHeight: 1.5,
  },
};

const money = (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`);

/** Account age in whole months, for the header line. */
function ageMonths(signupDate, todayIso) {
  if (!signupDate) return null;
  const days = (Date.parse(todayIso) - Date.parse(signupDate)) / 86400000;
  return days > 0 ? Math.round(days / 30.4) : null;
}

// Each section is loaded separately so one missing source can't blank the page.
// The key is what the failure note names, so a user can tell which source failed.
const SOURCES = [
  ['customer', (id) => fetchCustomer(id)],
  ['calls', (id) => fetchCustomerCalls(id)],
  ['summaries', (id) => fetchCustomerSummaries(id)],
  ['signals', (id) => fetchCustomerSignals(id)],
  ['preps', (id) => fetchCustomerPreps(id)],
  ['sessions', (id) => fetchAccountSessions(id)],
  ['cases', (id) => fetchAccountCases(id)],
  ['projects', (id) => fetchAccountProjects(id)],
  ['workLog', (id) => fetchAccountWorkLog(id)],
  ['projectEvents', (id) => fetchAccountProjectEvents(id)],
];

// Human names for the source keys above — the raw keys and the BigQuery error text
// both used to be printed straight into the failure banner.
const SOURCE_LABELS = {
  calls: 'calls',
  summaries: 'call summaries',
  signals: 'call signals',
  preps: 'call preps',
  sessions: 'billed sessions',
  cases: 'cases',
  projects: 'projects',
  workLog: 'work log',
  projectEvents: 'project events',
  audits: 'call audits',
};

const EMPTY = {
  customer: null, calls: [], summaries: [], signals: [], preps: [], sessions: [],
  cases: [], projects: [], workLog: [], projectEvents: [], audits: [],
};

export default function CustomerPage() {
  const { recordId } = useParams();
  const todayIso = useMemo(() => localToday(), []);

  const [data, setData] = useState(null);
  const [failures, setFailures] = useState([]);
  const [fatal, setFatal] = useState('');
  // Transcripts are loaded on demand — reading them scans the full 291 MB
  // conversations table, so a page view shouldn't pay for it unprompted.
  const [transcripts, setTranscripts] = useState(null);
  const [transcriptState, setTranscriptState] = useState('idle');

  const loadTranscripts = useCallback(async () => {
    if (transcriptState === 'loading' || transcriptState === 'loaded') return;
    setTranscriptState('loading');
    try {
      setTranscripts(await fetchCustomerTranscripts(recordId));
      setTranscriptState('loaded');
    } catch {
      setTranscriptState('error');
    }
  }, [recordId, transcriptState]);

  const load = useCallback(async () => {
    setFatal('');
    const results = await Promise.allSettled(SOURCES.map(([, fetcher]) => fetcher(recordId)));
    const next = { ...EMPTY };
    const failed = [];
    results.forEach((result, i) => {
      const key = SOURCES[i][0];
      if (result.status === 'fulfilled') next[key] = result.value;
      else failed.push({ key, message: result.reason?.message || String(result.reason) });
    });

    // Audits key on the subdomain, so they can only be fetched once the account
    // header has resolved. A missing header is the one fatal failure.
    if (next.customer?.companyAccount) {
      try {
        next.audits = await fetchCustomerAudits(next.customer.companyAccount);
      } catch (e) {
        failed.push({ key: 'audits', message: e?.message || String(e) });
      }
    }

    if (!next.customer) {
      const why = failed.find((f) => f.key === 'customer');
      setFatal(why ? why.message : `No account with record id ${recordId}.`);
    }
    setFailures(failed.filter((f) => f.key !== 'customer'));
    setData(next);
  }, [recordId]);

  useEffect(() => {
    setData(null);
    setTranscripts(null);
    setTranscriptState('idle');
    load();
  }, [load]);

  const timeline = useMemo(() => (data ? buildTimeline(data) : []), [data]);
  const auditSummary = useMemo(() => (data ? summarizeAudits(data.audits) : null), [data]);
  const signalSummary = useMemo(() => (data ? latestSignals(data.signals) : {}), [data]);

  // Last activity comes from what's already loaded — no extra query — using the
  // same rules as the batched list query in lib/customer.js.
  const lastActivity = useMemo(() => (data ? latestActivityFrom(data) : null), [data]);
  const flags = useMemo(
    () => (data ? escalationFlags({ ...data, lastActivity, todayIso }) : []),
    [data, lastActivity, todayIso]
  );

  const projectTotals = useMemo(() => {
    if (!data) return null;
    const live = data.projects.filter((p) => !isComplete(p));
    const promised = data.projects.reduce((sum, p) => sum + p.promisedHours, 0);
    const logged = data.projects.reduce((sum, p) => sum + p.loggedHours, 0);
    return {
      active: live.length,
      atRisk: live.filter((p) => p.status === 'Blocked' || p.status === 'At risk').length,
      openItems: live.reduce((sum, p) => sum + p.openItems, 0),
      overdueItems: live.reduce((sum, p) => sum + p.overdueItems, 0),
      promised,
      logged,
      efficiency: hoursEfficiency(promised, logged),
    };
  }, [data]);

  if (fatal) {
    return (
      <div style={s.wrap}>
        <a href="#/projects" style={s.back}>← Projects</a>
        <div style={s.error}>Couldn’t load this customer: {fatal}</div>
      </div>
    );
  }
  if (!data) return <div style={s.wrap}><div style={s.note}>Loading customer…</div></div>;

  const { customer, calls, cases, projects } = data;
  const sinceLastCall = daysSinceLastCall(calls, todayIso);
  const openCases = cases.filter((c) => c.isOpen).length;
  const months = ageMonths(customer.signupDate, todayIso);
  const caveat = auditCoverageCaveat(customer, data.audits);
  const depPrep = data.preps.find((p) => p.depEnrolled);

  return (
    <div style={s.wrap}>
      <TrackerStyles />
      <a href="#/projects" className="tk-focus" style={s.back}>← Projects</a>

      <div style={styles.head}>
        <div>
          <h1 style={styles.name}>{customer.companyAccount ?? `#${customer.accountRecordId}`}</h1>
          <div style={styles.sub}>
            {[
              customer.vertical,
              customer.sector,
              months != null ? `${months} months with Method` : null,
            ].filter(Boolean).join(' · ') || 'No industry on file'}
          </div>
          <div style={styles.chips}>
            <Tag kind={customer.isActive ? 'good' : 'bad'}>
              {customer.isActive ? 'active' : `churned${customer.cancellationDate ? ` ${customer.cancellationDate}` : ''}`}
            </Tag>
            {customer.saasPayType && <Tag>{customer.saasPayType}</Tag>}
            {depPrep && <Tag kind="good">DEP</Tag>}
            <Tag>#{customer.accountRecordId}</Tag>
          </div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 10 }}>
            Last activity:{' '}
            <LastActivity
              activity={lastActivity}
              actorLabel={actorLabel}
              todayIso={todayIso}
              style={{ fontWeight: 600, color: '#374151' }}
            />
            {lastActivity?.detail && (
              <span style={{ ...s.monoSmall, display: 'block', marginTop: 2 }}>{lastActivity.detail}</span>
            )}
          </div>
        </div>
        <div style={styles.actions}>
          {/* Worst flags repeated up here so they're visible without scrolling —
              the full list with evidence is a section below. */}
          <FlagBadges flags={flags} max={2} />
          <a href={`#/call-prep/account/${encodeURIComponent(customer.accountRecordId)}`} style={s.link}>
            Pre-call brief →
          </a>
          {canWrite && (
            <a href="#/projects/new" className="tk-focus" style={{ ...s.secondary, textDecoration: 'none', display: 'inline-block' }}>+ New project</a>
          )}
        </div>
      </div>

      <div style={{ ...s.stats, marginTop: 24 }}>
        <Stat label="MRR run-rate" value={money(customer.mrrRunRate)} />
        <Stat label="Licenses" value={customer.userLicenses ?? '—'} />
        <Stat
          label="Health"
          value={customer.healthScore == null ? '—' : Math.round(customer.healthScore)}
          sub={customer.healthScore == null ? 'not scored' : undefined}
        />
        <Stat
          label="Last call"
          value={sinceLastCall == null ? '—' : `${sinceLastCall}d ago`}
          sub={`${calls.length} on record`}
          alert={sinceLastCall != null && sinceLastCall > 30}
        />
        <Stat label="Open cases" value={openCases} alert={openCases > 0} />
        <Stat
          label="Call score"
          value={auditSummary?.averagePct == null ? '—' : `${Math.round(auditSummary.averagePct)}%`}
          sub={auditSummary ? `${auditSummary.count} audited` : 'no audits'}
        />
      </div>

      {failures.length > 0 && (
        <div style={styles.partial} title={failures.map((f) => `${f.key}: ${f.message}`).join('\n')}>
          <strong>Partial view.</strong> Couldn’t load:{' '}
          {failures.map((f) => SOURCE_LABELS[f.key] ?? f.key).join(', ')}. Those sections are empty.
        </div>
      )}

      {/* ── Flags ─────────────────────────────────────────────── */}
      <section style={s.section}>
        <SectionHead
          title="Flags"
          aside={flags.length
            ? `${flags.filter((f) => f.severity === 'critical').length} critical · ${flags.length} total`
            : 'nothing outstanding'}
        />
        <FlagPanel flags={flags} />
      </section>

      {/* ── Projects ──────────────────────────────────────────── */}
      <section style={s.section}>
        <SectionHead
          title="Projects"
          aside={projectTotals?.active
            ? `${projectTotals.active} active · ${formatHours(projectTotals.logged)}h logged of ${formatHours(projectTotals.promised)}h promised`
            : `${projects.length} on record`}
        />
        {!projects.length ? (
          <div style={s.empty}>
            No projects for this customer.{' '}
            {canWrite ? 'Create one to start tracking delivery, work items and hours.' : ''}
          </div>
        ) : (
          <table style={s.table} aria-label="Projects for this customer">
            <thead>
              <tr>
                <th scope="col" style={s.th}>Project</th>
                <th scope="col" style={s.th}>Phase</th>
                <th scope="col" style={s.th}>Status</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Open</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Hours</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Hours eff</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Target</th>
                <th scope="col" style={s.th}>Owner</th>
              </tr>
            </thead>
            <tbody>
              {[...projects].sort(compareProjects).map((p) => {
                const eff = hoursEfficiency(p.promisedHours, p.loggedHours);
                return (
                  <tr key={p.projectId} className="tk-row" style={s.rowClickable}>
                    <td style={{ ...s.td, fontWeight: 600 }}>
                      <a href={`#/projects/${encodeURIComponent(p.projectId)}`} className="tk-cellLink tk-focus">
                        {p.projectName}
                      </a>
                    </td>
                    <td style={s.td}>{p.phase}</td>
                    <td style={s.td}><StatusChip status={p.status} /></td>
                    <td style={{ ...s.td, ...s.tdNum }}>
                      {p.openItems}
                      {p.overdueItems > 0 && <div style={s.dueLate}>{p.overdueItems} late</div>}
                    </td>
                    <td style={{ ...s.td, ...s.tdNum }}>
                      {formatHours(p.loggedHours)} / {formatHours(p.promisedHours)}
                    </td>
                    <td style={{ ...s.td, ...s.tdNum }}>
                      <span style={tone[ratingTone(eff)]}>{formatRatio(eff)}</span>
                    </td>
                    <td style={{ ...s.td, ...s.tdNum }}>{p.targetDate ?? <span style={s.muted}>—</span>}</td>
                    <td style={{ ...s.td, ...s.mono }}>{p.owner ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── What they've told us ──────────────────────────────── */}
      <SignalsPanel signals={data.signals} latest={signalSummary} />

      {/* ── Call feedback ─────────────────────────────────────── */}
      <FeedbackPanel audits={data.audits} summary={auditSummary} caveat={caveat} />

      {/* ── Timeline ──────────────────────────────────────────── */}
      <section style={s.section}>
        <SectionHead
          title="Timeline"
          aside={`${timeline.length} event${timeline.length === 1 ? '' : 's'} across ${
            new Set(timeline.map((t) => t.kind)).size
          } sources`}
        />
        {/* Why calls, billed sessions and audits appear as separate rows on the same
            day is explained in the Timeline.jsx header comment. */}
        <Timeline
          timeline={timeline}
          transcripts={transcripts}
          onLoadTranscripts={loadTranscripts}
          transcriptState={transcriptState}
        />
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
        <a
          href={`#/call-prep/account/${encodeURIComponent(customer.accountRecordId)}`}
          className="tk-focus"
          style={{ ...s.secondary, textDecoration: 'none', display: 'inline-block' }}
        >
          Pre-call brief
        </a>
        <button className="tk-focus" style={s.chip} onClick={load}>Refresh</button>
      </div>
    </div>
  );
}
