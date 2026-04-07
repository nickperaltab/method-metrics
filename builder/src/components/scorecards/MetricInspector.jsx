import React, { useState, useEffect, useRef, useCallback } from 'react';
import { formatValue } from './utils';
import { evaluateFormula } from '../../lib/sanitize';

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

export default function MetricInspector({ metricId, currentValue, valueFormat, metricsCache, customInfo, onClose }) {
  const [trail, setTrail] = useState([]);
  const panelRef = useRef(null);
  const [visible, setVisible] = useState(false);

  const activeId = trail.length > 0 ? trail[trail.length - 1] : metricId;
  const isCustomSql = typeof activeId === 'string' && activeId?.startsWith?.('custom:');
  const metric = isCustomSql ? null : metricsCache?.get(activeId);

  // Build trail on open
  useEffect(() => {
    if (metricId != null) {
      setTrail([metricId]);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [metricId]);

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

  if (metricId == null) return null;

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
          {isCustomSql && customInfo ? (
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
              {(metric.view_name || metric.source_url) && (
                <div style={ps.section}>
                  <div style={ps.sectionLabel}>Data Source</div>
                  {metric.view_name && (
                    <div style={ps.sourceRow}>
                      <span style={ps.sourceIcon}>⛁</span>
                      <span style={ps.sourceName}>{metric.view_name}</span>
                    </div>
                  )}
                  {metric.source_url && (
                    <a
                      href={metric.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: metric.view_name ? 8 : 0, fontSize: 13, color: '#2563eb', textDecoration: 'none' }}
                      onMouseEnter={e => { e.target.style.textDecoration = 'underline'; }}
                      onMouseLeave={e => { e.target.style.textDecoration = 'none'; }}
                    >
                      {metric.source_url.includes('google.com/spreadsheets') ? '📊 Open source spreadsheet' : '🔍 Open in BigQuery'}
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

function TechnicalDetails({ metric, metricsMap, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [sqlExpanded, setSqlExpanded] = useState(false);

  const sql = metric.chart_sql || metric.view_definition;
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

          {/* View name */}
          {metric.view_name && (
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

          {/* SQL */}
          {sql && (
            <div style={ps.techRow}>
              <span style={ps.techLabel}>SQL</span>
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
