// Call Prep — account snapshot. Route: #/call-prep/account/:recordId
// A one-page pre-call brief: dep_signals prose is the body; a jump-nav lets
// the consultant snap between Situation / Timeline / Details without hiding
// anything. The timeline is the account's real session history from
// revenue.TimeTracking. All content is sourced from BigQuery — no doc read.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchAccountSnapshots, fetchAccountSessions, fetchAccountCases, fetchAccountOverview, computeFlags } from '../lib/callPrep';

const PAPER = '#faf8f3';
const INK = '#1c1a15';
const MUTE = '#6f6a5d';
const FAINT = '#a8a294';
const RULE = '#e6e1d5';
const ACCENT = '#1b5e43';
const AMBER = '#a85a1a';

const s = {
  stage: { background: PAPER, minHeight: '100%', padding: '32px 20px 72px', fontFamily: "'DM Sans', sans-serif" },
  sheet: {
    maxWidth: 720, margin: '0 auto', background: '#fffdf8',
    border: `1px solid ${RULE}`, borderTop: `3px solid ${ACCENT}`,
    borderRadius: 3, padding: '30px 40px 40px',
    boxShadow: '0 1px 2px rgba(28,26,21,.04), 0 12px 34px -18px rgba(28,26,21,.22)',
  },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 },
  crumb: { fontSize: 12.5, color: ACCENT, cursor: 'pointer', fontWeight: 500, textDecoration: 'none' },
  select: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, padding: '4px 8px',
    borderRadius: 4, border: `1px solid ${RULE}`, background: PAPER, color: INK, cursor: 'pointer',
  },
  dateStamp: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: FAINT, letterSpacing: '.04em' },
  kicker: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600,
    letterSpacing: '.22em', textTransform: 'uppercase', color: ACCENT, marginBottom: 12,
  },
  title: {
    fontFamily: "'Fraunces', serif", fontOpticalSizing: 'auto', fontWeight: 600,
    fontSize: 40, lineHeight: 1.04, letterSpacing: '-.01em', color: INK, margin: '0 0 14px',
  },
  identity: { fontSize: 13.5, color: MUTE, lineHeight: 1.5, marginBottom: 14 },
  identityStrong: { color: INK, fontWeight: 600 },
  model: {
    fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontWeight: 400, fontSize: 17,
    lineHeight: 1.5, color: '#39352b', margin: '0 0 4px', paddingLeft: 15,
    borderLeft: `2px solid ${ACCENT}`,
  },
  alertRow: { display: 'flex', flexWrap: 'wrap', gap: 8, margin: '22px 0 4px' },
  alert: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, letterSpacing: '.02em',
    color: AMBER, background: '#fbf1e4', border: '1px solid #edd6b8', borderRadius: 3, padding: '4px 9px',
  },
  nav: {
    position: 'sticky', top: 0, zIndex: 5, display: 'flex', gap: 6, flexWrap: 'wrap',
    margin: '24px 0 4px', padding: '10px 0', background: 'rgba(255,253,248,.92)',
    backdropFilter: 'blur(4px)', borderBottom: `1px solid ${RULE}`,
  },
  navChip: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
    textTransform: 'uppercase', color: MUTE, background: PAPER, border: `1px solid ${RULE}`,
    borderRadius: 999, padding: '5px 13px', cursor: 'pointer', textDecoration: 'none',
  },
  section: { scrollMarginTop: 56, paddingTop: 26 },
  bodyLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600,
    letterSpacing: '.18em', textTransform: 'uppercase', color: FAINT, marginBottom: 16,
  },
  brief: { listStyle: 'none', margin: 0, padding: 0 },
  briefItem: {
    position: 'relative', paddingLeft: 24, marginBottom: 15,
    fontSize: 15.5, lineHeight: 1.62, color: '#2c2921', maxWidth: 620,
  },
  briefMark: { position: 'absolute', left: 2, top: 10, width: 7, height: 7, borderRadius: '50%', background: ACCENT, opacity: .85 },
  empty: { fontSize: 14, color: MUTE, fontStyle: 'italic' },

  // Timeline
  rail: { position: 'relative', margin: 0, padding: 0, listStyle: 'none' },
  railLine: { position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: RULE },
  event: { position: 'relative', paddingLeft: 34, marginBottom: 20 },
  dot: { position: 'absolute', left: 2, top: 3, width: 13, height: 13, borderRadius: '50%', border: `2px solid ${PAPER}`, boxSizing: 'border-box' },
  eventHead: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', cursor: 'pointer' },
  eventDate: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: INK, fontWeight: 600 },
  typeBadge: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '.05em',
    textTransform: 'uppercase', borderRadius: 3, padding: '2px 7px',
  },
  eventMeta: { fontSize: 12, color: MUTE },
  eventNotes: {
    marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: '#3a362d', whiteSpace: 'pre-wrap',
    background: PAPER, border: `1px solid ${RULE}`, borderRadius: 4, padding: '10px 13px', maxWidth: 600,
  },
  expandHint: { fontSize: 11.5, color: ACCENT, marginTop: 3 },

  // Cases
  caseRow: { padding: '12px 0', borderBottom: `1px solid ${RULE}` },
  caseTop: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  caseSubject: { fontSize: 14.5, fontWeight: 600, color: INK },
  caseBadge: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 600, letterSpacing: '.05em',
    textTransform: 'uppercase', borderRadius: 3, padding: '2px 7px',
  },
  caseMeta: { fontSize: 12, color: MUTE, marginTop: 3 },

  // Details grid
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px 22px' },
  dLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
    letterSpacing: '.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 4,
  },
  dValue: { fontSize: 14.5, fontWeight: 500, color: INK, lineHeight: 1.35 },
  dValueWarn: { color: AMBER },

  footer: {
    marginTop: 32, paddingTop: 16, borderTop: `1px solid ${RULE}`,
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8,
  },
  footerMeta: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: FAINT, letterSpacing: '.03em' },
  sourceLink: { fontSize: 12, color: MUTE, textDecoration: 'none', borderBottom: `1px solid ${RULE}` },
  center: { maxWidth: 720, margin: '0 auto', padding: '60px 24px', textAlign: 'center', color: MUTE, fontSize: 14 },
  errorTxt: { color: '#b91c1c' },
  timelineErr: { fontSize: 13, color: MUTE, fontStyle: 'italic' },
};

const CSS = `
@keyframes cpRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.cp-rise { animation: cpRise .5s cubic-bezier(.2,.7,.2,1) both; }
.cp-brief-item { animation: cpRise .5s cubic-bezier(.2,.7,.2,1) both; }
.cp-crumb:hover, .cp-source:hover { text-decoration: underline; }
.cp-chip:hover { border-color: ${ACCENT}; color: ${ACCENT}; }
.cp-event-head:hover .cp-date { color: ${ACCENT}; }
`;

function ageLabel(months) {
  if (months == null) return null;
  const m = Math.round(months);
  if (m < 12) return `${m}-month customer`;
  const y = Math.floor(m / 12);
  const rem = m % 12;
  return rem ? `${y}yr ${rem}mo customer` : `${y}-year customer`;
}

// Session Notes start with a weekday-date header and a ==== rule — strip those
// so the expanded note reads as the actual content.
function cleanNotes(notes) {
  if (!notes) return '';
  return notes
    .split('\n')
    .filter((ln) => !/^=+$/.test(ln.trim()) && !/^[A-Za-z]+day,\s/.test(ln.trim()))
    .join('\n')
    .trim();
}

function sessionKind(sess) {
  if (sess.isDemo) return { label: 'Demo', bg: '#eef2ff', fg: '#3730a3', dot: '#4f46e5' };
  const t = (sess.supportType || '').toLowerCase();
  if (t === 'free') return { label: 'Free hour', bg: '#ecfdf3', fg: ACCENT, dot: ACCENT };
  if (t.includes('pay')) return { label: 'Pay-per-use', bg: '#fbf1e4', fg: AMBER, dot: AMBER };
  return { label: sess.supportType || 'Session', bg: '#f1efe8', fg: MUTE, dot: FAINT };
}

const Detail = ({ label, value, warn }) => (
  <div>
    <div style={s.dLabel}>{label}</div>
    <div style={{ ...s.dValue, ...(warn ? s.dValueWarn : null) }}>{value ?? '—'}</div>
  </div>
);

export default function CallPrepAccount() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [sessionsErr, setSessionsErr] = useState('');
  const [openEvent, setOpenEvent] = useState(null);
  const [cases, setCases] = useState(null);
  const [casesErr, setCasesErr] = useState('');
  const [overview, setOverview] = useState(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null); setSelectedDate(null); setError('');
    setSessions(null); setSessionsErr(''); setOpenEvent(null);
    setCases(null); setCasesErr(''); setOverview(null);
    fetchAccountSnapshots(recordId)
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    // Timeline, cases, and overview load independently — a CRM/warehouse-table
    // failure must not blank the brief.
    fetchAccountSessions(recordId)
      .then((rows) => { if (!cancelled) setSessions(rows); })
      .catch((e) => { if (!cancelled) setSessionsErr(e?.message || String(e)); });
    fetchAccountCases(recordId)
      .then((rows) => { if (!cancelled) setCases(rows); })
      .catch((e) => { if (!cancelled) setCasesErr(e?.message || String(e)); });
    fetchAccountOverview(recordId)
      .then((o) => { if (!cancelled) setOverview(o); })
      .catch(() => { if (!cancelled) setOverview(null); });
    return () => { cancelled = true; };
  }, [recordId]);

  const snap = useMemo(() => {
    if (!history?.length) return null;
    return history.find((h) => h.snapshotDate === selectedDate) || history[0];
  }, [history, selectedDate]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const flags = useMemo(() => (snap ? computeFlags(snap, todayIso) : []), [snap, todayIso]);

  const jump = (id) => {
    const el = sheetRef.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (error) {
    return <div style={s.stage}><div style={s.center}><span style={s.errorTxt}>Couldn’t load snapshot: {error}</span></div></div>;
  }
  if (!history) return <div style={s.stage}><div style={s.center}>Loading brief…</div></div>;
  if (!history.length) {
    return (
      <div style={s.stage}>
        <div style={s.center}>
          <a style={s.crumb} className="cp-crumb" onClick={() => navigate('/call-prep')}>← Call Prep</a>
          <p style={{ marginTop: 16 }}>No snapshots exist for account {recordId} yet.</p>
        </div>
      </div>
    );
  }

  const industry = [snap.industryL1, snap.industryL2, snap.industryL3].filter(Boolean).join(' › ');
  const age = ageLabel(snap.accountAgeMonths);
  const syncWarn = (snap.syncStatus && snap.syncStatus !== 'healthy') || snap.syncFailCount > 0;

  return (
    <div style={s.stage}>
      <style>{CSS}</style>
      <div style={s.sheet} ref={sheetRef}>
        <div style={s.topRow}>
          <a
            style={s.crumb}
            className="cp-crumb"
            onClick={() => navigate(`/call-prep/${encodeURIComponent(snap.consultant || '')}`)}
          >
            ← {snap.consultant || 'Call Prep'}{snap.consultant ? '’s book' : ''}
          </a>
          {history.length > 1 ? (
            <select style={s.select} value={snap.snapshotDate} onChange={(e) => setSelectedDate(e.target.value)}>
              {history.map((h) => (
                <option key={h.snapshotDate} value={h.snapshotDate}>{h.snapshotDate}</option>
              ))}
            </select>
          ) : (
            <span style={s.dateStamp}>{snap.snapshotDate}</span>
          )}
        </div>

        <div className="cp-rise"><div style={s.kicker}>{[snap.callType, 'Pre-call brief'].filter(Boolean).join(' · ')}</div></div>
        <h1 className="cp-rise" style={{ ...s.title, animationDelay: '40ms' }}>{snap.accountName ?? '—'}</h1>

        <div className="cp-rise" style={{ animationDelay: '90ms' }}>
          <div style={s.identity}>
            {industry ? <span style={s.identityStrong}>{industry}</span> : null}
            {industry && (age || snap.signupDate) ? '  ·  ' : ''}
            {age}
            {age && snap.signupDate ? ' ' : ''}
            {snap.signupDate ? <span>(since {snap.signupDate})</span> : null}
            {snap.depEnrolled ? '  ·  DEP enrolled' : ''}
            {snap.multiEntityParentName ? `  ·  child of ${snap.multiEntityParentName}` : ''}
          </div>
          {snap.operatingModel ? <p style={s.model}>{snap.operatingModel}</p> : null}
        </div>

        {flags.length > 0 && (
          <div className="cp-rise" style={{ ...s.alertRow, animationDelay: '140ms' }}>
            {flags.map((f) => <span key={f} style={s.alert}>{f}</span>)}
          </div>
        )}

        <nav style={s.nav}>
          <a className="cp-chip" style={s.navChip} onClick={() => jump('situation')}>Situation</a>
          {overview ? <a className="cp-chip" style={s.navChip} onClick={() => jump('revenue')}>Revenue</a> : null}
          <a className="cp-chip" style={s.navChip} onClick={() => jump('timeline')}>Timeline</a>
          <a className="cp-chip" style={s.navChip} onClick={() => jump('cases')}>Cases</a>
          <a className="cp-chip" style={s.navChip} onClick={() => jump('details')}>Details</a>
        </nav>

        <section id="situation" style={s.section}>
          <div style={s.bodyLabel}>What’s going on</div>
          {snap.depSignals.length > 0 ? (
            <ul style={s.brief}>
              {snap.depSignals.map((sig, i) => (
                <li key={sig} className="cp-brief-item" style={{ ...s.briefItem, animationDelay: `${i * 45}ms` }}>
                  <span style={s.briefMark} />
                  {sig}
                </li>
              ))}
            </ul>
          ) : (
            <p style={s.empty}>No prep notes recorded for this snapshot.</p>
          )}
        </section>

        {overview && (
          <section id="revenue" style={s.section}>
            <div style={s.bodyLabel}>Revenue &amp; licenses</div>
            <div style={s.grid}>
              <Detail label="MRR (run-rate)" value={overview.mrrRunRate != null ? `$${overview.mrrRunRate.toLocaleString()}/mo` : null} />
              <Detail label="User licenses" value={overview.userLicenses} />
              <Detail label="Health score" value={overview.healthScore != null ? Math.round(overview.healthScore) : null} warn={overview.healthScore != null && overview.healthScore < 50} />
              <Detail label="Billing" value={overview.saasPayType} />
            </div>
            <p style={{ fontSize: 11.5, color: FAINT, marginTop: 12, fontStyle: 'italic' }}>
              Utilization (active users ÷ licenses) pending an upstream field. MRR is a nightly run-rate proxy, not recognized revenue.
            </p>
          </section>
        )}

        <section id="timeline" style={s.section}>
          <div style={s.bodyLabel}>History</div>
          {sessionsErr ? (
            <p style={s.timelineErr}>Couldn’t load session history.</p>
          ) : sessions == null ? (
            <p style={s.timelineErr}>Loading history…</p>
          ) : (
            <ul style={s.rail}>
              <div style={s.railLine} />
              {snap.signupDate && (
                <li style={s.event}>
                  <span style={{ ...s.dot, background: INK }} />
                  <div style={s.eventHead}>
                    <span style={s.eventDate}>{snap.signupDate}</span>
                    <span style={{ ...s.typeBadge, background: '#efece3', color: INK }}>Signed up</span>
                  </div>
                </li>
              )}
              {sessions.map((sess, i) => {
                const kind = sessionKind(sess);
                const key = `${sess.date}-${i}`;
                const isThisCall = sess.date === snap.snapshotDate;
                const body = cleanNotes(sess.notes);
                const open = openEvent === key;
                return (
                  <li key={key} style={s.event}>
                    <span style={{ ...s.dot, background: kind.dot }} />
                    <div className="cp-event-head" style={s.eventHead} onClick={() => setOpenEvent(open ? null : key)}>
                      <span className="cp-date" style={s.eventDate}>{sess.date}</span>
                      <span style={{ ...s.typeBadge, background: kind.bg, color: kind.fg }}>{kind.label}</span>
                      <span style={s.eventMeta}>
                        {sess.durationHours != null ? `${sess.durationHours} hr` : ''}
                        {isThisCall ? '  ·  this call’s day' : ''}
                      </span>
                    </div>
                    {body ? (
                      open
                        ? <div style={s.eventNotes}>{body}</div>
                        : <div style={s.expandHint}>click to read notes →</div>
                    ) : null}
                  </li>
                );
              })}
              {sessions.length === 0 && <li style={s.empty}>No sessions recorded yet.</li>}
            </ul>
          )}
        </section>

        <section id="cases" style={s.section}>
          <div style={s.bodyLabel}>Cases</div>
          {casesErr ? (
            <p style={s.timelineErr}>Couldn’t load cases.</p>
          ) : cases == null ? (
            <p style={s.timelineErr}>Loading cases…</p>
          ) : cases.length === 0 ? (
            <p style={s.empty}>No cases on record.</p>
          ) : (
            <div>
              {cases.map((c) => (
                <div key={c.recordId} style={s.caseRow}>
                  <div style={s.caseTop}>
                    <span style={s.caseSubject}>{c.subject ?? `Case #${c.recordId}`}</span>
                    <span style={{ ...s.caseBadge, ...(c.isOpen ? { background: '#fbf1e4', color: AMBER } : { background: '#f1efe8', color: MUTE }) }}>
                      {c.status || (c.isOpen ? 'Open' : 'Closed')}
                    </span>
                    {c.priority ? <span style={{ ...s.caseBadge, background: '#f1efe8', color: MUTE }}>{c.priority}</span> : null}
                  </div>
                  <div style={s.caseMeta}>
                    #{c.recordId} · opened {c.createdDate}
                    {c.closedDate ? ` · closed ${c.closedDate}` : ''}
                    {c.contactName ? ` · ${c.contactName}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section id="details" style={s.section}>
          <div style={s.bodyLabel}>Details</div>
          <div style={s.grid}>
            <Detail label="Sync status" value={snap.syncStatus} warn={syncWarn} />
            <Detail label="Sync failures" value={snap.syncFailCount} warn={snap.syncFailCount > 0} />
            <Detail label="Time tracked" value={snap.ttTotalHours != null ? `${snap.ttTotalHours} hrs` : null} />
            <Detail label="Sessions (snapshot)" value={snap.ttSessionCount} />
            <Detail label="Last session" value={snap.ttLastSessionDate} />
            <Detail label="Open cases" value={snap.casesOpenCount} warn={snap.casesOpenCount > 0} />
            <Detail label="Closed cases (90d)" value={snap.casesClosed90dCount} />
            <Detail label="Signup date" value={snap.signupDate} />
            <Detail label="Account age" value={snap.accountAgeMonths != null ? `${snap.accountAgeMonths.toFixed(1)} mo` : null} />
            <Detail label="DEP enrolled" value={snap.depEnrolled ? 'yes' : 'no'} />
            {snap.multiEntityParentName ? <Detail label="Parent entity" value={snap.multiEntityParentName} /> : null}
            <Detail label="Industry" value={industry || null} />
            <Detail label="Operating model" value={snap.operatingModel} />
            {snap.bqConfidence != null ? <Detail label="Classifier confidence" value={`${Math.round(snap.bqConfidence * 100)}%`} /> : null}
          </div>
        </section>

        <div style={s.footer}>
          <span style={s.footerMeta}>
            Prepared for {snap.consultant || '—'} · account #{snap.accountRecordId} · snapshot {snap.snapshotDate}
          </span>
          {snap.docLink ? (
            <a style={s.sourceLink} className="cp-source" href={snap.docLink} target="_blank" rel="noreferrer">
              source document ↗
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
