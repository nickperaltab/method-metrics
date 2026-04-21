import React, { useState, useEffect, useCallback } from 'react';
import { fetchMetrics, SUPABASE_URL, headers } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { isAdmin } from '../lib/permissions';
import Dialog from '../components/Dialog';
import DependencyView from '../components/DependencyView';

function formatMetricForCopy(m) {
  const lines = [];
  lines.push(`# ${m.name} (id: ${m.id})`);
  if (m.status) lines.push(`Status: ${m.status}${m.verified_at ? ' (verified)' : ''}`);
  if (m.metric_type) lines.push(`Type: ${m.metric_type}`);
  if (m.description) lines.push(`\n${m.description}`);
  if (m.formula) lines.push(`\nFormula: ${m.formula}`);
  if (m.depends_on?.length) lines.push(`Depends on: [${m.depends_on.join(', ')}]`);
  if (m.semantic_table) {
    lines.push(`\nSource: ${m.semantic_table}`);
    if (m.semantic_measure) lines.push(`Measure: ${m.semantic_measure}`);
    if (m.semantic_date_col) lines.push(`Date column: ${m.semantic_date_col}`);
    if (m.semantic_filters?.length) lines.push(`Filters: ${m.semantic_filters.join(' AND ')}`);
    if (m.semantic_dimensions?.length) lines.push(`Dimensions: [${m.semantic_dimensions.join(', ')}]`);
  }
  if (m.view_name && m.view_name !== m.semantic_table) lines.push(`View: ${m.view_name}`);
  if (m.chart_sql) lines.push(`\nSQL:\n${m.chart_sql}`);
  return lines.join('\n');
}

function CopyButton({ metric, copied, onCopy, size = 20, withLabel = false }) {
  const canCopy = metric.status === 'live';
  const color = copied ? '#059669' : (canCopy ? '#6b7280' : '#d1d5db');
  return (
    <button
      disabled={!canCopy}
      onClick={canCopy ? onCopy : undefined}
      title={canCopy ? 'Copy metric definition' : 'Only live metrics can be copied'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'none', border: 'none',
        cursor: canCopy ? 'pointer' : 'not-allowed',
        padding: 4,
        color,
        opacity: canCopy ? 1 : 0.5,
      }}
    >
      {copied ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {withLabel && <span style={{ fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{copied ? 'Copied' : 'Copy definition'}</span>}
    </button>
  );
}

async function updateMetric(id, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/metrics?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Update failed: ${res.status}`);
}

async function deleteMetrics(ids) {
  const safeIds = ids.map(Number).filter(Number.isFinite);
  if (safeIds.length === 0) return;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/metrics?id=in.(${safeIds.join(',')})`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}

export default function Registry() {
  const { currentUser } = useUser();
  const admin = isAdmin(currentUser);
  const [metrics, setMetrics] = useState([]);
  const [copiedId, setCopiedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, _setTab] = useState('live');
  const setTab = (t) => _setTab((t === 'queued' && !admin) ? 'live' : t);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedId, setExpandedId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    fetchMetrics().then(data => {
      setMetrics(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const reload = useCallback(async () => {
    const data = await fetchMetrics();
    setMetrics(data);
  }, []);

  const filtered = metrics
    .filter(m => (tab === 'queued' ? m.status !== 'live' : m.status === 'live'))
    .filter(m => !search || m.name?.toLowerCase().includes(search.toLowerCase()));

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortCol] || '';
    const bv = b[sortCol] || '';
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const primitives = sorted.filter(m => (m.metric_type || 'primitive') !== 'derived');
  const derived = sorted.filter(m => m.metric_type === 'derived');

  const counts = {
    livePrim: metrics.filter(m => m.status === 'live' && m.metric_type !== 'derived').length,
    liveDerived: metrics.filter(m => m.status === 'live' && m.metric_type === 'derived').length,
    queued: metrics.filter(m => m.status !== 'live').length,
    approved: metrics.filter(m => m.status === 'live' && m.verified_at).length,
  };

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    if (selected.size === 0) return;
    setDialog({
      type: 'confirm',
      title: `Delete ${selected.size} metric${selected.size !== 1 ? 's' : ''}?`,
      message: 'This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDialog(null);
        await deleteMetrics([...selected]);
        setSelected(new Set());
        await reload();
      },
      onCancel: () => setDialog(null),
    });
  }

  function handleDeleteMetric(m) {
    setDialog({
      type: 'confirm',
      title: `Delete "${m.name}"?`,
      message: 'This cannot be undone.',
      danger: true,
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setDialog(null);
        await deleteMetrics([m.id]);
        await reload();
      },
      onCancel: () => setDialog(null),
    });
  }

  async function handleSaveField(id, field, value) {
    await updateMetric(id, { [field]: value });
    setMetrics(prev => prev.map(m => m.id === id ? { ...m, [field]: value } : m));
  }

  if (loading) return <div style={s.layout}><div style={s.empty}>Loading metrics...</div></div>;

  return (
    <div style={s.layout}>
      {dialog && <Dialog {...dialog} />}
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Metric Registry</h1>
          <p style={s.subtitle}>All metrics in the system. Live metrics are verified and available in the chart builder.</p>
        </div>
        <div style={s.stats}>
          <div style={s.stat}><span style={{ ...s.statVal, color: '#059669' }}>{counts.livePrim}</span><span style={s.statLabel}>Live Primitives</span></div>
          <div style={s.stat}><span style={{ ...s.statVal, color: '#2563eb' }}>{counts.liveDerived}</span><span style={s.statLabel}>Live Derived</span></div>
          <div style={s.stat}><span style={s.statVal}>{counts.queued}</span><span style={s.statLabel}>Queued</span></div>
          <div style={s.stat}><span style={{ ...s.statVal, color: '#f59e0b' }}>{counts.approved}</span><span style={s.statLabel}>Approved</span></div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div style={s.controls}>
        <div style={s.tabs}>
          <button style={tab === 'live' ? s.tabActive : s.tab} onClick={() => setTab('live')}>Live</button>
          {admin && <button style={tab === 'queued' ? s.tabActive : s.tab} onClick={() => setTab('queued')}>Queued</button>}
          <button style={tab === 'deps' ? s.tabActive : s.tab} onClick={() => setTab('deps')}>Dependencies</button>
        </div>
        {tab !== 'deps' && (
          <input
            type="text"
            placeholder="Search metrics..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={s.search}
          />
        )}
        {tab !== 'deps' && selected.size > 0 && (
          <button style={s.deleteBtn} onClick={handleBulkDelete}>
            Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Dependencies tab */}
      {tab === 'deps' && <DependencyView metrics={metrics} />}

      {/* Table (live/queued tabs) */}
      {tab !== 'deps' && <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {admin && <th style={s.th}><input type="checkbox" onChange={e => {
                if (e.target.checked) setSelected(new Set(sorted.map(m => m.id)));
                else setSelected(new Set());
              }} /></th>}
              <th style={{ ...s.th, width: 48, textAlign: 'center' }}></th>
              <th style={s.th} onClick={() => toggleSort('name')}>Name {sortCol === 'name' ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}</th>
              <th style={{ ...s.th, width: 60 }} onClick={() => toggleSort('id')}>ID {sortCol === 'id' ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}</th>
              <th style={s.th}>Type</th>
              {tab === 'live' && <th style={{ ...s.th, textAlign: 'center' }}>Approved</th>}
              <th style={s.th}>Description</th>
              {admin && tab === 'queued' && <th style={s.th}>Priority</th>}
              {admin && tab === 'queued' && <th style={s.th}>Assigned</th>}
            </tr>
          </thead>
          <tbody>
            {[
              { items: primitives, label: 'Primitives', color: '#059669' },
              { items: derived, label: 'Derived', color: '#2563eb' },
            ].map(group => group.items.length > 0 && (
              <React.Fragment key={group.label}>
                <tr><td colSpan={(admin ? 2 : 1) + 4 + (tab === 'live' ? 1 : 0) + (admin && tab === 'queued' ? 2 : 0)} style={s.groupRow}>
                  <span style={{ color: group.color }}>{group.label}</span>
                  <span style={s.groupCount}>{group.items.length}</span>
                </td></tr>
                {group.items.map(m => (
                  <React.Fragment key={m.id}>
                    <tr
                      style={{ ...s.row, background: expandedId === m.id ? '#f1f3f5' : 'transparent' }}
                      onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    >
                      {admin && <td style={s.td} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} />
                      </td>}
                      <td style={{ ...s.td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <CopyButton
                          metric={m}
                          copied={copiedId === m.id}
                          onCopy={async () => {
                            try {
                              await navigator.clipboard.writeText(formatMetricForCopy(m));
                              setCopiedId(m.id);
                              setTimeout(() => setCopiedId(null), 1500);
                            } catch (err) {
                              console.error('Copy failed:', err);
                            }
                          }}
                        />
                      </td>
                      <td style={{ ...s.td, fontWeight: 600, color: '#1a1a1a' }}>{m.name}</td>
                      <td style={{ ...s.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9ca3af' }}>{m.id}</td>
                      <td style={s.td}>
                        <span style={{ fontSize: 11, color: m.metric_type === 'derived' ? '#2563eb' : '#059669' }}>
                          {(m.metric_type || 'primitive').charAt(0).toUpperCase() + (m.metric_type || 'primitive').slice(1)}
                        </span>
                      </td>
                      {tab === 'live' && (
                        <td style={{ ...s.td, textAlign: 'center' }} title={m.verified_at ? `Approved ${new Date(m.verified_at).toLocaleDateString()}` : 'Not yet approved'}>
                          {m.verified_at
                            ? <span style={{ color: '#059669', fontSize: 14, fontWeight: 700 }}>✓</span>
                            : <span style={{ color: '#d1d5db', fontSize: 13 }}>○</span>
                          }
                        </td>
                      )}
                      <td style={s.td} onClick={admin ? (e => e.stopPropagation()) : undefined}>
                        {admin ? (
                          <input
                            type="text"
                            value={m.description || ''}
                            onChange={e => setMetrics(prev => prev.map(x => x.id === m.id ? { ...x, description: e.target.value } : x))}
                            onBlur={e => handleSaveField(m.id, 'description', e.target.value)}
                            style={s.inlineInput}
                          />
                        ) : (
                          <span style={{ fontSize: 13, color: '#374151' }}>{m.description || '—'}</span>
                        )}
                      </td>
                      {admin && tab === 'queued' && (
                        <td style={s.td} onClick={e => e.stopPropagation()}>
                          <select
                            value={m.priority || 'medium'}
                            onChange={e => handleSaveField(m.id, 'priority', e.target.value)}
                            style={s.inlineSelect}
                          >
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                        </td>
                      )}
                      {admin && tab === 'queued' && (
                        <td style={s.td} onClick={e => e.stopPropagation()}>
                          <select
                            value={m.assigned_to || ''}
                            onChange={e => handleSaveField(m.id, 'assigned_to', e.target.value || null)}
                            style={s.inlineSelect}
                          >
                            <option value="">—</option>
                            <option value="Nic">Nic</option>
                            <option value="Justin">Justin</option>
                          </select>
                        </td>
                      )}
                    </tr>
                    {expandedId === m.id && (
                      <tr><td colSpan={tab === 'queued' ? 7 : 6} style={{ padding: 0 }}>
                        <ExpandPanel metric={m} onUpdate={reload} onSaveField={handleSaveField} onDelete={handleDeleteMetric} />
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && <div style={s.empty}>No metrics match your filters.</div>}
      </div>}
    </div>
  );
}

function ExpandPanel({ metric: m, onUpdate, onSaveField, onDelete }) {
  const [notes, setNotes] = useState(m.notes || '');
  const [copied, setCopied] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const deps = (m.depends_on || []);
  const sqlText = m.view_definition || m.chart_sql || '';
  const bqUrl = m.view_name
    ? `https://console.cloud.google.com/bigquery?project=project-for-method-dw&ws=!1m5!1m4!4m3!1sproject-for-method-dw!2srevenue!3s${m.view_name}`
    : null;

  return (
    <div style={s.panel}>
      {m.description && (
        <div style={{ marginBottom: 14, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>
          {m.description}
        </div>
      )}

      {sqlText && (
        <div style={s.panelSection}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={s.panelLabel}>Definition</div>
            <CopyButton
              metric={m}
              copied={copied}
              size={20}
              withLabel
              onCopy={async () => {
                try {
                  await navigator.clipboard.writeText(formatMetricForCopy(m));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch (err) {
                  console.error('Copy failed:', err);
                }
              }}
            />
          </div>
          <pre style={s.sqlBlock}>{sqlText}</pre>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowMore(v => !v)}
        style={{
          background: 'none', border: 'none', color: '#6b7280',
          padding: '4px 0', fontSize: 12, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span>{showMore ? '▾' : '▸'}</span>
        <span>More details</span>
      </button>

      {showMore && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e2e5e9' }}>
          {m.view_name && (
            <div style={s.panelSection}>
              <div style={s.panelLabel}>BQ View</div>
              <a
                href={bqUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#059669', textDecoration: 'underline' }}
              >
                revenue.{m.view_name}
              </a>
            </div>
          )}
          <div style={{ display: 'flex', gap: 24 }}>
            <div style={{ ...s.panelSection, flex: 1 }}>
              <div style={s.panelLabel}>Depends On</div>
              <div>{deps.length > 0 ? deps.map(id => <span key={id} style={s.pill}>{id}</span>) : <span style={s.dim}>None</span>}</div>
            </div>
            <div style={{ ...s.panelSection, flex: 1 }}>
              <div style={s.panelLabel}>Supported Grains</div>
              <div>{(m.supported_grains || ['monthly']).map(g => <span key={g} style={s.pill}>{g}</span>)}</div>
            </div>
          </div>
        </div>
      )}

      <div style={s.panelSection}>
        <div style={s.panelLabel}>Notes</div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => onSaveField(m.id, 'notes', notes)}
          placeholder="Add notes..."
          style={s.textarea}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {m.status === 'live' && (
          <button
            style={s.actionBtn}
            onClick={async () => { await onSaveField(m.id, 'status', 'queued'); await onUpdate(); }}
          >
            Move to Queued
          </button>
        )}
        {m.status !== 'live' && (
          <button
            style={{ ...s.actionBtn, borderColor: '#059669', color: '#059669' }}
            onClick={async () => { await onSaveField(m.id, 'status', 'live'); await onUpdate(); }}
          >
            Move to Live
          </button>
        )}
        <button
          style={{ ...s.actionBtn, borderColor: '#dc2626', color: '#dc2626', marginLeft: 'auto' }}
          onClick={() => onDelete(m)}
        >
          Delete Metric
        </button>
      </div>
    </div>
  );
}

const s = {
  layout: { padding: 24, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: 0 },
  subtitle: { color: '#6b7280', fontSize: 13, marginTop: 4 },
  stats: { display: 'flex', gap: 16 },
  stat: { textAlign: 'center' },
  statVal: { display: 'block', fontSize: 20, fontWeight: 700, color: '#374151' },
  statLabel: { fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' },
  controls: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  tabs: { display: 'flex', gap: 0 },
  tab: { background: '#f8f9fa', border: '1px solid #e2e5e9', color: '#6b7280', padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
  tabActive: { background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', padding: '6px 16px', cursor: 'pointer', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" },
  search: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: '6px 12px', borderRadius: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif", flex: 1, maxWidth: 300 },
  deleteBtn: { background: 'none', border: '1px solid #dc2626', color: '#dc2626', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #e2e5e9', cursor: 'pointer', userSelect: 'none' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f3f5', fontSize: 13, color: '#374151' },
  row: { cursor: 'pointer', transition: 'background .1s' },
  groupRow: { padding: '12px 12px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: '1px solid #e2e5e9' },
  groupCount: { marginLeft: 8, fontSize: 11, color: '#6b7280', fontWeight: 400 },
  inlineInput: { background: 'none', border: 'none', color: '#374151', fontSize: 12, width: '100%', padding: '2px 0', fontFamily: "'DM Sans', sans-serif" },
  inlineSelect: { background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', fontSize: 11, padding: '2px 6px', borderRadius: 3 },
  empty: { color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" },
  panel: { padding: '16px 24px', background: '#f8f9fa', borderBottom: '2px solid #e2e5e9' },
  panelSection: { marginBottom: 16 },
  panelLabel: { fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 },
  sqlBlock: { background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 4, padding: 12, fontSize: 11, color: '#374151', fontFamily: "'JetBrains Mono', monospace", overflow: 'auto', maxHeight: 200, whiteSpace: 'pre-wrap', margin: 0 },
  pill: { display: 'inline-block', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginRight: 6 },
  dim: { color: '#6b7280', fontSize: 12 },
  textarea: { width: '100%', background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151', padding: 10, borderRadius: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif", resize: 'vertical', minHeight: 60 },
  actionBtn: { background: 'none', border: '1px solid #9ca3af', color: '#6b7280', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },
};
