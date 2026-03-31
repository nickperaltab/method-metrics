import React, { useState, useEffect } from 'react';
import { fetchMetrics, fetchAllApprovedDimensions } from '../lib/supabase';

const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFna3ViZHBnbnB3dWR6cHpjdmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MDU4MzEsImV4cCI6MjA4ODk4MTgzMX0.tfpIArmqYQn7IHOrIUY6L-Wc4HcpMLXiTR6vKPJLDjY';
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

export default function Dimensions() {
  const [metrics, setMetrics] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [loading, setLoading] = useState(true);

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

  async function addDimension(metricId) {
    const name = window.prompt('Dimension display name (e.g. "Channel"):');
    if (!name) return;
    const column = window.prompt('Column name in BQ view (e.g. "Channel"):');
    if (!column) return;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/approved_dimensions`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ metric_id: metricId, dimension_name: name, column_name: column, verified_at: new Date().toISOString() }),
    });
    if (!res.ok) { alert('Failed to add dimension'); return; }
    const created = await res.json();
    setDimensions(prev => [...prev, ...(Array.isArray(created) ? created : [created])]);
  }

  async function deleteDimension(id) {
    if (!window.confirm('Remove this dimension?')) return;
    await fetch(`${SUPABASE_URL}/rest/v1/approved_dimensions?id=eq.${id}`, { method: 'DELETE', headers });
    setDimensions(prev => prev.filter(d => d.id !== id));
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
  title: { fontSize: 20, fontWeight: 700, color: '#edf0f3', margin: '0 0 4px' },
  subtitle: { color: '#5a6370', fontSize: 13, marginBottom: 32 },
  metricSection: { marginBottom: 24, background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 8, overflow: 'hidden' },
  metricHeader: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #1a1e24' },
  metricName: { fontWeight: 600, color: '#edf0f3', fontSize: 14 },
  metricId: { color: '#5a6370', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  addBtn: { marginLeft: 'auto', background: 'none', border: '1px solid #1a3d2e', color: '#34d399', padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  dimList: { padding: '4px 0' },
  dimRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', fontSize: 13 },
  dimName: { color: '#c8cdd3', fontWeight: 500, width: 140 },
  dimCol: { color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, flex: 1 },
  dimDate: { color: '#5a6370', fontSize: 11 },
  removeBtn: { background: 'none', border: 'none', color: '#5a6370', cursor: 'pointer', fontSize: 14, padding: '0 4px' },
  noDims: { padding: '12px 16px', color: '#5a6370', fontSize: 12, fontStyle: 'italic' },
  empty: { color: '#5a6370', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
