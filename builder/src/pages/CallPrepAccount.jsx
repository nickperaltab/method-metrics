// Call Prep — account snapshot. Route: #/call-prep/account/:recordId
// The page Slack deep-links to. Rendered as a one-page pre-call brief: the
// dep_signals prose is the body; sync/time/cases are a supporting vitals band.
// All content comes from call_prep.snapshots in BigQuery — no doc read.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchAccountSnapshots, computeFlags } from '../lib/callPrep';

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
  rule: { border: 0, borderTop: `1px solid ${RULE}`, margin: '26px 0' },
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
  vitals: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '18px 24px' },
  vital: {},
  vitalLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
    letterSpacing: '.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 5,
  },
  vitalValue: { fontSize: 16, fontWeight: 600, color: INK, lineHeight: 1.25 },
  vitalSub: { fontSize: 11.5, color: MUTE, marginTop: 2 },
  footer: {
    marginTop: 30, paddingTop: 16, borderTop: `1px solid ${RULE}`,
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8,
  },
  footerMeta: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: FAINT, letterSpacing: '.03em' },
  sourceLink: { fontSize: 12, color: MUTE, textDecoration: 'none', borderBottom: `1px solid ${RULE}` },
  center: { maxWidth: 720, margin: '0 auto', padding: '60px 24px', textAlign: 'center', color: MUTE, fontSize: 14 },
  errorTxt: { color: '#b91c1c' },
};

const CSS = `
@keyframes cpRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.cp-rise { animation: cpRise .5s cubic-bezier(.2,.7,.2,1) both; }
.cp-brief-item { animation: cpRise .5s cubic-bezier(.2,.7,.2,1) both; }
.cp-crumb:hover { text-decoration: underline; }
.cp-source:hover { color: ${ACCENT}; border-color: ${ACCENT}; }
`;

function ageLabel(months) {
  if (months == null) return null;
  const m = Math.round(months);
  if (m < 12) return `${m}-month customer`;
  const y = Math.floor(m / 12);
  const rem = m % 12;
  return rem ? `${y}yr ${rem}mo customer` : `${y}-year customer`;
}

const Vital = ({ label, value, sub, tone }) => (
  <div style={s.vital}>
    <div style={s.vitalLabel}>{label}</div>
    <div style={{ ...s.vitalValue, ...(tone === 'warn' ? { color: AMBER } : null) }}>{value ?? '—'}</div>
    {sub ? <div style={s.vitalSub}>{sub}</div> : null}
  </div>
);

export default function CallPrepAccount() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setHistory(null);
    setSelectedDate(null);
    setError('');
    fetchAccountSnapshots(recordId)
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [recordId]);

  const snap = useMemo(() => {
    if (!history?.length) return null;
    return history.find((h) => h.snapshotDate === selectedDate) || history[0];
  }, [history, selectedDate]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const flags = useMemo(() => (snap ? computeFlags(snap, todayIso) : []), [snap, todayIso]);

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
      <div style={s.sheet}>
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

        <div className="cp-rise" style={{ animationDelay: '0ms' }}>
          <div style={s.kicker}>{[snap.callType, 'Pre-call brief'].filter(Boolean).join(' · ')}</div>
        </div>
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

        <hr style={s.rule} />

        <div style={s.bodyLabel}>What’s going on</div>
        {snap.depSignals.length > 0 ? (
          <ul style={s.brief}>
            {snap.depSignals.map((sig, i) => (
              <li key={sig} className="cp-brief-item" style={{ ...s.briefItem, animationDelay: `${180 + i * 55}ms` }}>
                <span style={s.briefMark} />
                {sig}
              </li>
            ))}
          </ul>
        ) : (
          <p style={s.empty}>No prep notes recorded for this snapshot.</p>
        )}

        <hr style={s.rule} />

        <div style={s.vitals}>
          <Vital
            label="Sync"
            value={snap.syncStatus || '—'}
            sub={snap.syncFailCount > 0 ? `${snap.syncFailCount} recent failure${snap.syncFailCount === 1 ? '' : 's'}` : null}
            tone={syncWarn ? 'warn' : null}
          />
          <Vital
            label="Time tracked"
            value={snap.ttTotalHours != null ? `${snap.ttTotalHours} hrs` : '—'}
            sub={[
              snap.ttSessionCount != null ? `${snap.ttSessionCount} sessions` : null,
              snap.ttLastSessionDate ? `last ${snap.ttLastSessionDate}` : null,
            ].filter(Boolean).join(' · ') || null}
          />
          <Vital
            label="Open cases"
            value={snap.casesOpenCount}
            sub={snap.casesClosed90dCount != null ? `${snap.casesClosed90dCount} closed in 90d` : null}
            tone={snap.casesOpenCount > 0 ? 'warn' : null}
          />
        </div>

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
