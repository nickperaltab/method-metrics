// End of day — the follow-through the /time-killer routine found still open.
// Route: #/eod. Grouped by account, oldest gap first.
//
// Read-only in this phase. Draft and Dismiss are the two write actions the
// screen is designed around, and neither has a path yet: the app has no BQ
// write layer, and creating a Gmail draft needs a scope the OAuth client
// doesn't request. Both are stubbed behind `canAct` so the layout is settled
// before the plumbing lands. See docs/ps-eod-followups.md.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchMyFindings,
  summarizeFindings,
  groupByAccount,
  findingAgeDays,
  isOpen,
  FINDING_LABELS,
  MISSING_ELEMENT_LABELS,
} from '../lib/eod';
import { localIsoDate } from '../lib/psOverview';

// Per-check colour. Follow-up gaps are client-facing and read as the warning;
// logging gaps are internal bookkeeping; MIA is informational.
const TYPE_STYLE = {
  followup_missing: { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  email_not_logged: { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  mia:              { color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' },
};
const UNKNOWN_STYLE = { color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' };
const typeStyle = (t) => TYPE_STYLE[t] || UNKNOWN_STYLE;

const s = {
  wrap: { maxWidth: 1040, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a1a' },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 24 },
  stats: { display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #e2e5e9' },
  stat: { minWidth: 92 },
  statNum: { fontSize: 26, fontWeight: 700, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 },
  statLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
    color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", marginTop: 4,
  },
  filters: { display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  chip: (active) => ({
    fontSize: 12, fontFamily: "'JetBrains Mono', monospace", padding: '5px 12px',
    borderRadius: 999, cursor: 'pointer', border: '1px solid',
    borderColor: active ? '#047857' : '#e2e5e9',
    color: active ? '#047857' : '#6b7280', background: active ? '#ecfdf5' : '#fff',
  }),
  group: { border: '1px solid #e2e5e9', borderRadius: 8, marginBottom: 16, overflow: 'hidden' },
  groupHead: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
    background: '#f8f9fa', borderBottom: '1px solid #e2e5e9',
  },
  account: { fontSize: 15, fontWeight: 600, color: '#1a1a1a', textDecoration: 'none' },
  dep: {
    fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: '#047857',
    background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4, padding: '2px 6px',
  },
  item: { padding: '14px 16px', borderBottom: '1px solid #f0f1f3', display: 'flex', gap: 14, alignItems: 'flex-start' },
  itemBody: { flex: 1, minWidth: 0 },
  badge: (st) => ({
    display: 'inline-block', fontSize: 11, fontWeight: 700,
    color: st.color, background: st.bg, border: `1px solid ${st.border}`,
    borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap',
  }),
  detail: { fontSize: 14, color: '#1a1a1a', margin: '8px 0 0', lineHeight: 1.45 },
  evidence: { fontSize: 12, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", marginTop: 6 },
  missing: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 },
  missingChip: {
    fontSize: 11, fontWeight: 600, color: '#b45309', background: '#fffbeb',
    border: '1px solid #fde68a', borderRadius: 4, padding: '2px 8px',
  },
  hook: { fontSize: 13, color: '#374151', marginTop: 8, paddingLeft: 10, borderLeft: '2px solid #e2e5e9' },
  meta: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: '#6b7280' },
  actions: { display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 },
  btn: (primary) => ({
    fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    border: '1px solid', borderColor: primary ? '#047857' : '#e2e5e9',
    background: primary ? '#047857' : '#fff', color: primary ? '#fff' : '#6b7280',
    fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
  }),
  drafted: {
    fontSize: 11, fontWeight: 700, color: '#047857', background: '#ecfdf5',
    border: '1px solid #a7f3d0', borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap',
  },
  note: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  empty: { fontSize: 15, color: '#1a1a1a', padding: '40px 24px', textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
  banner: {
    fontSize: 13, color: '#6b7280', background: '#f8f9fa', border: '1px solid #e2e5e9',
    borderRadius: 6, padding: '10px 14px', marginBottom: 20,
  },
};

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'followup_missing', label: 'Follow-ups' },
  { key: 'email_not_logged', label: 'Logging' },
  { key: 'mia', label: 'Quiet accounts' },
  { key: 'all', label: 'All' },
];

/** "today", "yesterday", "4 days" — the age of a gap, for the meta line. */
function ageLabel(days) {
  if (days == null) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days`;
}

export default function Eod({ userEmail }) {
  const [findings, setFindings] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('open');
  const today = localIsoDate();

  // Writes aren't wired up yet. One flag rather than commenting out the
  // buttons, so the action column keeps its width in the layout.
  const canAct = false;

  useEffect(() => {
    if (!userEmail) return undefined;
    let cancelled = false;
    setFindings(null);
    setError('');
    fetchMyFindings(userEmail)
      .then((f) => { if (!cancelled) setFindings(f); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [userEmail]);

  const stats = useMemo(() => summarizeFindings(findings ?? []), [findings]);

  const groups = useMemo(() => {
    if (!findings) return [];
    const scoped = filter === 'all'
      ? findings
      : filter === 'open'
        ? findings.filter(isOpen)
        : findings.filter((f) => isOpen(f) && f.findingType === filter);
    return groupByAccount(scoped, today);
  }, [findings, filter, today]);

  if (error) {
    return (
      <div style={s.wrap}>
        <div style={s.error}>
          {/BQ 403/.test(error)
            ? 'You don’t have access to the call_prep dataset yet. Ask Nic for the BigQuery grant.'
            : `Couldn’t load findings: ${error}`}
        </div>
      </div>
    );
  }
  if (!findings) return <div style={s.wrap}><div style={s.note}>Loading your day…</div></div>;

  const lastRun = findings.reduce((max, f) => (f.runDate > max ? f.runDate : max), '');

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <h1 style={s.title}>End of day</h1>
        <span style={{ ...s.evidence, marginTop: 0 }}>
          {lastRun ? `Last swept ${lastRun}` : 'Never swept'}
        </span>
      </div>
      <p style={s.sub}>What you committed to today that hasn’t been finished yet.</p>

      <div style={s.stats}>
        <div style={s.stat}>
          <div style={s.statNum}>{stats.open}</div>
          <div style={s.statLabel}>Open</div>
        </div>
        <div style={s.stat}>
          <div style={s.statNum}>{stats.accounts}</div>
          <div style={s.statLabel}>Accounts</div>
        </div>
        <div style={s.stat}>
          <div style={s.statNum}>{stats.followupMissing}</div>
          <div style={s.statLabel}>Follow-ups</div>
        </div>
        <div style={s.stat}>
          <div style={s.statNum}>{stats.emailNotLogged}</div>
          <div style={s.statLabel}>Logging</div>
        </div>
        <div style={s.stat}>
          <div style={s.statNum}>{stats.mia}</div>
          <div style={s.statLabel}>Quiet</div>
        </div>
        <div style={s.stat}>
          <div style={s.statNum}>{stats.drafted}</div>
          <div style={s.statLabel}>Drafted</div>
        </div>
      </div>

      {!canAct && (
        <p style={s.banner}>
          Drafting and dismissing run from the <code>/time-killer</code> routine for now.
        </p>
      )}

      <div style={s.filters} role="group" aria-label="Filter findings">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            style={s.chip(filter === f.key)}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!groups.length && (
        <div style={s.empty}>
          {findings.length
            ? 'Nothing matches this filter.'
            : 'Nothing outstanding. Run /time-killer to sweep today.'}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} style={s.group} aria-label={g.accountName ?? `Account ${g.accountRecordId}`}>
          <div style={s.groupHead}>
            {g.accountRecordId ? (
              <Link to={`/accounts/${encodeURIComponent(g.accountRecordId)}`} style={s.account}>
                {g.accountName ?? `#${g.accountRecordId}`}
              </Link>
            ) : (
              <span style={s.account}>{g.accountName ?? 'Unknown account'}</span>
            )}
            {g.accountIsDep && <span style={s.dep}>DEP</span>}
          </div>

          {g.findings.map((f) => {
            const age = ageLabel(findingAgeDays(f, today));
            return (
              <div key={f.findingId} style={s.item}>
                <div style={s.itemBody}>
                  <span style={s.badge(typeStyle(f.findingType))}>
                    {FINDING_LABELS[f.findingType] ?? f.findingType}
                  </span>
                  <p style={s.detail}>{f.detail}</p>

                  {f.missingElements.length > 0 && (
                    <div style={s.missing}>
                      {f.missingElements.map((m) => (
                        <span key={m} style={s.missingChip}>
                          Missing {MISSING_ELEMENT_LABELS[m] ?? m}
                        </span>
                      ))}
                    </div>
                  )}

                  {f.evidence && <div style={s.evidence}>{f.evidence}</div>}
                  {f.recommendedHook && <p style={s.hook}>{f.recommendedHook}</p>}

                  <div style={s.meta}>
                    {age && <span>Open {age}</span>}
                    {f.daysSinceTouch != null && <span>Last touch {f.daysSinceTouch}d ago</span>}
                    {f.fit && <span>{f.motion} · {f.fit} fit</span>}
                  </div>
                </div>

                <div style={s.actions}>
                  {f.status === 'drafted'
                    ? <span style={s.drafted}>Draft saved</span>
                    : canAct && <button type="button" style={s.btn(true)}>Draft</button>}
                  {canAct && <button type="button" style={s.btn(false)}>Dismiss</button>}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
