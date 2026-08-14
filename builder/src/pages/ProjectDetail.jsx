// Project detail — Route: #/projects/:projectId
//
// Ordered the way you'd brief someone: state → next action → risk → lifecycle →
// delivered-vs-promised → open work → the work log → history.
//
// The work log is the sub-layer under a project: one entry per session, hours
// plus a markdown write-up. It's what makes the efficiency numbers real — every
// logged hour is attributable to an entry you can read.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import {
  ITEM_TYPES,
  phaseTimeline,
  sortItems,
  isOverdue,
  isComplete,
  localToday,
  PROJECT_PHASES,
} from '../lib/projects';
import { formatHours } from '../lib/efficiency';
import {
  getProjectBundle,
  listReps,
  canWrite,
  updateItem,
  deleteWork,
} from '../lib/projectsStore';
import { markdownToText } from '../lib/markdown';
import MarkdownBody from '../components/projects/MarkdownBody';
import EfficiencyPanel from '../components/projects/EfficiencyPanel';
import WorkLogForm from '../components/projects/WorkLogForm';
import ItemForm from '../components/projects/ItemForm';
import { s, tone, Meta, SectionHead, StatusChip, Tag, formatDue, TrackerStyles } from '../components/projects/ui';

const styles = {
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, marginTop: 12 },
  meta: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, margin: '24px 0 32px' },
  callout: { border: '1px solid #a7f3d0', background: '#ecfdf5', borderRadius: 8, padding: '14px 16px', marginBottom: 20 },
  calloutLate: { border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 8, padding: '14px 16px', marginBottom: 20 },
  calloutLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6,
  },
  calloutText: { fontSize: 15, color: '#1a1a1a', lineHeight: 1.45 },
  risk: { border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8, padding: '14px 16px', marginBottom: 32 },

  phases: { display: 'flex', alignItems: 'flex-start', marginBottom: 32 },
  phaseStep: { flex: 1, textAlign: 'center', position: 'relative' },
  dot: { width: 12, height: 12, borderRadius: 6, margin: '0 auto 8px', border: '2px solid #e2e5e9', background: '#fff' },
  dotDone: { width: 12, height: 12, borderRadius: 6, margin: '0 auto 8px', background: '#047857', border: '2px solid #047857' },
  dotCurrent: { width: 12, height: 12, borderRadius: 6, margin: '0 auto 8px', background: '#fff', border: '3px solid #047857' },
  rule: { position: 'absolute', top: 5, left: 0, right: 0, height: 2, background: '#e2e5e9', zIndex: 0 },
  ruleDone: { position: 'absolute', top: 5, left: 0, right: 0, height: 2, background: '#047857', zIndex: 0 },
  phaseName: { fontSize: 12, fontWeight: 600, color: '#374151' },
  // The phase name is content — it says which phases are still ahead — so it can't
  // sit at the decorative 1.91:1 it used to. The dot and rule carry "upcoming".
  phaseNameUpcoming: { fontSize: 12, fontWeight: 600, color: '#6b7280' },
  phaseDate: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#6b7280', marginTop: 3 },

  logEntry: { border: '1px solid #e2e5e9', borderRadius: 8, background: '#fff', padding: '14px 16px' },
  logHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  logTitle: { fontSize: 15, fontWeight: 600, color: '#1a1a1a' },
  logMeta: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280', marginTop: 3 },
  logPreview: { fontSize: 13, color: '#6b7280', marginTop: 8, lineHeight: 1.5 },
  logBody: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f1f3' },

  activityRow: { display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #f0f1f3' },
  activityDate: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280', width: 92, flexShrink: 0, paddingTop: 2 },
  itemNotes: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 1.45, maxWidth: 460 },
};

// Statuses that mean "someone has to do something", vs. merely parked.
const ACTION_STATUSES = new Set(['Ready for Follow-Up', 'Check Case Status', 'New Intake']);

/** Visible to screen readers, not on screen — for naming icon-only columns. */
const SR_ONLY = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden',
  clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
};

function PhaseTimeline({ project, events }) {
  const steps = useMemo(() => phaseTimeline(project, events), [project, events]);
  return (
    <div style={styles.phases}>
      {steps.map((step, i) => (
        <div key={step.phase} style={styles.phaseStep}>
          {i > 0 && <div style={step.state === 'upcoming' ? styles.rule : styles.ruleDone} />}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={
              step.state === 'done' ? styles.dotDone
                : step.state === 'current' ? styles.dotCurrent
                  : styles.dot
            } />
          </div>
          <div style={step.state === 'upcoming' ? styles.phaseNameUpcoming : styles.phaseName}>{step.phase}</div>
          <div style={styles.phaseDate}>{step.date ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectDetail() {
  const { projectId } = useParams();
  const { currentUser } = useUser();
  const todayIso = useMemo(() => localToday(), []);

  const [data, setData] = useState(null);
  const [reps, setReps] = useState([]);
  const [error, setError] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [typeFilter, setTypeFilter] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [showWorkForm, setShowWorkForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(() => {
    setError('');
    return getProjectBundle(projectId)
      .then(setData)
      .catch((e) => setError(e?.message || String(e)));
  }, [projectId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  useEffect(() => {
    if (!canWrite) return;
    listReps().then(setReps).catch(() => setReps([]));
  }, []);

  const items = useMemo(() => {
    if (!data) return [];
    return sortItems(data.items, todayIso).filter((i) => {
      if (openOnly && !i.isOpen) return false;
      if (typeFilter && i.itemType !== typeFilter) return false;
      return true;
    });
  }, [data, openOnly, typeFilter, todayIso]);

  function toggleExpanded(entryId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  async function onToggleDone(item) {
    // Reopening goes back to In Progress rather than the item's original status:
    // that history isn't stored, and guessing wrong is worse than a known state.
    await updateItem(item.itemId, { status: item.isOpen ? 'Done' : 'In Progress' });
    await load();
  }

  // Deleting an entry removes hours that feed the efficiency and reliability
  // numbers, so it silently rewrites the project's ratings. There is no undo.
  async function onDeleteEntry(entry) {
    const ok = window.confirm(
      `Delete this entry? ${formatHours(entry.hours)}h logged on ${entry.workDate} will be removed.`
    );
    if (!ok) return;
    await deleteWork(entry.entryId);
    await load();
  }

  if (error) {
    return <div style={s.wrap}><div style={s.error}>Couldn’t load this project: {error}</div></div>;
  }
  if (!data) return <div style={s.wrap}><div style={s.note}>Loading project…</div></div>;

  const { project, events, workLog } = data;
  if (!project) {
    return (
      <div style={s.wrap}>
        <a href="#/projects" className="tk-focus" style={s.back}>← Projects</a>
        <div style={s.error}>No project with id {projectId}.</div>
      </div>
    );
  }

  const target = formatDue(project.targetDate, todayIso);
  const nextDue = formatDue(project.nextActionDue, todayIso);
  const openCount = data.items.filter((i) => i.isOpen).length;
  const loggedThisMonth = workLog
    .filter((e) => (e.workDate ?? '').slice(0, 7) === todayIso.slice(0, 7))
    .reduce((sum, e) => sum + e.hours, 0);

  return (
    <div style={s.wrap}>
      <TrackerStyles />
      <a href="#/projects" className="tk-focus" style={s.back}>← Projects</a>

      <div style={styles.head}>
        <div>
          <h1 style={s.title}>{project.projectName}</h1>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
            <a
              href={`#/accounts/${encodeURIComponent(project.accountRecordId)}`}
              className="tk-focus"
              style={{ color: '#047857', textDecoration: 'underline', textUnderlineOffset: 2 }}
            >{project.accountName ?? `#${project.accountRecordId}`}</a>
            {' · '}{project.phase}{' · '}<span style={s.mono}>{project.owner ?? 'unassigned'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <StatusChip status={project.status} />
          <span style={s.mono}>{project.projectId}</span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {project.docLink && <a href={project.docLink} target="_blank" rel="noreferrer" style={s.link}>Doc →</a>}
            {project.jiraKey && <span style={s.mono}>{project.jiraKey}</span>}
            {canWrite && (
              <a
                href={`#/projects/${encodeURIComponent(project.projectId)}/edit`}
                className="tk-focus"
                style={{ ...s.secondary, textDecoration: 'none', display: 'inline-block' }}
              >
                Edit project
              </a>
            )}
          </div>
        </div>
      </div>

      <div style={styles.meta}>
        <Meta label="Kickoff" value={project.kickoffDate ?? '—'} />
        <Meta
          label={project.goLiveDate ? 'Went live' : 'Target'}
          value={project.goLiveDate ?? project.targetDate ?? '—'}
          sub={!project.goLiveDate && project.targetDate && !isComplete(project) ? target.text : null}
          subLate={target.late}
        />
        <Meta
          label="Hours logged"
          value={`${formatHours(project.loggedHours)}h`}
          sub={project.hoursBudget != null ? `of ${formatHours(project.hoursBudget)}h quoted` : null}
          subLate={project.hoursBudget != null && project.loggedHours > project.hoursBudget}
        />
        <Meta label="This month" value={`${formatHours(loggedThisMonth)}h`} sub={`${workLog.length} entr${workLog.length === 1 ? 'y' : 'ies'}`} />
        <Meta
          label="Open items"
          value={openCount}
          sub={project.overdueItems > 0 ? `${project.overdueItems} overdue` : null}
          subLate={project.overdueItems > 0}
        />
        <Meta
          label="Promised"
          value={project.promisedItems}
          sub={project.promisedItems > 0 ? 'outstanding' : null}
          subLate={project.promisedItems > 0}
        />
      </div>

      {project.nextAction && (
        <div style={nextDue.late ? styles.calloutLate : styles.callout}>
          <div style={{ ...styles.calloutLabel, color: nextDue.late ? '#b91c1c' : '#047857' }}>
            Next action{project.nextActionDue ? ` · ${nextDue.text}` : ''}
          </div>
          <div style={styles.calloutText}>{project.nextAction}</div>
        </div>
      )}

      {project.riskNote && (
        <div style={styles.risk}>
          <div style={{ ...styles.calloutLabel, color: '#b45309' }}>Risk</div>
          <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{project.riskNote}</div>
        </div>
      )}

      {/* ── Lifecycle ─────────────────────────────────────────── */}
      <section style={s.section}>
        <SectionHead title="Lifecycle" />
        <PhaseTimeline project={project} events={events} />
      </section>

      {/* ── Delivered vs promised ─────────────────────────────── */}
      <EfficiencyPanel project={project} items={data.items} workLog={workLog} />

      {/* ── Work items ────────────────────────────────────────── */}
      <section style={s.section}>
        <SectionHead
          title="Work items"
          aside={
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={s.mono}>{items.length} shown · overdue first</span>
              {canWrite && (
                <button style={s.secondary} onClick={() => { setShowItemForm((v) => !v); setEditingItemId(null); }}>
                  {showItemForm ? 'Close' : '+ New work item'}
                </button>
              )}
            </span>
          }
        />

        {showItemForm && (
          <ItemForm
            project={project}
            reps={reps}
            onSaved={async () => { setShowItemForm(false); await load(); }}
            onCancel={() => setShowItemForm(false)}
          />
        )}

        <div style={s.controls}>
          <button style={openOnly ? s.chipOn : s.chip} onClick={() => setOpenOnly(true)}>Open</button>
          <button style={!openOnly ? s.chipOn : s.chip} onClick={() => setOpenOnly(false)}>All</button>
          <span style={{ width: 12 }} />
          <button style={!typeFilter ? s.chipOn : s.chip} onClick={() => setTypeFilter(null)}>Any type</button>
          {ITEM_TYPES.map((t) => (
            <button
              key={t}
              style={typeFilter === t ? s.chipOn : s.chip}
              onClick={() => setTypeFilter(typeFilter === t ? null : t)}
            >{t}</button>
          ))}
        </div>

        {!items.length ? (
          // "Open" is the default filter, so a fully-delivered project hits this on
          // load — it needs to say which filter did it and offer a way out.
          <div style={s.empty}>
            No items match these filters.{' '}
            <button
              className="tk-focus"
              style={s.chip}
              onClick={() => { setOpenOnly(false); setTypeFilter(null); }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <table style={s.table} aria-label="Work items">
            <thead>
              <tr>
                <th scope="col" style={s.th}>Item</th>
                <th scope="col" style={s.th}>Type</th>
                <th scope="col" style={s.th}>Status</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Due</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Promised h</th>
                <th scope="col" style={s.th}>Owner</th>
                {/* The actions column was an empty <th>, so it was announced nameless. */}
                {canWrite && <th scope="col" style={s.th}><span style={SR_ONLY}>Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => {
                const late = isOverdue(i, todayIso);
                const due = formatDue(i.dueDate, todayIso);
                const cell = i.isOpen ? s.td : s.tdMuted;
                return (
                  <Fragment key={i.itemId}>
                    <tr>
                      <td style={cell}>
                        <div style={{ fontWeight: 600, textDecoration: i.isOpen ? 'none' : 'line-through' }}>
                          {i.title}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          {i.priority === 'High' && <Tag kind="bad">high</Tag>}
                          {i.isPromised && <Tag kind="warn">promised</Tag>}
                          {i.caseRef && <Tag>case {i.caseRef}</Tag>}
                        </div>
                        {i.notes && <div style={styles.itemNotes}>{i.notes}</div>}
                      </td>
                      <td style={cell}><Tag>{i.itemType}</Tag></td>
                      <td style={cell}>
                        <span style={ACTION_STATUSES.has(i.status) ? tone.warn : tone.neutral}>{i.status}</span>
                      </td>
                      <td style={{ ...cell, ...s.tdNum }}>
                        <div>{i.dueDate ?? <span style={s.muted}>—</span>}</div>
                        {i.isOpen && i.dueDate && <div style={late ? s.dueLate : s.due}>{due.text}</div>}
                        {!i.isOpen && i.closedDate && <div style={s.due}>closed {i.closedDate}</div>}
                      </td>
                      <td style={{ ...cell, ...s.tdNum }}>
                        {i.estimateHours == null ? <span style={s.muted}>—</span> : `${formatHours(i.estimateHours)}h`}
                      </td>
                      <td style={{ ...cell, ...s.mono }}>{i.owner ?? '—'}</td>
                      {canWrite && (
                        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                          <button style={s.chip} onClick={() => onToggleDone(i)}>
                            {i.isOpen ? 'Mark done' : 'Reopen'}
                          </button>{' '}
                          <button
                            style={s.chip}
                            onClick={() => { setEditingItemId(editingItemId === i.itemId ? null : i.itemId); setShowItemForm(false); }}
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                    {editingItemId === i.itemId && (
                      <tr>
                        <td colSpan={canWrite ? 7 : 6} style={{ padding: '12px 0' }}>
                          <ItemForm
                            project={project}
                            item={i}
                            reps={reps}
                            onSaved={async () => { setEditingItemId(null); await load(); }}
                            onCancel={() => setEditingItemId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* ── Work log ──────────────────────────────────────────── */}
      <section style={s.section}>
        <SectionHead
          title="Work log"
          aside={
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={s.mono}>
                {formatHours(project.loggedHours)}h total · {formatHours(project.billableHours)}h billable
              </span>
              {canWrite && (
                <button style={s.primary} onClick={() => { setShowWorkForm((v) => !v); setEditingEntryId(null); }}>
                  {showWorkForm ? 'Close' : '+ Log work'}
                </button>
              )}
            </span>
          }
        />

        {showWorkForm && (
          <WorkLogForm
            project={project}
            items={data.items}
            defaultAuthor={currentUser?.name ?? project.owner}
            onSaved={async () => { setShowWorkForm(false); await load(); }}
            onCancel={() => setShowWorkForm(false)}
          />
        )}

        {!workLog.length ? (
          // Entries are hours plus a write-up, and they're what the
          // delivered-vs-promised numbers are built from.
          <div style={s.empty}>No work logged yet.</div>
        ) : (
          <div style={s.cardList}>
            {workLog.map((entry) => {
              const item = data.items.find((i) => i.itemId === entry.itemId);
              const isOpen = expanded.has(entry.entryId);
              if (editingEntryId === entry.entryId) {
                return (
                  <WorkLogForm
                    key={entry.entryId}
                    project={project}
                    items={data.items}
                    entry={entry}
                    onSaved={async () => { setEditingEntryId(null); await load(); }}
                    onCancel={() => setEditingEntryId(null)}
                  />
                );
              }
              return (
                <div key={entry.entryId} style={styles.logEntry}>
                  <div style={styles.logHead}>
                    <div>
                      <div style={styles.logTitle}>{entry.summary}</div>
                      <div style={styles.logMeta}>
                        {entry.workDate} · {formatHours(entry.hours)}h · {entry.author}
                        {item ? ` · ${item.title}` : ' · project-level'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag kind={entry.billable === 'Billable' ? 'good' : 'neutral'}>{entry.billable}</Tag>
                      {entry.notesMd && (
                        <button style={s.chip} onClick={() => toggleExpanded(entry.entryId)}>
                          {isOpen ? 'Hide notes' : 'Show notes'}
                        </button>
                      )}
                      {canWrite && (
                        <>
                          <button style={s.chip} onClick={() => { setEditingEntryId(entry.entryId); setShowWorkForm(false); }}>
                            Edit
                          </button>
                          <button style={s.danger} onClick={() => onDeleteEntry(entry)}>Delete</button>
                        </>
                      )}
                    </div>
                  </div>

                  {entry.notesMd && !isOpen && (
                    <div style={styles.logPreview}>{markdownToText(entry.notesMd)}</div>
                  )}
                  {entry.notesMd && isOpen && (
                    <div style={styles.logBody}><MarkdownBody markdown={entry.notesMd} /></div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Activity ──────────────────────────────────────────── */}
      <section style={s.section}>
        <SectionHead title="Activity" aside={`${events.length} entr${events.length === 1 ? 'y' : 'ies'}`} />
        {!events.length ? (
          <div style={s.empty}>No activity yet.</div>
        ) : (
          <div>
            {events.map((e) => (
              <div key={e.eventId} style={styles.activityRow}>
                <div style={styles.activityDate}>{e.date}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Tag kind={e.type === 'Handoff' ? 'warn' : 'neutral'}>{e.type}</Tag>
                    <span style={s.mono}>{e.author}</span>
                    {e.toPhase && PROJECT_PHASES.includes(e.toPhase) && <Tag kind="good">{e.toPhase}</Tag>}
                  </div>
                  <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{e.summary}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
        <a
          href={`#/accounts/${encodeURIComponent(project.accountRecordId)}`}
          className="tk-focus"
          style={{ ...s.secondary, textDecoration: 'none', display: 'inline-block' }}
        >
          Customer page
        </a>
        <a
          href={`#/call-prep/account/${encodeURIComponent(project.accountRecordId)}`}
          className="tk-focus"
          style={{ ...s.chip, textDecoration: 'none', display: 'inline-block' }}
        >
          Pre-call brief
        </a>
      </div>
    </div>
  );
}
