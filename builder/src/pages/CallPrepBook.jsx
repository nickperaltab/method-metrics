// Call Prep — one consultant's page. Route: #/call-prep/:consultant
//
// Three sources, one screen:
//   - the week strip is Google Calendar (times, this week, own calendar only)
//   - Today / Past preps are call_prep.snapshots rows, split on snapshot_date
//   - Accounts is the latest snapshot per account, flagged rows first
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import {
  PREP_HISTORY_LIMIT,
  computeFlags,
  fetchBook,
  fetchPrepHistory,
} from '../lib/callPrep';
import { consultantPatternFromEmail } from '../lib/psOverview';
import { localIsoDate } from '../lib/googleCalendar';
import WeekStrip from '../components/callprep/WeekStrip';

const PAGE_SIZE = 50;

const s = {
  wrap: { maxWidth: 1040, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20, gap: 16 },
  kicker: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.14em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a1a' },
  attention: { fontSize: 13, color: '#b45309', marginBottom: 16 },
  srOnly: {
    position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
    overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
  },
  switchLink: { fontSize: 13, color: '#047857', textDecoration: 'underline', whiteSpace: 'nowrap' },

  tabs: { display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' },
  tab: {
    padding: '6px 14px', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    color: '#374151', background: '#fff', border: '1px solid #e2e5e9',
    borderRadius: 6, cursor: 'pointer',
  },
  tabActive: { color: '#fff', background: '#047857', borderColor: '#047857', fontWeight: 600 },

  searchRow: { marginBottom: 16 },
  label: {
    display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
    color: '#6b7280', marginBottom: 6,
  },
  input: {
    width: '100%', maxWidth: 320, padding: '8px 10px', fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", color: '#1a1a1a',
    border: '1px solid #e2e5e9', borderRadius: 6, background: '#fff',
  },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280',
    fontFamily: "'JetBrains Mono', monospace", borderBottom: '1px solid #e2e5e9',
  },
  thNum: { textAlign: 'right' },
  td: { padding: '12px', borderBottom: '1px solid #f0f1f3', color: '#1a1a1a' },
  tdNum: { textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 13 },
  tdDate: { fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#6b7280' },
  rowClickable: { cursor: 'pointer' },
  name: { fontWeight: 600, color: '#1a1a1a', textDecoration: 'none' },

  flag: {
    display: 'inline-block', fontSize: 11, fontWeight: 600, color: '#b45309',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4,
    padding: '2px 8px', marginRight: 6,
  },
  ok: { fontSize: 12, color: '#047857' },

  more: { marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 },
  moreBtn: {
    padding: '6px 14px', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
    color: '#374151', background: '#fff', border: '1px solid #e2e5e9',
    borderRadius: 6, cursor: 'pointer',
  },
  count: { fontSize: 12, color: '#6b7280' },
  note: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
  clear: {
    background: 'none', border: 'none', padding: 0, marginLeft: 6,
    color: '#047857', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    cursor: 'pointer', textDecoration: 'underline',
  },
};

const TABS = [
  { id: 'today', label: 'Today' },
  { id: 'past', label: 'Past preps' },
  { id: 'accounts', label: 'Accounts' },
];

/**
 * normalizeSnapshotRow lowercases sync_status so comparisons elsewhere can rely
 * on it. Presentation is this layer's job, not the store's.
 */
function sentenceCase(value) {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Does this consultant name belong to the signed-in user? */
function isOwnBook(consultant, email) {
  const pattern = consultantPatternFromEmail(email);
  if (!pattern) return false;
  return new RegExp(pattern).test(String(consultant || '').toLowerCase().trim());
}

function AccountCell({ snap }) {
  return (
    <Link
      to={`/call-prep/account/${encodeURIComponent(snap.accountRecordId)}`}
      style={s.name}
      onClick={(e) => e.stopPropagation()}
    >
      {snap.accountName}
    </Link>
  );
}

function Flags({ flags }) {
  if (!flags.length) return <span style={s.ok}>ok</span>;
  return flags.map((f) => <span key={f} style={s.flag}>{f}</span>);
}

export default function CallPrepBook() {
  const { consultant } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useUser();

  const [book, setBook] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('today');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    setBook(null);
    setHistory(null);
    setError('');
    Promise.all([fetchBook(consultant), fetchPrepHistory(consultant)])
      .then(([b, h]) => {
        if (cancelled) return;
        setBook(b);
        setHistory(h);
      })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [consultant]);

  // Reset paging whenever the visible set changes out from under it.
  useEffect(() => { setLimit(PAGE_SIZE); }, [tab, search]);

  const todayIso = localIsoDate();
  const ownBook = isOwnBook(consultant, currentUser?.email);

  const accountRows = useMemo(() => {
    if (!book) return [];
    return book
      .map((snap) => ({ snap, flags: computeFlags(snap, todayIso) }))
      .sort((a, b) =>
        b.flags.length - a.flags.length ||
        (a.snap.accountName ?? '').localeCompare(b.snap.accountName ?? ''));
  }, [book, todayIso]);

  const todayRows = useMemo(
    () => (history ?? []).filter((snap) => snap.snapshotDate === todayIso),
    [history, todayIso]
  );
  const pastRows = useMemo(
    () => (history ?? []).filter((snap) => snap.snapshotDate < todayIso),
    [history, todayIso]
  );

  const term = search.trim().toLowerCase();
  const matches = (snap) =>
    !term ||
    (snap.accountName ?? '').toLowerCase().includes(term) ||
    (snap.callType ?? '').toLowerCase().includes(term) ||
    (snap.snapshotDate ?? '').includes(term);

  const active = tab === 'accounts'
    ? accountRows.filter((r) => matches(r.snap))
    : (tab === 'today' ? todayRows : pastRows).filter(matches);

  const shown = active.slice(0, limit);

  if (error) {
    return (
      <div style={s.wrap}>
        <div style={s.error}>
          {/BQ 403/.test(error)
            ? 'You don’t have access to the call_prep dataset yet. Ask Nic for the BigQuery grant.'
            : `Couldn’t load this book: ${error}`}
        </div>
      </div>
    );
  }
  if (!book || !history) {
    return <div style={s.wrap}><div style={s.note}>Loading {consultant}’s book…</div></div>;
  }

  const counts = { today: todayRows.length, past: pastRows.length, accounts: accountRows.length };
  const needsAttention = accountRows.filter((r) => r.flags.length > 0).length;

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <div>
          <div style={s.kicker}>Call prep</div>
          <h1 style={s.title}>{consultant}</h1>
        </div>
        <Link to="/call-prep" style={s.switchLink}>All consultants</Link>
      </div>

      <WeekStrip accounts={book} consultant={consultant} ownBook={ownBook} preps={history} />

      {needsAttention > 0 && (
        <p style={s.attention}>
          {needsAttention} of {accountRows.length} accounts need attention
        </p>
      )}

      <div style={s.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={tab === t.id}
            style={{ ...s.tab, ...(tab === t.id ? s.tabActive : null) }}
            onClick={() => setTab(t.id)}
          >
            {t.label} ({counts[t.id]})
          </button>
        ))}
      </div>

      <div style={s.searchRow}>
        <label htmlFor="prep-search" style={s.label}>Search</label>
        <input
          id="prep-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={s.input}
        />
      </div>

      {/* Filtering and tab switches change the row count silently on screen;
          this is the only announcement a screen-reader user gets. */}
      <p style={s.srOnly} role="status" aria-live="polite">
        {active.length} {active.length === 1 ? 'row' : 'rows'} in{' '}
        {TABS.find((t) => t.id === tab).label.toLowerCase()}
      </p>

      {!active.length ? (
        <div style={s.note}>
          {term ? (
            <>
              Nothing matches “{search.trim()}” in {TABS.find((t) => t.id === tab).label.toLowerCase()}.
              <button type="button" style={s.clear} onClick={() => setSearch('')}>Clear search</button>
            </>
          ) : tab === 'today' ? (
            `No preps written for ${consultant} today.`
          ) : tab === 'past' ? (
            'No earlier preps.'
          ) : (
            `No snapshots for ${consultant} yet.`
          )}
        </div>
      ) : (
        <>
          <table style={s.table} aria-label={TABS.find((t) => t.id === tab).label}>
            <thead>
              <tr>
                {tab === 'past' && <th scope="col" style={s.th}>Date</th>}
                <th scope="col" style={s.th}>Account</th>
                {tab !== 'accounts' && <th scope="col" style={s.th}>Call type</th>}
                <th scope="col" style={s.th}>Sync</th>
                <th scope="col" style={{ ...s.th, ...s.thNum }}>Open cases</th>
                {tab === 'accounts' && <th scope="col" style={s.th}>Last session</th>}
                {tab === 'accounts' && <th scope="col" style={s.th}>Last snapshot</th>}
                <th scope="col" style={s.th}>Attention</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const snap = tab === 'accounts' ? row.snap : row;
                const flags = tab === 'accounts' ? row.flags : computeFlags(snap, todayIso);
                return (
                  <tr
                    key={tab === 'accounts' ? snap.accountRecordId : `${snap.accountRecordId}-${snap.snapshotDate}`}
                    style={s.rowClickable}
                    onClick={() => navigate(`/call-prep/account/${encodeURIComponent(snap.accountRecordId)}`)}
                  >
                    {tab === 'past' && <td style={{ ...s.td, ...s.tdDate }}>{snap.snapshotDate}</td>}
                    <td style={s.td}><AccountCell snap={snap} /></td>
                    {tab !== 'accounts' && <td style={s.td}>{snap.callType ?? '—'}</td>}
                    <td style={s.td}>{sentenceCase(snap.syncStatus)}</td>
                    <td style={{ ...s.td, ...s.tdNum }}>{snap.casesOpenCount}</td>
                    {tab === 'accounts' && <td style={s.td}>{snap.ttLastSessionDate ?? '—'}</td>}
                    {tab === 'accounts' && <td style={s.td}>{snap.snapshotDate}</td>}
                    <td style={s.td}><Flags flags={flags} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {(shown.length < active.length
            || (tab === 'past' && history.length >= PREP_HISTORY_LIMIT)) && (
            <div style={s.more}>
              {shown.length < active.length && (
                <button type="button" style={s.moreBtn} onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, active.length - shown.length)} more
                </button>
              )}
              <span style={s.count}>
                Showing {shown.length} of {active.length}
                {history.length >= PREP_HISTORY_LIMIT && tab === 'past'
                  ? ` · only the latest ${PREP_HISTORY_LIMIT} preps are loaded`
                  : ''}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
