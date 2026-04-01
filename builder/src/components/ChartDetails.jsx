import React, { useState } from 'react';

const styles = {
  toggle: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    padding: '6px 0',
    textAlign: 'left',
  },
  panel: {
    background: '#f8f9fa',
    border: '1px solid #e2e5e9',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  metricHeader: {
    color: '#1a1a1a',
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 600,
    margin: 0,
  },
  metricNameLink: {
    cursor: 'pointer',
    position: 'relative',
    display: 'inline-block',
    borderBottom: '1px dashed #6b7280',
  },
  metricId: {
    color: '#6b7280',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 400,
  },
  dependsOn: {
    color: '#6b7280',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    margin: '4px 0 0 0',
  },
  label: {
    color: '#6b7280',
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '8px 0 4px 0',
  },
  codeBlock: {
    background: '#ffffff',
    color: '#374151',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    padding: 12,
    borderRadius: 6,
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: 200,
    margin: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
  },
  th: {
    background: '#f8f9fa',
    color: '#6b7280',
    padding: '6px 10px',
    textAlign: 'left',
    borderBottom: '1px solid #e2e5e9',
    fontWeight: 600,
  },
  td: {
    background: '#f8f9fa',
    color: '#374151',
    padding: '5px 10px',
    borderBottom: '1px solid #e2e5e9',
  },
  tableWrap: {
    maxHeight: 240,
    overflowY: 'auto',
    borderRadius: 6,
    border: '1px solid #e2e5e9',
  },
  showMore: {
    background: 'none',
    border: 'none',
    color: '#6b7280',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    padding: '4px 0',
  },
  separator: {
    borderTop: '1px solid #e2e5e9',
    margin: 0,
    padding: 0,
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: 8,
    background: '#e2e5e9',
    border: '1px solid #2a2e34',
    borderRadius: 6,
    padding: '10px 14px',
    zIndex: 100,
    minWidth: 220,
    maxWidth: 340,
    pointerEvents: 'none',
  },
  tooltipRow: {
    color: '#374151',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    margin: '3px 0',
    lineHeight: 1.4,
  },
  tooltipLabel: {
    color: '#6b7280',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  statusBadge: {
    display: 'inline-block',
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 3,
    marginLeft: 6,
    verticalAlign: 'middle',
  },
};

function statusColor(status) {
  if (status === 'live') return { background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' };
  if (status === 'review') return { background: '#1f1a0a', color: '#d3a634', border: '1px solid #3d351a' };
  return { background: '#e2e5e9', color: '#6b7280', border: '1px solid #2a2e34' };
}

function MetricNameWithTooltip({ detail, metrics }) {
  const [hovered, setHovered] = useState(false);
  const metricInfo = metrics ? metrics.find(m => m.id === detail.metricId) : null;

  function handleClick() {
    if (detail.metricId) {
      window.open('../tracker.html?expand=' + detail.metricId, '_blank');
    }
  }

  return (
    <span
      style={styles.metricNameLink}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      {detail.metricName}
      {hovered && metricInfo && (
        <div style={styles.tooltip}>
          {(metricInfo.description || metricInfo.notes) && (
            <div style={styles.tooltipRow}>
              <span style={styles.tooltipLabel}>{metricInfo.description ? 'Description' : 'Notes'}: </span>{metricInfo.description || metricInfo.notes}
            </div>
          )}
          {metricInfo.view_name && (
            <div style={styles.tooltipRow}>
              <span style={styles.tooltipLabel}>Source: </span>BQ revenue.{metricInfo.view_name}
            </div>
          )}
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Status: </span>
            <span style={{ ...styles.statusBadge, ...statusColor(metricInfo.status) }}>
              {metricInfo.status || 'unknown'}
            </span>
          </div>
        </div>
      )}
    </span>
  );
}

function DataTable({ labels, data }) {
  const [showAll, setShowAll] = useState(false);
  const maxRows = 10;
  const displayLabels = showAll ? labels : labels.slice(0, maxRows);
  const displayData = showAll ? data : data.slice(0, maxRows);

  return (
    <div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Period</th>
              <th style={{ ...styles.th, textAlign: 'right' }}>Value</th>
            </tr>
          </thead>
          <tbody>
            {displayLabels.map((label, i) => (
              <tr key={i}>
                <td style={styles.td}>{label}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{displayData[i]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {labels.length > maxRows && !showAll && (
        <button style={styles.showMore} onClick={() => setShowAll(true)}>
          Show all {labels.length} rows...
        </button>
      )}
    </div>
  );
}

export default function ChartDetails({ queryDetails, styleRules, metrics }) {
  const [expanded, setExpanded] = useState(false);

  if (!queryDetails || queryDetails.length === 0) return null;

  return (
    <div>
      <button style={styles.toggle} onClick={() => setExpanded(!expanded)}>
        {expanded ? '▾ Hide Details' : '▸ Show Details'}
      </button>
      {expanded && (
        <div style={styles.panel}>
          {styleRules && styleRules.length > 0 && (
            <div>
              <div style={styles.label}>Style Rules</div>
              {styleRules.map((rule, i) => (
                <div key={i} style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: rule.color, marginRight: 6, verticalAlign: 'middle' }} />
                  {rule.target} {rule.operator} {rule.compareTo ? `"${rule.compareTo}"` : rule.threshold} → <span style={{ color: rule.color, fontWeight: 600 }}>{rule.color}</span>
                </div>
              ))}
              <hr style={styles.separator} />
            </div>
          )}
          {queryDetails.map((detail, i) => (
            <div key={i}>
              {i > 0 && <hr style={styles.separator} />}
              <p style={styles.metricHeader}>
                <MetricNameWithTooltip detail={detail} metrics={metrics} />{' '}
                <span style={styles.metricId}>#{detail.metricId}</span>
              </p>
              {detail.dependsOn && (
                <p style={styles.dependsOn}>
                  Depends on: {detail.dependsOn.join(', ')}
                </p>
              )}
              <div style={styles.label}>SQL Query</div>
              <pre style={styles.codeBlock}>{detail.sql}</pre>
              <div style={styles.label}>Date Column: <span style={{ color: '#374151' }}>{detail.dateColumn}</span></div>
              {detail.labels && detail.labels.length > 0 && (
                <>
                  <div style={styles.label}>Data ({detail.labels.length} rows)</div>
                  <DataTable labels={detail.labels} data={detail.data} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
