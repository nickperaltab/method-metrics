import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { fetchDashboards, fetchStars, fetchRecentViews } from '../lib/supabase';

const styles = {
  layout: { padding: '32px 24px', maxWidth: 1200, margin: '0 auto' },
  greeting: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 },
  subtitle: { color: '#6b7280', fontSize: 14, marginBottom: 32 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#6b7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.05em' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
  card: {
    background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 8,
    padding: 16, cursor: 'pointer', transition: 'border-color 0.15s',
  },
  cardName: { fontSize: 14, fontWeight: 600, color: '#1a1a1a', marginBottom: 4 },
  cardMeta: { fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" },
  empty: { color: '#6b7280', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" },
};

export default function Home() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [dashboards, setDashboards] = useState([]);
  const [stars, setStars] = useState([]);
  const [recentIds, setRecentIds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [dbs, starIds, views] = await Promise.allSettled([
          fetchDashboards(),
          currentUser ? fetchStars(currentUser.id) : Promise.resolve([]),
          currentUser ? fetchRecentViews(currentUser.id, 10) : Promise.resolve([]),
        ]);
        setDashboards(dbs.status === 'fulfilled' ? dbs.value : []);
        setStars(starIds.status === 'fulfilled' ? starIds.value : []);
        // Deduplicate recent views, keeping most recent per dashboard
        const viewData = views.status === 'fulfilled' ? views.value : [];
        const seen = new Set();
        const uniqueRecent = [];
        for (const v of viewData) {
          if (!seen.has(v.dashboard_id)) {
            seen.add(v.dashboard_id);
            uniqueRecent.push(v.dashboard_id);
          }
        }
        setRecentIds(uniqueRecent);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentUser]);

  if (loading) {
    return <div style={styles.layout}><div style={styles.empty}>Loading...</div></div>;
  }

  const starredDashboards = dashboards.filter(d => stars.includes(d.id));
  const recentDashboards = recentIds
    .map(id => dashboards.find(d => d.id === id))
    .filter(Boolean)
    .filter(d => !stars.includes(d.id)); // Don't repeat starred items
  const approvedDashboards = dashboards.filter(d => d.is_approved);

  function renderCard(db) {
    return (
      <div
        key={db.id}
        style={styles.card}
        onClick={() => navigate(`/dashboards/${db.id}`)}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#059669'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e5e9'}
      >
        <div style={styles.cardName}>
          {stars.includes(db.id) && <span style={{ color: '#f59e0b', marginRight: 6 }}>{'\u2605'}</span>}
          {db.name}
        </div>
        <div style={styles.cardMeta}>
          {(db.layout || []).length} chart{(db.layout || []).length !== 1 ? 's' : ''}
          {db.updated_at && ` \u00B7 ${new Date(db.updated_at).toLocaleDateString()}`}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      <div style={styles.greeting}>
        {currentUser ? `Hey ${currentUser.name}` : 'Metrics Hub'}
      </div>
      <div style={styles.subtitle}>
        Single source of truth for Method's revenue and marketing metrics.
      </div>

      {/* Favorites */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>{'\u2605'} Favorites</div>
        {starredDashboards.length > 0 ? (
          <div style={styles.grid}>{starredDashboards.map(renderCard)}</div>
        ) : (
          <div style={styles.empty}>Star a dashboard to see it here.</div>
        )}
      </div>

      {/* Recently Viewed */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Recently Viewed</div>
        {recentDashboards.length > 0 ? (
          <div style={styles.grid}>{recentDashboards.map(renderCard)}</div>
        ) : (
          <div style={styles.empty}>Dashboards you open will appear here.</div>
        )}
      </div>

      {/* Recommended */}
      {approvedDashboards.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Recommended</div>
          <div style={styles.grid}>{approvedDashboards.map(renderCard)}</div>
        </div>
      )}
    </div>
  );
}
