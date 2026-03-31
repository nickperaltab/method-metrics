import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SUPABASE_URL, SUPABASE_KEY, headers } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';

export default function Charts() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [sortBy, setSortBy] = useState('updated');
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/saved_charts?select=*&order=updated_at.desc.nullsfirst,created_at.desc`, { headers });
        if (res.ok) setCharts(await res.json());
        else setError(`Failed to load charts (${res.status})`);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = charts.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'created') return new Date(b.created_at) - new Date(a.created_at);
    return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
  });

  async function handleDelete(ids) {
    if (!window.confirm(`Delete ${ids.length} chart(s)?`)) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/saved_charts?id=in.(${ids.map(Number).filter(Number.isFinite).join(',')})`, { method: 'DELETE', headers });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setCharts(prev => prev.filter(c => !ids.includes(c.id)));
      setSelected(new Set());
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRename(id) {
    const chart = charts.find(c => c.id === id);
    const name = window.prompt('New name:', chart?.name);
    if (!name || name === chart?.name) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/saved_charts?id=eq.${Number(id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error(`Rename failed (${res.status})`);
      setCharts(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading...</div></div>;

  return (
    <div style={s.layout}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>My Charts</h1>
          <p style={s.subtitle}>{charts.length} chart{charts.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>}

      <div style={s.controls}>
        <input
          type="text"
          placeholder="Search charts..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={s.search}
        />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={s.sortSelect}>
          <option value="updated">Last Modified</option>
          <option value="name">Name</option>
          <option value="created">Created</option>
        </select>
        {selected.size > 0 && (
          <button style={s.deleteBtn} onClick={() => handleDelete([...selected])}>
            Delete {selected.size}
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div style={s.empty}>
          {search ? 'No charts match your search.' : 'No charts yet. Use the Chart Builder to create your first chart.'}
        </div>
      ) : (
        <div style={s.list}>
          {sorted.map(chart => (
            <div key={chart.id} style={s.row}>
              <input
                type="checkbox"
                checked={selected.has(chart.id)}
                onChange={() => {
                  setSelected(prev => {
                    const next = new Set(prev);
                    if (next.has(chart.id)) next.delete(chart.id); else next.add(chart.id);
                    return next;
                  });
                }}
              />
              <div style={s.chartInfo}>
                <div style={s.chartName}>{chart.name || 'Untitled'}</div>
                <div style={s.chartMeta}>
                  {(chart.metric_ids || []).length} metric{(chart.metric_ids || []).length !== 1 ? 's' : ''}
                  {' \u00B7 '}
                  {chart.gw_spec?.echartsType || 'chart'}
                  {chart.created_at && ` \u00B7 ${new Date(chart.created_at).toLocaleDateString()}`}
                </div>
              </div>
              <div style={s.actions}>
                <button style={s.actionBtn} onClick={() => handleRename(chart.id)}>rename</button>
                <button style={s.actionBtn} onClick={() => navigate(`/chat?edit=${chart.id}`)}>edit</button>
                <button style={{ ...s.actionBtn, color: '#f87171' }} onClick={() => handleDelete([chart.id])}>delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 900, margin: '0 auto' },
  header: { marginBottom: 24 },
  title: { fontSize: 20, fontWeight: 700, color: '#edf0f3', margin: 0 },
  subtitle: { color: '#5a6370', fontSize: 13, marginTop: 4 },
  controls: { display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' },
  search: { background: '#0c0f12', border: '1px solid #1a1e24', color: '#c8cdd3', padding: '6px 12px', borderRadius: 4, fontSize: 12, flex: 1, maxWidth: 300 },
  sortSelect: { background: '#0c0f12', border: '1px solid #1a1e24', color: '#c8cdd3', padding: '6px 10px', borderRadius: 4, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  deleteBtn: { background: 'none', border: '1px solid #f87171', color: '#f87171', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  list: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 6 },
  chartInfo: { flex: 1 },
  chartName: { fontSize: 14, fontWeight: 600, color: '#edf0f3' },
  chartMeta: { fontSize: 11, color: '#5a6370', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 },
  actions: { display: 'flex', gap: 8 },
  actionBtn: { background: 'none', border: 'none', color: '#5a6370', cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: '2px 6px' },
  empty: { color: '#5a6370', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
};
