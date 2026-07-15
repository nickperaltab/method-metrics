// Call Prep — account snapshot. Route: #/call-prep/account/:recordId
// The page Slack deep-links to. Renders the latest snapshot natively;
// a date selector exposes history. Narrative lives only in the Google
// Doc until upstream lands it in BQ — we link out via doc_link.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchAccountSnapshots } from '../lib/callPrep';

const s = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  crumb: { fontSize: 13, color: '#059669', cursor: 'pointer', marginBottom: 16, display: 'inline-block' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a1a' },
  sub: { fontSize: 13, color: '#6b7280', marginBottom: 24 },
  select: { fontSize: 13, padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e5e9' },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
    color: '#8a9099', fontFamily: "'JetBrains Mono', monospace", marginBottom: 10,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 },
  cell: { background: '#fff', border: '1px solid #e2e5e9', borderRadius: 8, padding: '10px 14px' },
  cellLabel: { fontSize: 11, color: '#8a9099', marginBottom: 2 },
  cellValue: { fontSize: 15, fontWeight: 600, color: '#1a1a1a' },
  signal: {
    display: 'inline-block', fontSize: 12, color: '#1d4ed8', background: '#eff6ff',
    border: '1px solid #bfdbfe', borderRadius: 4, padding: '3px 10px', margin: '0 6px 6px 0',
  },
  docBtn: {
    display: 'inline-block', padding: '8px 18px', background: '#059669', color: '#fff',
    borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none',
  },
  note: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
};

const Cell = ({ label, value }) => (
  <div style={s.cell}>
    <div style={s.cellLabel}>{label}</div>
    <div style={s.cellValue}>{value ?? '—'}</div>
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

  if (error) return <div style={s.wrap}><div style={s.error}>Couldn’t load snapshot: {error}</div></div>;
  if (!history) return <div style={s.wrap}><div style={s.note}>Loading snapshot…</div></div>;
  if (!history.length) {
    return (
      <div style={s.wrap}>
        <span style={s.crumb} onClick={() => navigate('/call-prep')}>← Call Prep</span>
        <div style={s.note}>No snapshots exist for account {recordId} yet.</div>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <span style={s.crumb} onClick={() => navigate(`/call-prep/${encodeURIComponent(snap.consultant || '')}`)}>
        ← {snap.consultant}’s book
      </span>
      <div style={s.head}>
        <h1 style={s.title}>{snap.accountName ?? '—'}</h1>
        {history.length > 1 ? (
          <select
            style={s.select}
            value={snap.snapshotDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {history.map((h) => (
              <option key={h.snapshotDate} value={h.snapshotDate}>{h.snapshotDate}</option>
            ))}
          </select>
        ) : (
          <span style={{ fontSize: 13, color: '#6b7280' }}>{snap.snapshotDate}</span>
        )}
      </div>
      <p style={s.sub}>
        {snap.callType} · {snap.consultant} · account #{snap.accountRecordId}
      </p>

      <div style={s.section}>
        <div style={s.sectionTitle}>Account</div>
        <div style={s.grid}>
          <Cell label="Signup date" value={snap.signupDate} />
          <Cell label="Age (months)" value={snap.accountAgeMonths != null ? snap.accountAgeMonths.toFixed(1) : null} />
          <Cell label="DEP enrolled" value={snap.depEnrolled ? 'yes' : 'no'} />
          <Cell label="Parent" value={snap.multiEntityParentName} />
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Sync</div>
        <div style={s.grid}>
          <Cell label="Status" value={snap.syncStatus} />
          <Cell label="Fail count" value={snap.syncFailCount} />
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Time tracking</div>
        <div style={s.grid}>
          <Cell label="Total hours" value={snap.ttTotalHours} />
          <Cell label="Sessions" value={snap.ttSessionCount} />
          <Cell label="Last session" value={snap.ttLastSessionDate} />
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Cases</div>
        <div style={s.grid}>
          <Cell label="Open" value={snap.casesOpenCount} />
          <Cell label="Closed (90d)" value={snap.casesClosed90dCount} />
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Classification</div>
        <div style={s.grid}>
          <Cell label="Industry" value={[snap.industryL1, snap.industryL2, snap.industryL3].filter(Boolean).join(' › ') || null} />
          <Cell label="Operating model" value={snap.operatingModel} />
          <Cell label="Confidence" value={snap.bqConfidence != null ? `${Math.round(snap.bqConfidence * 100)}%` : null} />
        </div>
      </div>

      {snap.depSignals.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>DEP signals</div>
          <div>{snap.depSignals.map((sig) => <span key={sig} style={s.signal}>{sig}</span>)}</div>
        </div>
      )}

      <div style={s.section}>
        <div style={s.sectionTitle}>Prep write-up</div>
        {snap.docLink
          ? <a href={snap.docLink} target="_blank" rel="noreferrer" style={s.docBtn}>Open prep doc ↗</a>
          : <span style={{ fontSize: 13, color: '#6b7280' }}>Write-up unavailable for this snapshot.</span>}
      </div>
    </div>
  );
}
