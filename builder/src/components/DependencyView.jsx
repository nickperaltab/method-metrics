import React, { useState, useMemo } from 'react';
import { SCORECARDS } from '../config/scorecards';

/**
 * Build a map of metricId → [{ scorecard, section, context }]
 * by walking every scorecard config.
 */
function buildUsageMap() {
  const usage = {};
  const add = (id, scorecard, section, context) => {
    if (id == null || typeof id === 'string') return; // skip custom SQL ids like '__wk_...'
    if (!usage[id]) usage[id] = [];
    usage[id].push({ scorecard, section, context });
  };

  for (const sc of Object.values(SCORECARDS)) {
    for (const sec of sc.sections) {
      // KPIs
      for (const kpi of (sec.kpis || [])) {
        add(kpi.metricId, sc.title, sec.title, 'KPI');
        for (const dep of (kpi.depsOverride || [])) {
          add(dep, sc.title, sec.title, 'KPI dep');
        }
      }
      // Charts
      for (const chart of (sec.charts || [])) {
        for (const m of (chart.metrics || [])) {
          add(m.id, sc.title, sec.title, `Chart: ${chart.label}`);
        }
      }
      // Tables
      for (const table of (sec.tables || [])) {
        for (const col of (table.columns || [])) {
          if (col.metricId) add(col.metricId, sc.title, sec.title, `Table: ${table.label}`);
          if (col.derived) {
            add(col.derived.a, sc.title, sec.title, `Table: ${table.label}`);
            add(col.derived.b, sc.title, sec.title, `Table: ${table.label}`);
          }
        }
      }
    }
  }
  return usage;
}

/** Detect if a metric is likely misclassified as primitive */
function getMisclassFlags(m) {
  const flags = [];
  const type = m.metric_type || 'primitive';
  if (type !== 'primitive') return flags;

  if (m.depends_on && m.depends_on.length > 0) {
    flags.push('has depends_on');
  }
  if (m.formula) {
    flags.push('has formula');
  }
  if (m.chart_sql) {
    const sql = m.chart_sql.toLowerCase();
    if (sql.includes('join') || sql.includes('with ') || sql.includes('safe_divide')) {
      flags.push('complex chart_sql');
    }
  }
  return flags;
}

/** Build a readable formula string from depends_on + known metric names */
function getFormulaDisplay(m, metricsById) {
  // If the metric has an explicit formula field, show it
  if (m.formula) return m.formula;

  // If it has chart_sql, summarize the pattern
  if (m.chart_sql) {
    const sql = m.chart_sql;
    if (/safe_divide/i.test(sql)) return 'Ratio (see chart_sql)';
    if (/sum\s*\(/i.test(sql) && /group by/i.test(sql)) return 'Aggregation (see chart_sql)';
    return 'Custom SQL';
  }

  // If derived with depends_on, show dependency names
  if (m.depends_on && m.depends_on.length > 0) {
    const depNames = m.depends_on.map(id => {
      const dep = metricsById[id];
      return dep ? dep.name : `#${id}`;
    });
    return `f(${depNames.join(', ')})`;
  }

  // Primitive with a view_name
  if (m.view_name) return `← ${m.view_name}`;

  return '—';
}

function UsageBadges({ usages }) {
  if (!usages || usages.length === 0) return <span style={ds.dim}>—</span>;

  // Deduplicate by scorecard+section+context
  const seen = new Set();
  const unique = usages.filter(u => {
    const key = `${u.scorecard}|${u.section}|${u.context}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {unique.map((u, i) => (
        <span key={i} style={{
          ...ds.badge,
          background: u.scorecard.includes('Marketing') ? '#ede9fe' : '#ecfdf5',
          borderColor: u.scorecard.includes('Marketing') ? '#c4b5fd' : '#a7f3d0',
          color: u.scorecard.includes('Marketing') ? '#6d28d9' : '#059669',
        }}>
          {u.section} · {u.context}
        </span>
      ))}
    </div>
  );
}

export default function DependencyView({ metrics }) {
  const [expandedPrims, setExpandedPrims] = useState(new Set());
  const [search, setSearch] = useState('');
  const [showOrphans, setShowOrphans] = useState(false);

  const { metricsById, usageMap, trees, orphanDerived, misclassified } = useMemo(() => {
    const byId = {};
    for (const m of metrics) byId[m.id] = m;

    const usage = buildUsageMap();

    // Build parent→children map from depends_on
    // A derived metric's "parent" is its first dependency (the primitive it derives from)
    const childrenOf = {}; // primId → [derivedMetric]
    const assignedDerived = new Set();

    // First pass: assign derived metrics to their primary dependency
    const derivedMetrics = metrics.filter(m => m.metric_type === 'derived');
    const primitiveMetrics = metrics.filter(m => (m.metric_type || 'primitive') !== 'derived' && m.status === 'live');

    for (const m of derivedMetrics) {
      if (!m.depends_on || m.depends_on.length === 0) continue;
      // Assign to the first dependency that is a primitive
      const primDep = m.depends_on.find(id => {
        const dep = byId[id];
        return dep && (dep.metric_type || 'primitive') !== 'derived';
      });
      const parentId = primDep || m.depends_on[0];
      if (!childrenOf[parentId]) childrenOf[parentId] = [];
      childrenOf[parentId].push(m);
      assignedDerived.add(m.id);
    }

    // Orphan derived = derived metrics with no depends_on or whose deps are missing
    const orphans = derivedMetrics.filter(m => !assignedDerived.has(m.id) && m.status === 'live');

    // Build tree structures
    const treeList = primitiveMetrics
      .map(p => ({
        metric: p,
        children: (childrenOf[p.id] || []).filter(c => c.status === 'live'),
        usages: usage[p.id] || [],
        flags: getMisclassFlags(p),
      }))
      .filter(t => t.children.length > 0 || (usage[t.metric.id] || []).length > 0 || t.flags.length > 0)
      .sort((a, b) => b.children.length - a.children.length);

    // Misclassified primitives
    const misclass = metrics.filter(m => getMisclassFlags(m).length > 0);

    return { metricsById: byId, usageMap: usage, trees: treeList, orphanDerived: orphans, misclassified: misclass };
  }, [metrics]);

  const filteredTrees = search
    ? trees.filter(t => {
        const q = search.toLowerCase();
        if (t.metric.name?.toLowerCase().includes(q)) return true;
        if (String(t.metric.id).includes(q)) return true;
        return t.children.some(c => c.name?.toLowerCase().includes(q) || String(c.id).includes(q));
      })
    : trees;

  function togglePrim(id) {
    setExpandedPrims(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpandedPrims(new Set(filteredTrees.map(t => t.metric.id)));
  }

  return (
    <div>
      {/* Summary stats */}
      <div style={ds.summaryRow}>
        <div style={ds.summaryCard}>
          <div style={ds.summaryVal}>{trees.length}</div>
          <div style={ds.summaryLabel}>Primitives with dependents</div>
        </div>
        <div style={ds.summaryCard}>
          <div style={{ ...ds.summaryVal, color: '#2563eb' }}>{metrics.filter(m => m.metric_type === 'derived' && m.status === 'live').length}</div>
          <div style={ds.summaryLabel}>Live derived metrics</div>
        </div>
        <div style={ds.summaryCard}>
          <div style={{ ...ds.summaryVal, color: '#dc2626' }}>{misclassified.length}</div>
          <div style={ds.summaryLabel}>Misclassified</div>
        </div>
        <div style={ds.summaryCard}>
          <div style={{ ...ds.summaryVal, color: '#d97706' }}>{orphanDerived.length}</div>
          <div style={ds.summaryLabel}>Orphan derived</div>
        </div>
      </div>

      {/* Misclassification warnings */}
      {misclassified.length > 0 && (
        <div style={ds.warningBox}>
          <div style={ds.warningTitle}>Misclassified Metrics</div>
          <div style={ds.warningDesc}>These metrics are typed as <strong>primitive</strong> but show signs of being derived:</div>
          <div style={{ marginTop: 8 }}>
            {misclassified.map(m => (
              <div key={m.id} style={ds.warningItem}>
                <span style={ds.warningId}>#{m.id}</span>
                <span style={{ fontWeight: 600 }}>{m.name}</span>
                <span style={ds.warningFlags}>{getMisclassFlags(m).join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <input
          type="text" placeholder="Search metrics..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={ds.search}
        />
        <button onClick={expandAll} style={ds.smallBtn}>Expand All</button>
        <button onClick={() => setExpandedPrims(new Set())} style={ds.smallBtn}>Collapse All</button>
        <label style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={showOrphans} onChange={e => setShowOrphans(e.target.checked)} />
          Show orphans
        </label>
      </div>

      {/* Tree table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={ds.table}>
          <thead>
            <tr>
              <th style={ds.th}>Metric</th>
              <th style={{ ...ds.th, width: 260 }}>Formula / Source</th>
              <th style={{ ...ds.th, width: 200 }}>Description</th>
              <th style={{ ...ds.th, width: 260 }}>Used In</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrees.map(tree => {
              const p = tree.metric;
              const isExpanded = expandedPrims.has(p.id);
              const hasChildren = tree.children.length > 0;
              return (
                <React.Fragment key={p.id}>
                  {/* Primitive row */}
                  <tr
                    style={{ ...ds.primRow, cursor: hasChildren ? 'pointer' : 'default' }}
                    onClick={() => hasChildren && togglePrim(p.id)}
                  >
                    <td style={ds.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {hasChildren && (
                          <span style={ds.arrow}>{isExpanded ? '▼' : '▶'}</span>
                        )}
                        {!hasChildren && <span style={{ width: 14, display: 'inline-block' }} />}
                        <span style={ds.primBadge}>P</span>
                        <span style={{ fontWeight: 600, color: '#1a1a1a' }}>{p.name}</span>
                        <span style={ds.idLabel}>#{p.id}</span>
                        {tree.flags.length > 0 && <span style={ds.flagBadge}>MISCLASSIFIED</span>}
                        {hasChildren && <span style={ds.childCount}>{tree.children.length} derived</span>}
                      </div>
                    </td>
                    <td style={{ ...ds.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280' }}>
                      {getFormulaDisplay(p, metricsById)}
                    </td>
                    <td style={{ ...ds.td, fontSize: 12, color: '#6b7280' }}>
                      {p.description || <span style={ds.dim}>—</span>}
                    </td>
                    <td style={ds.td}>
                      <UsageBadges usages={usageMap[p.id]} />
                    </td>
                  </tr>
                  {/* Derived children */}
                  {isExpanded && tree.children.map(child => (
                    <tr key={child.id} style={ds.childRow}>
                      <td style={ds.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 36 }}>
                          <span style={ds.connector}>└</span>
                          <span style={ds.derivedBadge}>D</span>
                          <span style={{ fontWeight: 500, color: '#374151' }}>{child.name}</span>
                          <span style={ds.idLabel}>#{child.id}</span>
                          {(child.depends_on || []).length > 1 && (
                            <span style={ds.multiDep}>
                              deps: {child.depends_on.map(id => `#${id}`).join(', ')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ ...ds.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#2563eb' }}>
                        {getFormulaDisplay(child, metricsById)}
                      </td>
                      <td style={{ ...ds.td, fontSize: 12, color: '#6b7280' }}>
                        {child.description || <span style={ds.dim}>—</span>}
                      </td>
                      <td style={ds.td}>
                        <UsageBadges usages={usageMap[child.id]} />
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}

            {/* Orphan derived metrics */}
            {showOrphans && orphanDerived.length > 0 && (
              <>
                <tr><td colSpan={4} style={ds.groupHeader}>
                  <span style={{ color: '#d97706' }}>Orphan Derived</span>
                  <span style={{ marginLeft: 8, fontWeight: 400, color: '#6b7280' }}>{orphanDerived.length} — no depends_on link</span>
                </td></tr>
                {orphanDerived.map(m => (
                  <tr key={m.id} style={ds.childRow}>
                    <td style={ds.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
                        <span style={{ ...ds.derivedBadge, background: '#fef3c7', borderColor: '#fbbf24', color: '#d97706' }}>D</span>
                        <span style={{ fontWeight: 500, color: '#374151' }}>{m.name}</span>
                        <span style={ds.idLabel}>#{m.id}</span>
                      </div>
                    </td>
                    <td style={{ ...ds.td, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280' }}>
                      {getFormulaDisplay(m, metricsById)}
                    </td>
                    <td style={{ ...ds.td, fontSize: 12, color: '#6b7280' }}>
                      {m.description || <span style={ds.dim}>—</span>}
                    </td>
                    <td style={ds.td}>
                      <UsageBadges usages={usageMap[m.id]} />
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
        {filteredTrees.length === 0 && !showOrphans && (
          <div style={{ color: '#6b7280', fontSize: 13, padding: 40, textAlign: 'center' }}>
            No metrics match your search.
          </div>
        )}
      </div>
    </div>
  );
}

const ds = {
  summaryRow: { display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  summaryCard: { background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 6, padding: '12px 20px', textAlign: 'center', minWidth: 120 },
  summaryVal: { fontSize: 22, fontWeight: 700, color: '#059669' },
  summaryLabel: { fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 },

  warningBox: { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 16, marginBottom: 20 },
  warningTitle: { fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 4 },
  warningDesc: { fontSize: 12, color: '#7f1d1d' },
  warningItem: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '4px 0', color: '#374151' },
  warningId: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280', minWidth: 40 },
  warningFlags: { fontSize: 11, color: '#dc2626', fontStyle: 'italic' },

  search: { background: '#fff', border: '1px solid #e2e5e9', color: '#374151', padding: '6px 12px', borderRadius: 4, fontSize: 12, fontFamily: "'DM Sans', sans-serif", flex: 1, maxWidth: 300 },
  smallBtn: { background: 'none', border: '1px solid #e2e5e9', color: '#6b7280', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '2px solid #e2e5e9' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f3f5', fontSize: 13, color: '#374151', verticalAlign: 'top' },

  primRow: { background: '#fafbfc' },
  childRow: { background: '#fff' },
  groupHeader: { padding: '14px 12px 6px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: '1px solid #e2e5e9' },

  arrow: { fontSize: 10, color: '#6b7280', width: 14, display: 'inline-block', textAlign: 'center', flexShrink: 0 },
  connector: { fontSize: 12, color: '#d1d5db', fontFamily: 'monospace', flexShrink: 0 },

  primBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669', fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 },
  derivedBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 },

  idLabel: { fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9ca3af' },
  flagBadge: { background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, letterSpacing: '.04em' },
  childCount: { fontSize: 11, color: '#6b7280', fontStyle: 'italic' },
  multiDep: { fontSize: 10, color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace" },

  badge: { display: 'inline-block', padding: '2px 6px', borderRadius: 3, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", border: '1px solid', whiteSpace: 'nowrap' },
  dim: { color: '#d1d5db', fontSize: 12 },
};
