// The customer timeline: every call, prep, audit, billed session, case, work-log
// entry and project event on one reverse-chronological spine, grouped by day.
//
// Grouping by day is what makes the multi-source merge readable: a Zoom call, the
// time entry billed for it, and the audit scored from it are three rows from
// three systems describing one hour of work. They are not deduplicated — each
// carries something the others don't — so the day header is what tells you
// they're the same event seen three ways.

import { useMemo, useState } from 'react';
import { KIND_LABELS, TIMELINE_KINDS, groupTimelineByDay, countByKind } from '../../lib/customer';
import MarkdownBody from '../projects/MarkdownBody';
import { s, tone, Tag } from '../projects/ui';

const styles = {
  day: { display: 'flex', gap: 16, marginBottom: 4 },
  dayDate: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: '#374151',
    width: 92, flexShrink: 0, paddingTop: 14, textAlign: 'right',
  },
  dayItems: { flex: 1, minWidth: 0, borderLeft: '2px solid #e2e5e9', paddingLeft: 16, paddingBottom: 12 },
  entry: {
    border: '1px solid #e2e5e9', borderRadius: 8, background: '#fff',
    padding: '12px 14px', marginBottom: 8,
  },
  entryHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 14, fontWeight: 600, color: '#1a1a1a', lineHeight: 1.35 },
  subtitle: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280', marginTop: 3 },
  right: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  detail: { marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f1f3' },
  block: { marginBottom: 12 },
  blockLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4,
  },
  text: { fontSize: 13, color: '#374151', lineHeight: 1.55, whiteSpace: 'pre-wrap' },
  transcript: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#374151', lineHeight: 1.6,
    background: '#f6f7f8', border: '1px solid #eceef0', borderRadius: 6, padding: '10px 12px',
    whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto',
  },
  bullets: { margin: '0 0 0 18px', padding: 0, fontSize: 13, color: '#374151', lineHeight: 1.6 },
  sections: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  sectionPill: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, border: '1px solid #e2e5e9',
    borderRadius: 4, padding: '3px 8px', color: '#374151', background: '#fff',
  },
};

// Source kind is a category, not a health signal, so it gets its own desaturated
// ramp. Reusing the green/amber/red tone palette here made a `case` chip read as an
// alarm when it only meant "this row came from the cases table" — red/amber/green
// stay reserved for health throughout the tracker.
const KIND_STYLE = {
  call: '#1d4ed8',
  prep: '#6d28d9',
  audit: '#0f766e',
  session: '#57534e',
  case: '#9d174d',
  work: '#3f6212',
  project: '#4b5563',
};

function kindChip(kind) {
  return {
    display: 'inline-block', fontSize: 11, fontWeight: 600, borderRadius: 4,
    padding: '2px 8px', marginRight: 8, whiteSpace: 'nowrap',
    color: KIND_STYLE[kind] ?? '#4b5563',
    background: '#f6f7f8',
    border: '1px solid #e5e7eb',
  };
}

const KIND_SHORT = {
  call: 'call',
  prep: 'prep',
  audit: 'audit',
  session: 'session',
  case: 'case',
  work: 'work log',
  project: 'project',
};

/** 0–100 score → coloured pill. Audit percentages are not fractions. */
function scorePill(pct) {
  const kind = pct == null ? 'neutral' : pct >= 80 ? 'good' : pct >= 65 ? 'warn' : 'bad';
  return <span style={tone[kind]}>{pct == null ? '—' : `${Math.round(pct)}%`}</span>;
}

function Block({ label, children }) {
  if (!children) return null;
  return (
    <div style={styles.block}>
      <div style={styles.blockLabel}>{label}</div>
      {children}
    </div>
  );
}

const Text = ({ children }) => (children ? <div style={styles.text}>{children}</div> : null);

/**
 * Transcripts load on demand. The call index carries no transcript column
 * because selecting one scans the whole 291 MB conversations table (see
 * lib/customer.js) — so the first "Load transcript" click fetches every excerpt
 * for the account at once and the rest are then instant.
 */
function CallDetail({ item, transcripts, onLoadTranscripts, transcriptState }) {
  const { call, summary } = item;
  const transcript = transcripts?.get(call.conversationId);

  return (
    <>
      {summary ? (
        <Block label="AI summary">
          <Text>{summary.summaryText}</Text>
        </Block>
      ) : (
        <div style={{ ...s.hint, marginBottom: 12 }}>No summary for this call.</div>
      )}

      {transcript ? (
        <Block label="Transcript excerpt">
          {transcript.transcriptExcerpt
            ? <div style={styles.transcript}>{transcript.transcriptExcerpt}</div>
            : <Text>No transcript for this call.</Text>}
        </Block>
      ) : transcriptState === 'loading' ? (
        <Text>Loading transcripts…</Text>
      ) : transcriptState === 'error' ? (
        // Keep a way back: the fetch is retryable, so an error must not remove the
        // only control that can retry it.
        <>
          <button className="tk-focus" style={s.chip} onClick={onLoadTranscripts}>Try again</button>
          <div style={{ ...s.hint, marginTop: 8 }}>Couldn’t load transcripts.</div>
        </>
      ) : transcriptState === 'loaded' ? (
        <Text>No transcript for this call.</Text>
      ) : (
        <>
          <button className="tk-focus" style={s.chip} onClick={onLoadTranscripts}>Load transcripts</button>
          <div style={{ ...s.hint, marginTop: 8 }}>
            Loads transcripts for every call on this account.
          </div>
        </>
      )}
    </>
  );
}

function PrepDetail({ item }) {
  const { prep } = item;
  return (
    <>
      {prep.top3.length > 0 && (
        <Block label="Top 3">
          <ul style={styles.bullets}>
            {prep.top3.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </Block>
      )}
      <Block label="Why today"><Text>{prep.whyToday}</Text></Block>
      <Block label="Business context"><Text>{prep.businessContext}</Text></Block>
      {prep.contactName && (
        <Block label="Contact">
          <Text>{[prep.contactName, prep.contactEmail].filter(Boolean).join(' · ')}</Text>
        </Block>
      )}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {prep.depEnrolled && <Tag kind="good">DEP</Tag>}
        {prep.syncFailCount > 0 && <Tag kind="bad">sync failing ({prep.syncFailCount})</Tag>}
        {prep.casesOpenCount > 0 && <Tag kind="warn">{prep.casesOpenCount} open cases</Tag>}
        {prep.docLink && <a href={prep.docLink} target="_blank" rel="noreferrer" style={s.link}>Prep doc →</a>}
      </div>
      {/* Why the agenda is often missing (brief_content stopped 2026-07-16) is in
          docs/ps-customer-page.md — not something a consultant can act on. */}
      {!prep.top3.length && !prep.whyToday && (
        <div style={s.hint}>No agenda captured for this prep.</div>
      )}
    </>
  );
}

function AuditDetail({ item }) {
  const { audit } = item;
  return (
    <>
      <div style={styles.sections}>
        {audit.sections.map((section) => (
          <span key={section.label} style={styles.sectionPill}>
            {section.label} {Math.round(section.pct)}%
          </span>
        ))}
      </div>
      {audit.escalationRisk && (
        <Block label="Escalation risk">
          <div style={{ ...styles.text, color: '#b91c1c' }}>{audit.escalationEvidence}</div>
        </Block>
      )}
      <Block label="Highlights"><Text>{audit.highlights}</Text></Block>
      <Block label="Insights"><Text>{audit.insights}</Text></Block>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {audit.contextFlags.map((flag) => <Tag key={flag}>{flag}</Tag>)}
        {audit.problemsCount != null && (
          <Tag kind={audit.unactionedCount > 0 ? 'warn' : 'neutral'}>
            {audit.problemsCount} problems · {audit.unactionedCount} unactioned
          </Tag>
        )}
        {audit.ttHoursAfterCall != null && <Tag>{audit.ttHoursAfterCall}h billed after</Tag>}
      </div>
    </>
  );
}

function SessionDetail({ item }) {
  const { session } = item;
  return (
    <>
      <Block label="Consultant write-up">
        {session.notes ? <Text>{session.notes}</Text> : <Text>No write-up.</Text>}
      </Block>
      {session.isDemo && <Tag kind="warn">demo</Tag>}
    </>
  );
}

function CaseDetail({ item }) {
  const kase = item.case;
  return (
    <>
      <Block label="Status">
        <Text>
          {[kase.status, kase.priority && `${kase.priority} priority`, kase.contactName]
            .filter(Boolean).join(' · ')}
        </Text>
      </Block>
      {kase.closedDate && <Block label="Closed"><Text>{kase.closedDate}</Text></Block>}
    </>
  );
}

function WorkDetail({ item }) {
  const { work } = item;
  return work.notesMd
    ? <MarkdownBody markdown={work.notesMd} />
    : <Text>No write-up.</Text>;
}

const DETAIL = {
  call: CallDetail,
  prep: PrepDetail,
  audit: AuditDetail,
  session: SessionDetail,
  case: CaseDetail,
  work: WorkDetail,
};

/** Right-hand badge: the one number or word that matters for that kind. */
function EntryBadge({ item }) {
  switch (item.kind) {
    case 'audit':
      return (
        <>
          {item.audit.flagged && <Tag kind="bad">flagged</Tag>}
          {scorePill(item.audit.overallPct)}
        </>
      );
    case 'call':
      return <Tag kind={item.call.callType === 'FREE' ? 'neutral' : 'good'}>{item.call.callType ?? 'call'}</Tag>;
    case 'session':
      return <Tag>{item.session.durationHours != null ? `${item.session.durationHours}h` : 'session'}</Tag>;
    case 'work':
      return <Tag kind="good">{item.work.hours}h</Tag>;
    case 'case':
      return <Tag kind={item.case.isOpen ? 'bad' : 'neutral'}>{item.case.isOpen ? 'open' : 'closed'}</Tag>;
    case 'prep':
      return <Tag>{item.prep.callType ?? 'prep'}</Tag>;
    default:
      return null;
  }
}

function Entry({ item, entryKey, transcripts, onLoadTranscripts, transcriptState }) {
  const [open, setOpen] = useState(false);
  const Detail = DETAIL[item.kind];
  return (
    <div style={styles.entry}>
      <div style={styles.entryHead}>
        <div style={{ minWidth: 0 }}>
          <div style={styles.title}>
            <span style={kindChip(item.kind)}>{KIND_SHORT[item.kind]}</span>
            {item.title}
          </div>
          {item.subtitle && <div style={styles.subtitle}>{item.subtitle}</div>}
        </div>
        <div style={styles.right}>
          <EntryBadge item={item} />
          {Detail && (
            // A 40-event timeline otherwise gives a screen reader forty identical
            // "More" buttons with no indication of what each one opens.
            <button
              className="tk-focus"
              style={s.chip}
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={entryKey}
              aria-label={`${open ? 'Hide' : 'Show'} details: ${item.title}`}
            >
              {open ? 'Less' : 'More'}
            </button>
          )}
        </div>
      </div>
      {open && Detail && (
        <div style={styles.detail} id={entryKey}>
          <Detail
            item={item}
            transcripts={transcripts}
            onLoadTranscripts={onLoadTranscripts}
            transcriptState={transcriptState}
          />
        </div>
      )}
    </div>
  );
}

export default function Timeline({ timeline, transcripts, onLoadTranscripts, transcriptState }) {
  // Tracking what the user has switched OFF, rather than what's on, so a source
  // that has no events simply never appears — and a kind that shows up after a
  // refresh is visible by default without any state to keep in sync.
  //
  // The previous version seeded "on" with all seven kinds regardless of counts, so
  // deselecting the one populated chip left six empty kinds selected and the empty
  // state claimed the customer had no history at all.
  const [hidden, setHidden] = useState(() => new Set());
  const counts = useMemo(() => countByKind(timeline), [timeline]);
  const available = useMemo(() => TIMELINE_KINDS.filter((kind) => counts[kind] > 0), [counts]);
  const filtered = useMemo(() => timeline.filter((item) => !hidden.has(item.kind)), [timeline, hidden]);
  const days = useMemo(() => groupTimelineByDay(filtered), [filtered]);
  const allShown = available.every((kind) => !hidden.has(kind));

  function toggle(kind) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      // Switching off the last visible source would empty the feed for no reason;
      // no-op visibly instead of silently turning the other six back on.
      const stillVisible = available.some((k) => !next.has(k));
      return stillVisible ? next : prev;
    });
  }

  return (
    <div>
      <div style={s.controls} role="group" aria-label="Filter timeline by source">
        {available.map((kind) => (
          <button
            key={kind}
            className="tk-focus"
            style={hidden.has(kind) ? s.chip : s.chipOn}
            onClick={() => toggle(kind)}
            aria-pressed={!hidden.has(kind)}
          >
            {KIND_LABELS[kind]} {counts[kind]}
          </button>
        ))}
        <span style={s.spacer} />
        <button
          className="tk-focus"
          style={s.chip}
          onClick={() => setHidden(new Set())}
          disabled={allShown}
        >
          Show all
        </button>
      </div>

      {!timeline.length ? (
        <div style={s.empty}>Nothing recorded for this customer yet.</div>
      ) : !days.length ? (
        <div style={s.empty}>
          No events match the selected sources.{' '}
          <button className="tk-focus" style={s.chip} onClick={() => setHidden(new Set())}>
            Show all
          </button>
        </div>
      ) : (
        days.map((day) => (
          <div key={day.date} style={styles.day}>
            <div style={styles.dayDate}>{day.date}</div>
            <div style={styles.dayItems}>
              {day.items.map((item, i) => (
                <Entry
                  key={`${day.date}-${item.kind}-${i}`}
                  item={item}
                  entryKey={`${day.date}-${i}`}
                  transcripts={transcripts}
                  onLoadTranscripts={onLoadTranscripts}
                  transcriptState={transcriptState}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
