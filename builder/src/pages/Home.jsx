import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { isAdmin, canDelete } from '../lib/permissions';
import { fetchMyDashboards, fetchAllDashboards, fetchApprovedDashboardsList, fetchStars, starDashboard, unstarDashboard, deleteDashboard, setApproved, updateDashboard } from '../lib/supabase';
import { SCORECARDS } from '../config/scorecards';
import Dialog from '../components/Dialog';
import posthog from '../lib/posthog';

const HAIRLINE = '#eceef1';

const s = {
  layout: { padding: '40px 24px 80px', maxWidth: 960, margin: '0 auto' },
  pageTitle: { fontSize: 22, fontWeight: 600, color: '#1a1a1a', marginBottom: 36, letterSpacing: '-0.01em' },

  section: { marginBottom: 44 },
  sectionHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 },
  sectionTitle: { fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8a9099', fontFamily: "'JetBrains Mono', monospace" },
  sectionCount: { fontSize: 10, color: '#b4b9c0', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.08em' },

  list: { borderTop: `1px solid ${HAIRLINE}` },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 4px',
    borderBottom: `1px solid ${HAIRLINE}`,
    cursor: 'pointer',
    transition: 'background-color 120ms ease',
    position: 'relative',
  },
  rowName: { flex: 1, fontSize: 14, fontWeight: 500, color: '#1a1a1a', letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rowMeta: { fontSize: 11, color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.02em' },

  starBtn: {
    background: 'none',
    border: 'none',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 2px',
    lineHeight: 1,
    width: 22,
    textAlign: 'center',
    transition: 'color 120ms ease',
  },

  // Muted "Review Requested" — quiet amber text, no background
  reviewTag: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: '#b45309',
    fontFamily: "'JetBrains Mono', monospace",
  },

  actionsWrap: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    transition: 'opacity 120ms ease',
  },
  actionBtn: {
    background: 'transparent',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '.02em',
    padding: '3px 6px',
    borderRadius: 3,
  },
  actionBtnDanger: { color: '#b42318' },
  actionBtnReview: { color: '#b45309' },

  search: {
    width: '100%',
    padding: '10px 0',
    border: 'none',
    borderBottom: `1px solid ${HAIRLINE}`,
    fontSize: 13,
    background: 'transparent',
    color: '#1a1a1a',
    marginBottom: 4,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },

  empty: { fontSize: 12, color: '#9ca3af', padding: '16px 0', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.02em' },

  chipRow: { display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 },
  chip: { fontSize: 12, color: '#6b7280', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'color 120ms ease' },
  chipStar: { color: '#cfd4da', fontSize: 12, lineHeight: 1, transition: 'color 120ms ease' },
};

const ALL_SCORECARDS = Object.values(SCORECARDS).filter(sc => !sc.group);
const SCORECARD_STARS_KEY = 'method_scorecard_stars';
const SCORECARD_STARS_INIT_KEY = 'method_scorecard_stars_initialized';

export function getScorecardStars() {
  // On first access, default-star all Method Approved scorecards for new users
  if (!localStorage.getItem(SCORECARD_STARS_INIT_KEY)) {
    const defaultStars = ALL_SCORECARDS.map(sc => sc.id);
    localStorage.setItem(SCORECARD_STARS_KEY, JSON.stringify(defaultStars));
    localStorage.setItem(SCORECARD_STARS_INIT_KEY, '1');
    return defaultStars;
  }
  return JSON.parse(localStorage.getItem(SCORECARD_STARS_KEY) || '[]');
}

export default function Home() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const admin = isAdmin(currentUser);
  const [dashboards, setDashboards] = useState([]);
  const [dbStars, setDbStars] = useState([]);
  const [scStars, setScStars] = useState(() => getScorecardStars());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [hoverId, setHoverId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, starIds] = await Promise.all([
        admin
          ? fetchAllDashboards()
          : Promise.all([
              currentUser ? fetchMyDashboards(currentUser.id) : Promise.resolve([]),
              fetchApprovedDashboardsList(),
            ]).then(([mine, approved]) => {
              const merged = [...mine];
              for (const d of approved) {
                if (!merged.some(x => x.id === d.id)) merged.push(d);
              }
              return merged;
            }),
        currentUser ? fetchStars(currentUser.id) : Promise.resolve([]),
      ]);
      setDashboards(all);
      setDbStars(starIds);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [currentUser, admin]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('stars-changed', handler);
    return () => window.removeEventListener('stars-changed', handler);
  }, [load]);

  const toggleDbStar = useCallback(async (e, db) => {
    e.stopPropagation();
    if (!currentUser) return;
    const isStarred = dbStars.includes(db.id);
    if (isStarred) {
      await unstarDashboard(db.id, currentUser.id);
      setDbStars(prev => prev.filter(id => id !== db.id));
    } else {
      await starDashboard(db.id, currentUser.id);
      setDbStars(prev => [...prev, db.id]);
    }
    window.dispatchEvent(new Event('stars-changed'));
  }, [currentUser, dbStars]);

  const toggleScStar = useCallback((e, id) => {
    e.stopPropagation();
    setScStars(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem(SCORECARD_STARS_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event('stars-changed'));
      return next;
    });
  }, []);

  const handleDelete = useCallback((e, db) => {
    e.stopPropagation();
    setDialog({
      type: 'confirm',
      title: `Delete "${db.name}"?`,
      message: 'This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDialog(null);
        await deleteDashboard(db.id);
        window.dispatchEvent(new Event('stars-changed'));
        await load();
      },
      onCancel: () => setDialog(null),
    });
  }, [load]);

  const handleRename = useCallback((e, db) => {
    e.stopPropagation();
    setDialog({
      type: 'prompt',
      title: 'Rename dashboard',
      label: 'Name',
      defaultValue: db.name,
      onConfirm: async (name) => {
        setDialog(null);
        if (name === db.name) return;
        await updateDashboard(db.id, { name });
        await load();
        window.dispatchEvent(new Event('stars-changed'));
      },
      onCancel: () => setDialog(null),
    });
  }, [load]);

  const handleToggleApproval = useCallback(async (e, db) => {
    e.stopPropagation();
    await setApproved('dashboards', db.id, !db.is_approved);
    await load();
  }, [load]);

  // Sort starred to top
  const sortedScorecards = [...ALL_SCORECARDS].sort((a, b) => {
    const aS = scStars.includes(a.id) ? 0 : 1;
    const bS = scStars.includes(b.id) ? 0 : 1;
    return aS - bS;
  });

  const starredScorecards = sortedScorecards.filter(sc => scStars.includes(sc.id));
  const unstarredScorecards = sortedScorecards.filter(sc => !scStars.includes(sc.id));

  const filtered = dashboards
    .filter(db => !search || db.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aS = dbStars.includes(a.id) ? 0 : 1;
      const bS = dbStars.includes(b.id) ? 0 : 1;
      return aS - bS;
    });

  const rowHover = (id) => ({
    backgroundColor: hoverId === id ? '#f7f8f9' : 'transparent',
  });

  return (
    <div style={s.layout}>
      {dialog && <Dialog {...dialog} />}

      <div style={s.pageTitle}>Home</div>

      {/* Scorecards */}
      <div style={s.section}>
        <div style={s.sectionHead}>
          <span style={s.sectionTitle}>Scorecards</span>
          <span style={s.sectionCount}>{ALL_SCORECARDS.length}</span>
        </div>

        {starredScorecards.length > 0 && (
          <div style={s.list}>
            {starredScorecards.map(sc => (
              <div
                key={sc.id}
                style={{ ...s.row, ...rowHover(`sc:${sc.id}`) }}
                onClick={() => { posthog.capture('home_scorecard_clicked', { scorecard_id: sc.id }); navigate(`/scorecards/${sc.id}`); }}
                onMouseEnter={() => setHoverId(`sc:${sc.id}`)}
                onMouseLeave={() => setHoverId(null)}
              >
                <button
                  style={{ ...s.starBtn, color: '#f59e0b' }}
                  onClick={e => toggleScStar(e, sc.id)}
                  aria-label="Unstar"
                >★</button>
                <span style={s.rowName}>{sc.title}</span>
                <span style={s.rowMeta}>scorecard</span>
              </div>
            ))}
          </div>
        )}

        {unstarredScorecards.length > 0 && (
          <div style={{ ...s.chipRow, marginTop: starredScorecards.length > 0 ? 16 : 0 }}>
            {unstarredScorecards.map(sc => (
              <span
                key={sc.id}
                style={s.chip}
                onClick={() => { posthog.capture('home_scorecard_clicked', { scorecard_id: sc.id }); navigate(`/scorecards/${sc.id}`); }}
                onMouseEnter={e => { e.currentTarget.style.color = '#1a1a1a'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
              >
                <span
                  style={s.chipStar}
                  onClick={e => toggleScStar(e, sc.id)}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f59e0b'; e.stopPropagation(); }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#cfd4da'; }}
                  title="Star to pin"
                >☆</span>
                {sc.title}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* AI Dashboards */}
      <div style={s.section}>
        <div style={s.sectionHead}>
          <span style={s.sectionTitle}>AI Dashboards</span>
          <span style={s.sectionCount}>{loading ? '—' : filtered.length}</span>
        </div>

        <input
          style={s.search}
          placeholder="Search dashboards"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        {loading ? (
          <div style={s.empty}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>No dashboards found.</div>
        ) : (
          <div style={s.list}>
            {filtered.map(db => {
              const isStarred = dbStars.includes(db.id);
              const isMine = canDelete(currentUser, db);
              const isHover = hoverId === `db:${db.id}`;
              const showActions = isHover && (isMine || (isMine && admin));
              return (
                <div
                  key={db.id}
                  style={{ ...s.row, ...rowHover(`db:${db.id}`) }}
                  onClick={() => { posthog.capture('home_dashboard_clicked', { dashboard_id: db.id }); navigate(`/dashboards/${db.id}`); }}
                  onMouseEnter={() => setHoverId(`db:${db.id}`)}
                  onMouseLeave={() => setHoverId(null)}
                >
                  <button
                    style={{ ...s.starBtn, color: isStarred ? '#f59e0b' : (isHover ? '#9ca3af' : '#d1d5db') }}
                    onClick={e => toggleDbStar(e, db)}
                    aria-label={isStarred ? 'Unstar' : 'Star'}
                  >
                    {isStarred ? '★' : '☆'}
                  </button>

                  <span
                    style={s.rowName}
                    onClick={isMine ? e => handleRename(e, db) : undefined}
                    title={isMine ? 'Click to rename' : ''}
                  >
                    {db.name}
                  </span>

                  <span style={s.rowMeta}>{db.created_by?.split('@')[0] || '—'}</span>

                  {isMine && (
                    <div style={{ ...s.actionsWrap, opacity: isHover ? 1 : 0, pointerEvents: isHover ? 'auto' : 'none' }}>
                      <button
                        style={{ ...s.actionBtn, ...s.actionBtnDanger }}
                        onClick={e => handleDelete(e, db)}
                      >
                        delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
