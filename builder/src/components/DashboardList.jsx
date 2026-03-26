import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboards, createDashboard, loadCharts } from '../lib/supabase';

const styles = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto', minHeight: 'calc(100vh - 52px)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 600, color: '#edf0f3' },
  newBtn: {
    background: '#0a1f17', border: '1px solid #34d399', color: '#34d399',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  card: {
    background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8,
    padding: 20, cursor: 'pointer', transition: 'border-color 0.15s',
  },
  cardName: { fontSize: 15, fontWeight: 600, color: '#edf0f3', marginBottom: 8 },
  cardMeta: { fontSize: 12, color: '#5a6370', fontFamily: "'JetBrains Mono', monospace" },
  section: { marginTop: 40 },
  sectionTitle: { fontSize: 16, fontWeight: 600, color: '#edf0f3', marginBottom: 16 },
  empty: { color: '#5a6370', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
  chartCard: {
    background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8,
    padding: 16,
  },
  chartName: { fontSize: 13, fontWeight: 600, color: '#edf0f3', marginBottom: 4 },
  chartInfo: { fontSize: 11, color: '#5a6370', fontFamily: "'JetBrains Mono', monospace" },
};

export default function DashboardList({ userEmail }) {
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState([]);
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dbs, savedCharts] = await Promise.allSettled([
          fetchDashboards(),
          userEmail ? loadCharts(userEmail) : Promise.resolve([]),
        ]);
        setDashboards(dbs.status === 'fulfilled' ? dbs.value : []);
        setCharts(savedCharts.status === 'fulfilled' ? savedCharts.value : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userEmail]);

  const handleNew = useCallback(async () => {
    const name = window.prompt('Dashboard name:');
    if (!name) return;
    try {
      const result = await createDashboard({
        name,
        createdBy: userEmail || 'anonymous',
        layout: [],
      });
      const created = Array.isArray(result) ? result[0] : result;
      if (created?.id) {
        navigate(`/dashboards/${created.id}`);
      }
    } catch (e) {
      setError(`Create failed: ${e.message}`);
    }
  }, [userEmail, navigate]);

  if (loading) {
    return (
      <div style={styles.layout}>
        <div style={styles.empty}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      <div style={styles.header}>
        <span style={styles.title}>My Dashboards</span>
        <button style={styles.newBtn} onClick={handleNew}>+ New Dashboard</button>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 16 }}>{error}</div>}

      {dashboards.length === 0 ? (
        <div style={styles.empty}>
          No dashboards yet. Create one to start arranging your saved charts.
        </div>
      ) : (
        <div style={styles.grid}>
          {dashboards.map(db => (
            <div
              key={db.id}
              style={styles.card}
              onClick={() => navigate(`/dashboards/${db.id}`)}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#34d399'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#1a1e24'}
            >
              <div style={styles.cardName}>{db.name}</div>
              <div style={styles.cardMeta}>
                {(db.layout || []).length} chart{(db.layout || []).length !== 1 ? 's' : ''}
                {db.updated_at && ` · ${new Date(db.updated_at).toLocaleDateString()}`}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Chart Library</div>
        {charts.length === 0 ? (
          <div style={styles.empty}>
            No saved charts yet. Use the Explorer to create and save charts.
          </div>
        ) : (
          <div style={styles.grid}>
            {charts.map(chart => (
              <div key={chart.id} style={styles.chartCard}>
                <div style={styles.chartName}>{chart.name}</div>
                <div style={styles.chartInfo}>
                  {(chart.metric_ids || []).length} metric{(chart.metric_ids || []).length !== 1 ? 's' : ''}
                  {chart.created_at && ` · ${new Date(chart.created_at).toLocaleDateString()}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
