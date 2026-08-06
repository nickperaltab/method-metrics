// Projects — the PS delivery board. Route: #/projects
//
// Three views over the same rows, because the same data answers three different
// questions: "what should I do next" (board), "how is this customer doing"
// (by account), "how is the team doing" (by rep). Ranked attention-first
// throughout, not by recency.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '../contexts/UserContext';
import {
  PROJECT_PHASES,
  PROJECT_STATUSES,
  compareProjects,
  summarizeProjects,
  phaseProgress,
  isComplete,
  localToday,
} from '../lib/projects';
import {
  accountRollup,
  repRollup,
  hoursEfficiency,
  deliveryReliability,
  formatHours,
  formatRatio,
  ratingTone,
} from '../lib/efficiency';
import { listProjects, canWrite, resetSampleData } from '../lib/projectsStore';
import { consultantPatternFromEmail } from '../lib/psOverview';
import {
  fetchAccountActivity,
  fetchAccountEscalations,
  accountFlagSummary,
  actorLabel,
} from '../lib/customer';
import { s, tone, Stat, StatusChip, Bar, formatDue, TrackerStyles } from '../components/projects/ui';
import { FlagBadges, LastActivity } from '../components/customer/Flags';

// Sentinels for the selects — a real phase or owner name can't collide.
const FILTER_ALL = '__all__';
const OWNER_MINE = '__mine__';

const VIEWS = [
  { key: 'board', label: 'Board' },
  { key: 'account', label: 'By customer' },
  { key: 'rep', label: 'By owner' },
];

function Eff({ ratio }) {
  return <span style={tone[ratingTone(ratio)]}>{formatRatio(ratio)}</span>;
}

export default function Projects() {
  const { currentUser } = useUser();
  const email = currentUser?.email ?? null;
  const todayIso = useMemo(() => localToday(), []);

  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('board');
  const [statusFilter, setStatusFilter] = useState('open');
  const [phaseFilter, setPhaseFilter] = useState(FILTER_ALL);
  const [ownerFilter, setOwnerFilter] = useState(OWNER_MINE);

  const load = useCallback(() => {
    setError('');
    return listProjects()
      .then(setProjects)
      .catch((e) => setError(e?.message || String(e)));
  }, []);

  useEffect(() => { load(); }, [load]);

  // "Mine" reuses the call-prep book heuristic: consultant names in PS data are
  // inconsistent ("Brandon Saltzman" vs "B. Saltzman"), so match first-initial +
  // last name off the signed-in address instead of an equality.
  const minePattern = useMemo(() => {
    const p = consultantPatternFromEmail(email);
    return p ? new RegExp(p) : null;
  }, [email]);

  const owners = useMemo(() => {
    if (!projects) return [];
    return [...new Set(projects.map((p) => p.owner).filter(Boolean))].sort();
  }, [projects]);

  const visible = useMemo(() => {
    if (!projects) return [];
    return projects.filter((p) => {
      if (statusFilter === 'open' && isComplete(p)) return false;
      if (statusFilter !== 'open' && statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (phaseFilter !== FILTER_ALL && p.phase !== phaseFilter) return false;
      if (ownerFilter === OWNER_MINE) {
        return minePattern ? minePattern.test(String(p.owner ?? '').toLowerCase()) : true;
      }
      if (ownerFilter !== FILTER_ALL) return p.owner === ownerFilter;
      return true;
    });
  }, [projects, statusFilter, phaseFilter, ownerFilter, minePattern]);

  const sorted = useMemo(() => [...visible].sort(compareProjects), [visible]);
  const stats = useMemo(() => (projects ? summarizeProjects(visible, todayIso) : null), [projects, visible, todayIso]);
  const totals = useMemo(() => {
    const promised = visible.reduce((sum, p) => sum + p.promisedHours, 0);
    const logged = visible.reduce((sum, p) => sum + p.loggedHours, 0);
    const promisedTotal = visible.reduce((sum, p) => sum + p.promisedTotal, 0);
    const onTime = visible.reduce((sum, p) => sum + p.promisedOnTime, 0);
    return {
      promised,
      logged,
      efficiency: hoursEfficiency(promised, logged),
      reliability: deliveryReliability(promisedTotal, onTime),
    };
  }, [visible]);

  const accounts = useMemo(() => accountRollup(visible), [visible]);
  const reps = useMemo(() => repRollup(visible), [visible]);

  // Last-activity and escalation state for the accounts on screen. Two batched
  // queries for the whole list rather than N+1 per account, and only fetched for
  // the account view — the board and rep views don't show them.
  const accountIds = useMemo(
    () => accounts.map((a) => a.accountRecordId).filter((id) => Number.isFinite(id)),
    [accounts]
  );
  const idKey = accountIds.join(',');
  const [indicators, setIndicators] = useState({ activity: new Map(), escalation: new Map() });
  const [indicatorNote, setIndicatorNote] = useState('');

  useEffect(() => {
    if (view !== 'account' || !accountIds.length) return undefined;
    let cancelled = false;
    setIndicatorNote('');
    Promise.allSettled([fetchAccountActivity(accountIds), fetchAccountEscalations(accountIds)])
      .then(([activity, escalation]) => {
        if (cancelled) return;
        setIndicators({
          activity: activity.status === 'fulfilled' ? activity.value : new Map(),
          escalation: escalation.status === 'fulfilled' ? escalation.value : new Map(),
        });
        const failed = [activity, escalation].filter((r) => r.status === 'rejected');
        if (failed.length) {
          // The exception text goes to the console, not the banner: it's unbounded,
          // exposes internals, and there's nothing a consultant can do with it.
          console.warn('[projects] indicator fetch failed', failed.map((f) => f.reason));
          const what = failed.length === 2 ? 'last activity or flags'
            : activity.status === 'rejected' ? 'last activity' : 'flags';
          setIndicatorNote(`Couldn’t load ${what}. Try refreshing.`);
        }
      });
    return () => { cancelled = true; };
    // Keyed on idKey (the joined id string) rather than the accountIds array, so a
    // re-render that produces an equal-but-new array doesn't refetch.
  }, [view, idKey, accountIds]);

  // Wipes every local edit the banner directly above this button just described.
  async function onReset() {
    if (!window.confirm('Reset sample data? This clears your local edits.')) return;
    await resetSampleData();
    await load();
  }

  if (error) {
    // `npm run dev:mock` is the developer path and is documented in
    // docs/ps-project-tracker.md — not something to show a consultant.
    const missingStore = /BQ 40[34]|Not found: Table/.test(error);
    if (!missingStore) console.error('[projects] load failed', error);
    return (
      <div style={s.wrap}>
        <TrackerStyles />
        <h1 style={s.title}>Projects</h1>
        <div style={s.error}>
          {missingStore
            ? 'No projects data source is set up yet.'
            : 'Couldn’t load projects. Try again shortly.'}
        </div>
      </div>
    );
  }

  if (!projects) return <div style={s.wrap}><div style={s.note}>Loading projects…</div></div>;

  return (
    <div style={s.wrap}>
      <TrackerStyles />
      <div style={s.head}>
        <h1 style={s.title}>Projects</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={s.mono}>{todayIso}</span>
          {canWrite && (
            <a href="#/projects/new" className="tk-focus" style={{ ...s.primary, textDecoration: 'none', display: 'inline-block' }}>
              + New project
            </a>
          )}
        </div>
      </div>
      {/* Ranked worst-first so the top of the list is the day's work rather than the
          most recently touched account. */}
      <p style={s.sub}>
        Delivery work across your customers, ranked worst-first: blocked, then at risk, then most
        overdue.
      </p>

      {canWrite && (
        <div style={s.banner}>
          <strong>Sample data.</strong> Edits save in your browser only; nothing is shared.{' '}
          <button className="tk-focus" style={{ ...s.chip, marginLeft: 4 }} onClick={onReset}>
            Reset sample data
          </button>
        </div>
      )}

      <div style={s.stats}>
        <Stat label="Active" value={stats.active} />
        <Stat label="Needs attention" value={stats.needsAttention} alert={stats.needsAttention > 0} />
        <Stat label="Open items" value={stats.openItems} sub={stats.overdueItems ? `${stats.overdueItems} overdue` : null} alert={stats.overdueItems > 0} />
        <Stat
          label="Hours efficiency"
          value={formatRatio(totals.efficiency)}
          sub={`${formatHours(totals.promised)}h promised · ${formatHours(totals.logged)}h logged`}
        />
        <Stat label="Delivery reliability" value={formatRatio(totals.reliability)} sub="promised items on time" />
        <Stat label="Past target" value={stats.overdueTargets} alert={stats.overdueTargets > 0} />
      </div>

      <div style={s.controls}>
        {VIEWS.map((v) => (
          <button key={v.key} style={view === v.key ? s.chipOn : s.chip} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
        <span style={{ width: 16 }} />
        <button style={statusFilter === 'open' ? s.chipOn : s.chip} onClick={() => setStatusFilter('open')}>Open</button>
        {PROJECT_STATUSES.map((st) => (
          <button key={st} style={statusFilter === st ? s.chipOn : s.chip} onClick={() => setStatusFilter(st)}>{st}</button>
        ))}
        <button style={statusFilter === 'all' ? s.chipOn : s.chip} onClick={() => setStatusFilter('all')}>All</button>

        <span style={s.spacer} />

        <select style={s.select} value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
          <option value={FILTER_ALL}>All phases</option>
          {PROJECT_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={s.select} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value={OWNER_MINE}>Mine</option>
          <option value={FILTER_ALL}>Everyone</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {!visible.length ? (
        <div style={s.empty}>
          No projects match these filters.
          {/* "Mine" matches first-initial + surname off the sign-in address, so a
              name variant in the data can miss. */}
          {ownerFilter === OWNER_MINE && ' Try Everyone instead of Mine.'}
        </div>
      ) : view === 'board' ? (
        <BoardView projects={sorted} todayIso={todayIso} />
      ) : view === 'account' ? (
        <AccountView
          accounts={accounts}
          todayIso={todayIso}
          indicators={indicators}
          note={indicatorNote}
        />
      ) : (
        <RepView reps={reps} />
      )}
    </div>
  );
}

function BoardView({ projects, todayIso }) {
  return (
    <table style={s.table} aria-label="Projects board">
      <thead>
        <tr>
          <th scope="col" style={s.th}>Customer / project</th>
          <th scope="col" style={s.th}>Phase</th>
          <th scope="col" style={s.th}>Status</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Items</th>
          <th scope="col" style={s.th}>Next action</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Target</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Hours</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Hours eff</th>
          <th scope="col" style={s.th}>Owner</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => {
          const target = formatDue(p.targetDate, todayIso);
          const nextDue = formatDue(p.nextActionDue, todayIso);
          const efficiency = hoursEfficiency(p.promisedHours, p.loggedHours);
          const overBudget = p.hoursBudget != null && p.loggedHours > p.hoursBudget * 0.9;
          const href = `#/projects/${encodeURIComponent(p.projectId)}`;
          return (
            // The row stays clickable for the mouse, but the real control is the link
            // in the first cell: an onClick on <tr> is no tab stop, no Enter key and
            // invisible to screen readers.
            <tr key={p.projectId} className="tk-row" style={s.rowClickable}>
              <td style={s.td}>
                <div style={{ fontWeight: 600 }}>
                  <a href={href} className="tk-cellLink tk-focus">
                    {p.accountName ?? `#${p.accountRecordId}`}
                  </a>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{p.projectName}</div>
              </td>
              <td style={s.td}>
                <div style={{ fontSize: 13 }}>{p.phase}</div>
                <Bar fraction={phaseProgress(p)} warn={p.status === 'Blocked' || p.status === 'At risk'} />
              </td>
              <td style={s.td}><StatusChip status={p.status} /></td>
              <td style={{ ...s.td, ...s.tdNum }}>
                {p.openItems || <span style={s.muted}>0</span>}
                {p.overdueItems > 0 && <div style={s.dueLate}>{p.overdueItems} late</div>}
              </td>
              <td style={s.td}>
                <div style={{ fontSize: 13, color: '#374151', maxWidth: 300, lineHeight: 1.4 }}>
                  {p.nextAction ?? <span style={s.muted}>—</span>}
                </div>
                {p.nextActionDue && <div style={nextDue.late ? s.dueLate : s.due}>{nextDue.text}</div>}
              </td>
              <td style={{ ...s.td, ...s.tdNum }}>
                <div>{p.targetDate ?? <span style={s.muted}>—</span>}</div>
                {p.targetDate && !isComplete(p) && (
                  <div style={target.late ? s.dueLate : s.due}>{target.text}</div>
                )}
              </td>
              <td style={{ ...s.td, ...s.tdNum }}>
                <div>{formatHours(p.loggedHours)} / {formatHours(p.promisedHours)}</div>
                {p.hoursBudget != null && (
                  <Bar fraction={p.loggedHours / p.hoursBudget} warn={overBudget} />
                )}
              </td>
              <td style={{ ...s.td, ...s.tdNum }}><Eff ratio={efficiency} /></td>
              <td style={{ ...s.td, ...s.mono }}>{p.owner ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AccountView({ accounts, todayIso, indicators, note }) {
  return (
    <div style={s.cardList}>
      {note && <div style={s.banner}>{note}</div>}
      {accounts.map((a) => {
        const activity = indicators.activity.get(a.accountRecordId) ?? null;
        const escalation = indicators.escalation.get(a.accountRecordId) ?? null;
        const flags = accountFlagSummary({ rollup: a, activity, escalation, todayIso });
        return (
        <div key={a.accountRecordId} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
            <div>
              <a
                href={`#/accounts/${encodeURIComponent(a.accountRecordId)}`}
                style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a', textDecoration: 'none' }}
              >{a.accountName ?? `#${a.accountRecordId}`}</a>
              <div style={s.monoSmall}>
                {a.projects} project{a.projects === 1 ? '' : 's'} · {a.openItems} open
                {a.overdueItems > 0 ? ` · ${a.overdueItems} overdue` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                Last activity:{' '}
                <LastActivity activity={activity} actorLabel={actorLabel} todayIso={todayIso} />
              </div>
              <div style={{ marginTop: 8 }}><FlagBadges flags={flags} /></div>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={s.statLabel}>Hours eff</div>
                <Eff ratio={a.hoursEfficiency} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={s.statLabel}>Reliability</div>
                <Eff ratio={a.deliveryReliability} />
              </div>
              <a href={`#/accounts/${encodeURIComponent(a.accountRecordId)}`} style={s.link}>
                Customer →
              </a>
            </div>
          </div>

          {/* This table shipped with no <thead> at all — eight anonymous columns. */}
          <table style={{ ...s.table, marginTop: 12 }} aria-label={`Projects for ${a.accountName ?? a.accountRecordId}`}>
            <thead>
              <tr>
                <th scope="col" style={s.th}>Project</th>
                <th scope="col" style={s.th}>Phase</th>
                <th scope="col" style={s.th}>Status</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Items</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Hours</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Hours eff</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Target</th>
                <th scope="col" style={s.th}>Owner</th>
              </tr>
            </thead>
            <tbody>
              {[...a.projectList].sort(compareProjects).map((p) => {
                const target = formatDue(p.targetDate, todayIso);
                return (
                  <tr key={p.projectId} className="tk-row" style={s.rowClickable}>
                    <td style={{ ...s.td, fontWeight: 600 }}>
                      <a href={`#/projects/${encodeURIComponent(p.projectId)}`} className="tk-cellLink tk-focus">
                        {p.projectName}
                      </a>
                    </td>
                    <td style={s.td}>{p.phase}</td>
                    <td style={s.td}><StatusChip status={p.status} /></td>
                    <td style={{ ...s.td, ...s.tdNum }}>{p.openItems} open</td>
                    <td style={{ ...s.td, ...s.tdNum }}>
                      {formatHours(p.loggedHours)}h / {formatHours(p.promisedHours)}h
                    </td>
                    <td style={{ ...s.td, ...s.tdNum }}>
                      <Eff ratio={hoursEfficiency(p.promisedHours, p.loggedHours)} />
                    </td>
                    <td style={{ ...s.td, ...s.tdNum }}>
                      {/* The board shows target as date + "3d late"; this view showed a
                          red date only, so lateness was colour-only here. */}
                      {p.targetDate ? (
                        <>
                          <div>{p.targetDate}</div>
                          {!isComplete(p) && (
                            <div style={target.late ? s.dueLate : s.due}>{target.text}</div>
                          )}
                        </>
                      ) : <span style={s.muted}>—</span>}
                    </td>
                    <td style={{ ...s.td, ...s.mono }}>{p.owner ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        );
      })}
    </div>
  );
}

function RepView({ reps }) {
  return (
    <table style={s.table} aria-label="Projects by owner">
      <thead>
        <tr>
          <th scope="col" style={s.th}>Owner</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Projects</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>At risk</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Open</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Overdue</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Promised h</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Logged h</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Billable h</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Hours eff</th>
          <th scope="col" style={{ ...s.th, ...s.thNum }}>Reliability</th>
        </tr>
      </thead>
      <tbody>
        {reps.map((r) => (
          <tr key={r.rep}>
            <td style={{ ...s.td, fontWeight: 600 }}>
              {r.rep}
              <div style={{ marginTop: 6 }}>
                {[...r.projectList].sort(compareProjects).slice(0, 3).map((p) => (
                  // Links, not buttons: these navigate, so middle-click and
                  // open-in-new-tab should work and AT should announce a link.
                  <a
                    key={p.projectId}
                    href={`#/projects/${encodeURIComponent(p.projectId)}`}
                    className="tk-focus"
                    style={{ ...s.chip, marginRight: 6, marginBottom: 4, display: 'inline-block', textDecoration: 'none' }}
                  >
                    {p.accountName}
                  </a>
                ))}
                {r.projectList.length > 3 && (
                  <span style={s.monoSmall}>+{r.projectList.length - 3} more</span>
                )}
              </div>
            </td>
            <td style={{ ...s.td, ...s.tdNum }}>{r.activeProjects}</td>
            <td style={{ ...s.td, ...s.tdNum }}>
              {r.atRisk ? <span style={s.dueLate}>{r.atRisk}</span> : <span style={s.muted}>0</span>}
            </td>
            <td style={{ ...s.td, ...s.tdNum }}>{r.openItems}</td>
            <td style={{ ...s.td, ...s.tdNum }}>
              {r.overdueItems ? <span style={s.dueLate}>{r.overdueItems}</span> : <span style={s.muted}>0</span>}
            </td>
            <td style={{ ...s.td, ...s.tdNum }}>{formatHours(r.promisedHours)}h</td>
            <td style={{ ...s.td, ...s.tdNum }}>{formatHours(r.loggedHours)}h</td>
            <td style={{ ...s.td, ...s.tdNum }}>{formatHours(r.billableHours)}h</td>
            <td style={{ ...s.td, ...s.tdNum }}><Eff ratio={r.hoursEfficiency} /></td>
            <td style={{ ...s.td, ...s.tdNum }}><Eff ratio={r.deliveryReliability} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
