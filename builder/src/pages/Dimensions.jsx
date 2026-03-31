import React, { useState, useEffect } from 'react';
import { fetchMetrics, fetchAllApprovedDimensions, SUPABASE_URL, headers } from '../lib/supabase';
import Dialog from '../components/Dialog';

export default function Dimensions() {
  const [metrics, setMetrics] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [m, d] = await Promise.all([fetchMetrics(), fetchAllApprovedDimensions()]);
        setMetrics(m.filter(x => x.status === 'live'));
        setDimensions(d);
      } catch (e) {
        console.error('Failed to load:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function addDimension(metricId) {
    setDialog({
      type: 'prompt',
      title: 'Add dimension',
      label: 'Display name (e.g. "Channel")',
      defaultValue: '',
      onConfirm: (name) => {
        setDialog({
          type: 'prompt',
          title: 'Add dimension',
          label: 'Column name in BQ view (e.g. "Channel")',
          defaultValue: '',
          onConfirm: async (column) => {
            setDialog(null);
            const res = await fetch(`${SUPABASE_URL}/rest/v1/approved_dimensions`, {
              method: 'POST',
              headers: { ...headers, Prefer: 'return=representation' },
              body: JSON.stringify({ metric_id: metricId, dimension_name: name, column_name: column, verified_at: new Date().toISOString() }),
            });
            if (!res.ok) return;
            const created = await res.json();
            setDimensions(prev => [...prev, ...(Array.isArray(created) ? created : [created])]);
          },
          onCancel: () => setDialog(null),
        });
      },
      onCancel: () => setDialog(null),
    });
  }

  function deleteDimension(id) {
    setDialog({
      type: 'confirm',
      title: 'Remove dimension?',
      message: 'This cannot be undone.',
      danger: true,
      confirmLabel: 'Remove',
      onConfirm: async () => {
        setDialog(null);
        await fetch(`${SUPABASE_URL}/rest/v1/approved_dimensions?id=eq.${id}`, { method: 'DELETE', headers });
        setDimensions(prev => prev.filter(d => d.id !== id));
      },
      onCancel: () => setDialog(null),
    });
  }

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading...</div></div>;

  // Group dimensions by metric
  const grouped = {};
  for (const d of dimensions) {
    if (!grouped[d.metric_id]) grouped[d.metric_id] = [];
    grouped[d.metric_id].push(d);
  }

  return (
    <div style={s.layout}>
      {dialog && <Dialog {...dialog} />}
      <h1 style={s.title}>Approved Dimensions</h1>
      <p style={s.subtitle}>
        Only approved dimensions appear as filter options in the chart builder.
        Add a dimension after verifying it produces correct results.
      </p>

      {metrics.map(m => (
        <div key={m.id} style={s.metricSection}>
          <div style={s.metricHeader}>
            <span style={s.metricName}>{m.name}</span>
            <span style={s.metricId}>#{m.id}</span>
            <button style={s.addBtn} onClick={() => addDimension(m.id)}>+ Add</button>
          </div>
          {(grouped[m.id] || []).length > 0 ? (
            <div style={s.dimList}>
              {grouped[m.id].map(d => (
                <div key={d.id} style={s.dimRow}>
                  <span style={s.dimName}>{d.dimension_name}</span>
                  <span style={s.dimCol}>{d.column_name}</span>
                  <span style={s.dimDate}>{d.verified_at ? new Date(d.verified_at).toLocaleDateString() : 'unverified'}</span>
                  <button style={s.removeBtn} onClick={() => deleteDimension(d.id)}>{'\u2715'}</button>
                </div>
              ))}
            </div>
          ) : (
            <div style={s.noDims}>No approved dimensions yet</div>
          )}
        </div>
      ))}

      {metrics.length === 0 && <div style={s.empty}>No live metrics found.</div>}
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 900, margin: '0 auto' },
  title: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' },
  subtitle: { color: '#6b7280', fontSize: 13, marginBottom: 32 },
  metricSection: { marginBottom: 24, background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 8, overflow: 'hidden' },
  metricHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #e2e5e9' },
  metricName: { fontWeight: 600, color: '#1a1a1a', fontSize: 14 },
  metricId: { color: '#6b7280', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  addBtn: { marginLeft: 'auto', background: 'none', border: '1px solid #a7f3d0', color: '#059669', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  dimList: { padding: '4px 0' },
  dimRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', fontSize: 13 },
  dimName: { color: '#374151', fontWeight: 500, width: 140 },
  dimCol: { color: '#059669', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, flex: 1 },
  dimDate: { color: '#6b7280', fontSize: 11 },
  removeBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: '0 4px' },
  noDims: { padding: '12px 16px', color: '#6b7280', fontSize: 12, fontStyle: 'italic' },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
