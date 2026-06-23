import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatValue } from './utils';
import { evaluateFormula } from '../../lib/sanitize';
import { buildSemanticSql } from '../../lib/bigquery';
import { useViewDefinition } from '../../lib/useViewDefinition';
import { useDbtModel } from '../../lib/useDbtModel.js';
import { dbtModelLink } from '../../lib/dbtModels.js';

/**
 * Build a human-readable formula replacing {id} with metric names,
 * returning an array of segments: { type: 'metric'|'text', text, metricId? }
 */
function parseFormula(formula, metricsMap) {
  if (!formula) return null;
  const segments = [];
  let last = 0;
  const re = /\{(\d+)\}/g;
  let match;
  while ((match = re.exec(formula)) !== null) {
    if (match.index > last) {
      let text = formula.slice(last, match.index);
      text = text.replace(/SAFE_DIVIDE\(\s*/, '').replace(/\)\s*$/, '');
      if (text) segments.push({ type: 'text', text });
    }
    const id = Number(match[1]);
    const m = metricsMap.get(id);
    segments.push({ type: 'metric', text: m ? m.name : `#${id}`, metricId: id });
    last = match.index + match[0].length;
  }
  if (last < formula.length) {
    let text = formula.slice(last);
    text = text.replace(/SAFE_DIVIDE\(\s*/, '').replace(/\)\s*$/, '');
    if (text) segments.push({ type: 'text', text });
  }

  // Clean up SAFE_DIVIDE wrapper: replace leading/trailing parens
  // Convert "SAFE_DIVIDE( A , B ) * 100" → "A / B * 100"
  if (formula.includes('SAFE_DIVIDE')) {
    const cleaned = [];
    let i = 0;
    while (i < segments.length) {
      const seg = segments[i];
      if (seg.type === 'text') {
        let t = seg.text
          .replace(/^SAFE_DIVIDE\(\s*/, '')
          .replace(/^\s*,\s*$/, ' / ')
          .replace(/\)\s*/, ' ');
        if (t.trim()) cleaned.push({ ...seg, text: t });
      } else {
        cleaned.push(seg);
      }
      i++;
    }
    return cleaned;
  }

  return segments;
}

function FormulaDisplay({ formula, metricsMap, onNavigate }) {
  const segments = parseFormula(formula, metricsMap);
  if (!segments) return null;

  return (
    <div style={ps.formulaBox}>
      {segments.map((seg, i) => {
        if (seg.type === 'metric') {
          return (
            <span
              key={i}
              onClick={() => onNavigate(seg.metricId)}
              style={ps.metricChip}
              onMouseEnter={e => { e.target.style.background = '#dbeafe'; }}
              onMouseLeave={e => { e.target.style.background = '#eff6ff'; }}
            >
              {seg.text}
            </span>
          );
        }
        return <span key={i} style={ps.formulaText}>{seg.text}</span>;
      })}
    </div>
  );
}

export default function MetricInspector({ metricId, dbtModel, currentValue, valueFormat, metricsCache, customInfo, deltaInfo, onClose }) {
  const [trail, setTrail] = useState([]);
  const panelRef = useRef(null);
  const [visible, setVisible] = useState(false);

  const activeId = trail.length > 0 ? trail[trail.length - 1] : metricId;
  const isCustomSql = typeof activeId === 'string' && activeId?.startsWith?.('custom:');
  const metric = isCustomSql ? null : metricsCache?.get(activeId);

  // Build trail on open
  useEffect(() => {
    if (metricId != null || dbtModel != null) {
      setTrail(metricId != null ? [metricId] : []);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [metricId, dbtModel]);

  // Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(() => onClose(), 200);
  }, [onClose]);

  const navigateTo = useCallback((id) => {
    setTrail(prev => [...prev, id]);
  }, []);

  const navigateBack = useCallback((index) => {
    setTrail(prev => prev.slice(0, index + 1));
  }, []);

  if (metricId == null && dbtModel == null) return null;

  const metricsMap = metricsCache || new Map();

  // Resolve dependencies for display
  const deps = (metric?.depends_on || []).map(id => metricsMap.get(id)).filter(Boolean);

  // Get the display value — only show for root metric
  const isRoot = trail.length <= 1;
  const displayValue = isRoot && currentValue != null
    ? (typeof currentValue === 'number' ? formatValue(currentValue, valueFormat || 'number') : currentValue)
    : null;

  return (
    <>
      {/* Scrim */}
      <div
        onClick={handleClose}
        style={{
          ...ps.scrim,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
        }}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          ...ps.panel,
          transform: visible ? 'translateX(0)' : 'translateX(420px)',
        }}
      >
        {/* Header */}
        <div style={ps.header}>
          <div style={ps.breadcrumbs}>
            {trail.map((id, i) => {
              const m = metricsMap.get(id);
              const name = m?.name || `#${id}`;
              const isLast = i === trail.length - 1;
              return (
                <React.Fragment key={i}>
                  {i > 0 && <span style={ps.breadSep}>›</span>}
                  {isLast
                    ? <span style={ps.breadCurrent}>{name}</span>
                    : <span style={ps.breadLink} onClick={() => navigateBack(i)}>{name}</span>
                  }
                </React.Fragment>
              );
            })}
          </div>
          <button onClick={handleClose} style={ps.closeBtn} aria-label="Close metric inspector">×</button>
        </div>

        {/* Body */}
        <div style={ps.body}>
          {dbtModel != null && metricId == null ? (
            <DbtPanel modelName={dbtModel} />
          ) : isCustomSql && customInfo ? (
            <>
              <div style={ps.section}>
                <div style={ps.metricName}>{customInfo.label}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <span style={{ ...ps.badge, background: '#fefce8', color: '#a16207', borderColor: '#fde68a' }}>
                    custom sql
                  </span>
                </div>
              </div>
              <div style={ps.section}>
                <div style={ps.sectionLabel}>Description</div>
                <div style={ps.dim}>This chart uses a custom query not registered as a metric.</div>
              </div>
              <div style={ps.section}>
                <div style={ps.sectionLabel}>SQL Query</div>
                <pre style={ps.sqlBlock}>{customInfo.sql}</pre>
              </div>
            </>
          ) : metric ? (
            <>
              {/* Section 1: Identity */}
              <div style={ps.section}>
                <div style={ps.metricName}>{metric.name}</div>
                {displayValue && <div style={ps.metricValue}>{displayValue}</div>}
                {isRoot && deltaInfo && (() => {
                  const delta = deltaInfo.current - deltaInfo.prior;
                  const pct = deltaInfo.prior !== 0 ? (delta / Math.abs(deltaInfo.prior)) * 100 : null;
                  const color = delta > 0 ? '#059669' : delta < 0 ? '#dc2626' : '#6b7280';
                  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '';
                  return (
                    <div style={{ marginTop: 8, display: 'flex', gap: 16, alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>THIS MONTH</div>
                        <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: '#1a1a1a' }}>
                          {formatValue(deltaInfo.current, deltaInfo.format)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: "'DM Sans', sans-serif", marginBottom: 2 }}>LAST MONTH</div>
                        <div style={{ fontSize: 16, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: '#6b7280' }}>
                          {formatValue(deltaInfo.prior, deltaInfo.format)}
                        </div>
                      </div>
                      {pct != null && (
                        <div style={{ fontSize: 13, fontWeight: 600, color, fontFamily: "'DM Sans', sans-serif", paddingBottom: 2 }}>
                          {arrow} {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {metric.status && (
                    <span style={{
                      ...ps.badge,
                      ...(metric.status === 'live'
                        ? { background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' }
                        : { background: '#fefce8', color: '#a16207', borderColor: '#fde68a' }),
                    }}>
                      {metric.status}
                    </span>
                  )}
                  <span style={{
                    ...ps.badge,
                    ...(metric.metric_type === 'derived'
                      ? { background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' }
                      : { background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' }),
                  }}>
                    {metric.metric_type || 'primitive'}
                  </span>
                </div>
              </div>

              {/* Section 2: Description */}
              <div style={ps.section}>
                <div style={ps.sectionLabel}>Description</div>
                <div style={ps.description}>
                  {metric.description || <span style={ps.dim}>No description yet.</span>}
                </div>
              </div>

              {/* Section 3: Formula */}
              <div style={ps.section}>
                <div style={ps.sectionLabel}>Formula</div>
                {metric.formula_display ? (
                  <div style={ps.formulaBox}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#374151' }}>
                      {metric.formula_display}
                    </span>
                  </div>
                ) : metric.formula ? (
                  <FormulaDisplay formula={metric.formula} metricsMap={metricsMap} onNavigate={navigateTo} />
                ) : (
                  <div style={ps.dim}>This is a primitive metric — queried directly from BigQuery.</div>
                )}
                {deps.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>Built from: </span>
                    {deps.map((dep, i) => (
                      <React.Fragment key={dep.id}>
                        {i > 0 && <span style={ps.formulaText}>, </span>}
                        <span
                          style={ps.metricChip}
                          onClick={() => navigateTo(dep.id)}
                          onMouseEnter={e => { e.target.style.background = '#dbeafe'; }}
                          onMouseLeave={e => { e.target.style.background = '#eff6ff'; }}
                        >
                          {dep.name}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 4: Data Source */}
              {(metric.view_name || metric.semantic_table || metric.source_url) && (
                <div style={ps.section}>
                  <div style={ps.sectionLabel}>Data Source</div>
                  {(metric.view_name || metric.semantic_table) && (() => {
                    const tableName = metric.semantic_table || metric.view_name;
                    const bqUrl = `https://console.cloud.google.com/bigquery?project=project-for-method-dw&ws=!1m5!1m4!4m3!1sproject-for-method-dw!2srevenue!3s${tableName}`;
                    return (
                      <>
                        <div style={ps.sourceRow}>
                          <span style={ps.sourceIcon}>⛁</span>
                          <span style={ps.sourceName}>revenue.{tableName}</span>
                        </div>
                        <a
                          href={bqUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13, color: '#2563eb', textDecoration: 'none' }}
                          onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                          onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                        >
                          🔍 Open in BigQuery
                        </a>
                      </>
                    );
                  })()}
                  {metric.source_url?.includes('google.com/spreadsheets') && (
                    <a
                      href={metric.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13, color: '#2563eb', textDecoration: 'none' }}
                      onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
                      onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
                    >
                      📊 Open source spreadsheet
                    </a>
                  )}
                </div>
              )}

              {/* Section 5: Technical Details */}
              <TechnicalDetails metric={metric} metricsMap={metricsMap} onNavigate={navigateTo} />
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>
              Metric #{activeId} not found.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const GRAIN_LABELS = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'];

function TechnicalDetails({ metric, metricsMap, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [sqlExpanded, setSqlExpanded] = useState(false);

  const hasSemantic = metric.semantic_table && metric.semantic_measure && metric.semantic_date_col;
  // For semantic metrics, generate a representative monthly SQL for verification
  let generatedSql = null;
  if (hasSemantic) {
    try { generatedSql = buildSemanticSql(metric, 'month', 12, null); } catch { /* ignore */ }
  }
  const inlineSql = generatedSql || metric.chart_sql;
  const liveDdl = useViewDefinition(inlineSql ? null : metric.view_name);
  const sql = inlineSql || liveDdl.sql;
  const sqlPreview = sql && sql.length > 200 ? sql.slice(0, 200) + '...' : sql;

  return (
    <div style={ps.section}>
      <div
        style={ps.accordionTrigger}
        onClick={() => setOpen(!open)}
      >
        <span style={ps.sectionLabel}>Technical Details</span>
        <span style={{ ...ps.chevron, transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </div>

      {open && (
        <div style={ps.accordionBody}>
          {/* Metric ID */}
          <div style={ps.techRow}>
            <span style={ps.techLabel}>ID</span>
            <span style={ps.techValue}>#{metric.id}</span>
          </div>

          {/* Semantic fields */}
          {hasSemantic && (
            <>
              <div style={ps.techRow}>
                <span style={ps.techLabel}>Source</span>
                <span style={ps.techValue}>revenue.{metric.semantic_table}</span>
              </div>
              <div style={ps.techRow}>
                <span style={ps.techLabel}>Measure</span>
                <span style={ps.techValue}>{metric.semantic_measure}</span>
              </div>
              <div style={ps.techRow}>
                <span style={ps.techLabel}>Date col</span>
                <span style={ps.techValue}>{metric.semantic_date_col}</span>
              </div>
              {metric.semantic_filters?.length > 0 && (
                <div style={ps.techRow}>
                  <span style={ps.techLabel}>Filters</span>
                  <span style={ps.techValue}>{metric.semantic_filters.join(' AND ')}</span>
                </div>
              )}
              <div style={ps.techRow}>
                <span style={ps.techLabel}>Grains</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {GRAIN_LABELS.map(g => (
                    <span key={g} style={{ ...ps.metricChip, cursor: 'default' }}>{g}</span>
                  ))}
                </div>
              </div>
              {metric.semantic_dimensions?.length > 0 && (
                <div style={ps.techRow}>
                  <span style={ps.techLabel}>Dimensions</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {metric.semantic_dimensions.map(d => (
                      <span key={d} style={{ ...ps.metricChip, cursor: 'default' }}>{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* View name — for non-semantic primitives */}
          {!hasSemantic && metric.view_name && (
            <div style={ps.techRow}>
              <span style={ps.techLabel}>View</span>
              <span style={ps.techValue}>revenue.{metric.view_name}</span>
            </div>
          )}

          {/* depends_on */}
          {metric.depends_on && metric.depends_on.length > 0 && (
            <div style={ps.techRow}>
              <span style={ps.techLabel}>Depends On</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {metric.depends_on.map(id => {
                  const dep = metricsMap.get(id);
                  return (
                    <span
                      key={id}
                      style={ps.metricChip}
                      onClick={() => onNavigate(id)}
                      onMouseEnter={e => { e.target.style.background = '#dbeafe'; }}
                      onMouseLeave={e => { e.target.style.background = '#eff6ff'; }}
                    >
                      {dep ? dep.name : `#${id}`}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* SQL — generated for semantic metrics, raw for complex metrics */}
          {sql && (
            <div style={ps.techRow}>
              <span style={ps.techLabel}>{generatedSql ? 'Generated SQL (monthly · 12mo)' : 'SQL'}</span>
              <pre style={ps.sqlBlock}>
                {sqlExpanded ? sql : sqlPreview}
              </pre>
              {sql.length > 200 && (
                <button
                  onClick={() => setSqlExpanded(!sqlExpanded)}
                  style={ps.showSqlBtn}
                >
                  {sqlExpanded ? 'Show less' : 'Show full SQL'}
                </button>
              )}
            </div>
          )}

          {/* Notes */}
          {metric.notes && (
            <div style={ps.techRow}>
              <span style={ps.techLabel}>Notes</span>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{metric.notes}</div>
            </div>
          )}

          {/* Verified at */}
          {metric.verified_at && (
            <div style={ps.techRow}>
              <span style={ps.techLabel}>Verified</span>
              <span style={ps.techValue}>{new Date(metric.verified_at).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DbtPanel({ modelName }) {
  const { model, loading, error } = useDbtModel(modelName);
  if (loading) return <div style={{ padding: 16, color: '#6b7280' }}>Loading dbt model…</div>;
  if (error || !model) return <div style={{ padding: 16, color: '#6b7280' }}>No dbt model found for <code>{modelName}</code>.</div>;
  const gh = dbtModelLink(model.original_file_path);
  const sql = model.compiled_sql && model.compiled_sql !== '--placeholder--' ? model.compiled_sql : null;
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>{model.name}</div>
      <div style={{ fontSize: 13, color: '#374151', margin: '6px 0 14px' }}>{model.description || 'No description.'}</div>

      {(model.refs?.length > 0 || model.sources?.length > 0) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>Built from</div>
          {model.refs?.map(r => <span key={r} style={{ fontFamily: 'monospace', fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, marginRight: 6 }}>{r}</span>)}
          {model.sources?.map(s => <span key={s} style={{ fontFamily: 'monospace', fontSize: 12, background: '#eef2ff', padding: '2px 6px', borderRadius: 4, marginRight: 6 }}>{s} (source)</span>)}
        </div>
      )}

      {model.tests?.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>Tests</div>
          <div style={{ fontSize: 12, color: '#374151' }}>{model.tests.join(', ')}</div>
        </div>
      )}

      {sql && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>Model SQL (dbt source)</div>
          <pre style={{ fontSize: 11, background: '#0d1117', color: '#c9d1d9', padding: 12, borderRadius: 6, overflow: 'auto', maxHeight: 320 }}>{sql}</pre>
        </div>
      )}

      {gh && <a href={gh} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: '#2563eb' }}>View source on GitHub →</a>}
    </div>
  );
}

const ps = {
  scrim: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)',
    zIndex: 999, transition: 'opacity 200ms ease-out',
  },
  panel: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
    background: '#ffffff', boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
    zIndex: 1000, transition: 'transform 250ms cubic-bezier(0.16,1,0.3,1)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 24px', height: 56, borderBottom: '1px solid #e2e5e9',
    flexShrink: 0,
  },
  breadcrumbs: {
    display: 'flex', alignItems: 'center', gap: 0,
    overflow: 'hidden', flex: 1, minWidth: 0,
  },
  breadLink: {
    fontSize: 15, fontWeight: 500, color: '#2563eb', cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
  },
  breadCurrent: {
    fontSize: 15, fontWeight: 600, color: '#1a1a1a',
    fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis',
  },
  breadSep: {
    margin: '0 6px', color: '#9ca3af', fontSize: 14,
  },
  closeBtn: {
    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', fontSize: 20, color: '#6b7280',
    cursor: 'pointer', borderRadius: 6, flexShrink: 0,
  },
  body: {
    flex: 1, overflowY: 'auto', padding: 24,
  },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: 6,
    fontFamily: "'DM Sans', sans-serif",
  },
  metricName: {
    fontSize: 20, fontWeight: 700, color: '#1a1a1a', marginBottom: 4,
    fontFamily: "'DM Sans', sans-serif",
  },
  metricValue: {
    fontSize: 28, fontWeight: 700, color: '#1a1a1a',
    fontFamily: "'JetBrains Mono', monospace",
  },
  badge: {
    display: 'inline-block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 10,
    border: '1px solid',
  },
  description: {
    fontSize: 14, color: '#374151', lineHeight: 1.5,
    fontFamily: "'DM Sans', sans-serif",
  },
  dim: { color: '#9ca3af', fontSize: 13, fontStyle: 'italic' },
  formulaBox: {
    background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 6,
    padding: '12px 16px', lineHeight: 1.8,
    fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
  },
  formulaText: { color: '#6b7280' },
  metricChip: {
    display: 'inline-block', background: '#eff6ff', color: '#2563eb',
    borderRadius: 4, padding: '1px 6px', cursor: 'pointer', fontWeight: 500,
    fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
    transition: 'background 100ms',
  },
  sourceRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#374151',
  },
  sourceIcon: { color: '#9ca3af', fontSize: 16 },
  sourceName: { color: '#374151' },
  accordionTrigger: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 0', borderTop: '1px solid #e2e5e9', cursor: 'pointer',
  },
  chevron: {
    color: '#9ca3af', fontSize: 16, transition: 'transform 150ms ease-out',
    fontFamily: 'monospace',
  },
  accordionBody: { paddingTop: 12 },
  techRow: { marginBottom: 12 },
  techLabel: {
    display: 'block', fontSize: 11, color: '#9ca3af', marginBottom: 2,
    fontFamily: "'DM Sans', sans-serif",
  },
  techValue: {
    fontSize: 13, color: '#374151',
    fontFamily: "'JetBrains Mono', monospace",
  },
  sqlBlock: {
    background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 6,
    padding: 12, fontSize: 11, color: '#374151',
    fontFamily: "'JetBrains Mono', monospace",
    overflow: 'auto', maxHeight: 300, whiteSpace: 'pre-wrap', margin: '4px 0 0',
  },
  showSqlBtn: {
    background: 'none', border: 'none', color: '#2563eb', fontSize: 12,
    cursor: 'pointer', padding: '4px 0', fontFamily: "'DM Sans', sans-serif",
  },
};
