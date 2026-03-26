import React, { useState } from 'react';

const styles = {
  toggle: {
    background: 'none',
    border: 'none',
    color: '#5a6370',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    padding: '6px 0',
    textAlign: 'left',
  },
  panel: {
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  metricHeader: {
    color: '#edf0f3',
    fontSize: 13,
    fontFamily: "'DM Sans', sans-serif",
    fontWeight: 600,
    margin: 0,
  },
  metricNameLink: {
    cursor: 'pointer',
    position: 'relative',
    display: 'inline-block',
    borderBottom: '1px dashed #5a6370',
  },
  metricId: {
    color: '#5a6370',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 400,
  },
  dependsOn: {
    color: '#5a6370',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    margin: '4px 0 0 0',
  },
  label: {
    color: '#5a6370',
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    margin: '8px 0 4px 0',
  },
  codeBlock: {
    background: '#111518',
    color: '#c8cdd3',
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
    background: '#0c0f12',
    color: '#5a6370',
    padding: '6px 10px',
    textAlign: 'left',
    borderBottom: '1px solid #1a1e24',
    fontWeight: 600,
  },
  td: {
    background: '#0c0f12',
    color: '#c8cdd3',
    padding: '5px 10px',
    borderBottom: '1px solid #1a1e24',
  },
  tableWrap: {
    maxHeight: 240,
    overflowY: 'auto',
    borderRadius: 6,
    border: '1px solid #1a1e24',
  },
  showMore: {
    background: 'none',
    border: 'none',
    color: '#5a6370',
    cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    padding: '4px 0',
  },
  separator: {
    borderTop: '1px solid #1a1e24',
    margin: 0,
    padding: 0,
  },
  tooltip: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    marginBottom: 8,
    background: '#1a1e24',
    border: '1px solid #2a2e34',
    borderRadius: 6,
    padding: '10px 14px',
    zIndex: 100,
    minWidth: 220,
    maxWidth: 340,
    pointerEvents: 'none',
  },
  tooltipRow: {
    color: '#c8cdd3',
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    margin: '3px 0',
    lineHeight: 1.4,
  },
  tooltipLabel: {
    color: '#5a6370',
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
  if (status === 'live') return { background: '#0a1f17', color: '#34d399', border: '1px solid #1a3d2e' };
  if (status === 'review') return { background: '#1f1a0a', color: '#d3a634', border: '1px solid #3d351a' };
  return { background: '#1a1e24', color: '#5a6370', border: '1px solid #2a2e34' };
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

export default function ChartDetails({ queryDetails, metrics }) {
  const [expanded, setExpanded] = useState(false);

  if (!queryDetails || queryDetails.length === 0) return null;

  return (
    <div>
      <button style={styles.toggle} onClick={() => setExpanded(!expanded)}>
        {expanded ? '▾ Hide Details' : '▸ Show Details'}
      </button>
      {expanded && (
        <div style={styles.panel}>
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
              <div style={styles.label}>Date Column: <span style={{ color: '#c8cdd3' }}>{detail.dateColumn}</span></div>
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
