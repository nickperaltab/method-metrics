import React, { useMemo } from 'react';
import { formatValue } from './utils';

const styles = {
  container: {
    overflowX: 'auto',
    marginTop: 16,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
  },
  th: {
    background: '#1e3a5f',
    color: '#fff',
    padding: '8px 12px',
    textAlign: 'right',
    fontWeight: 600,
    fontSize: 11,
    whiteSpace: 'nowrap',
  },
  thFirst: {
    background: '#1e3a5f',
    color: '#fff',
    padding: '8px 12px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 11,
  },
  td: {
    padding: '6px 12px',
    textAlign: 'right',
    borderBottom: '1px solid #e2e5e9',
    color: '#374151',
  },
  tdFirst: {
    padding: '6px 12px',
    textAlign: 'left',
    borderBottom: '1px solid #e2e5e9',
    color: '#374151',
    fontWeight: 500,
  },
  negative: {
    color: '#dc2626',
  },
};

export default function DataTable({ config, dataMap }) {
  const { rows, columnHeaders } = useMemo(() => {
    // Collect all period labels from column metrics
    const allLabels = new Set();
    for (const col of config.columns) {
      const series = dataMap.get(col.metricId);
      if (series?.labels) series.labels.forEach(l => allLabels.add(l));
    }

    // Filter to current month and back, then take lastNMonths
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let sorted = [...allLabels].filter(l => l <= currentPeriod).sort().reverse();
    if (config.lastNMonths) {
      sorted = sorted.slice(0, config.lastNMonths);
    }
    // Re-reverse to show chronological (oldest first, matching Looker)
    sorted.reverse();

    // Build rows
    const rows = sorted.map(period => {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const [y, m] = period.split('-');
      const label = `${months[parseInt(m, 10) - 1]} ${y}`;

      const cells = config.columns.map(col => {
        if (col.derived) {
          // Compute derived value from two metrics: { a: metricId, b: metricId, op: 'subtract' }
          const aData = dataMap.get(col.derived.a);
          const bData = dataMap.get(col.derived.b);
          const aIdx = aData?.labels?.indexOf(period) ?? -1;
          const bIdx = bData?.labels?.indexOf(period) ?? -1;
          const aVal = aIdx >= 0 ? aData.data[aIdx] : null;
          const bVal = bIdx >= 0 ? bData.data[bIdx] : null;
          if (aVal == null || bVal == null) return null;
          return Math.round((aVal - bVal) * 100) / 100;
        }
        const series = dataMap.get(col.metricId);
        if (!series) return null;
        const idx = series.labels.indexOf(period);
        return idx >= 0 ? series.data[idx] : null;
      });

      return { label, period, cells };
    });

    return { rows, columnHeaders: config.columns };
  }, [config, dataMap]);

  if (rows.length === 0) return null;

  return (
    <div style={styles.container}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8,
        fontFamily: "'DM Sans', sans-serif" }}>
        {config.label}
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.thFirst}>Date (Month)</th>
            {columnHeaders.map(col => (
              <th key={col.metricId} style={styles.th}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.period}>
              <td style={styles.tdFirst}>{row.label}</td>
              {row.cells.map((value, i) => {
                const col = columnHeaders[i];
                const formatted = value != null ? formatValue(value, col.format) : 'null';
                const isNeg = value != null && value < 0;
                return (
                  <td key={i} style={{ ...styles.td, ...(isNeg ? styles.negative : {}) }}>
                    {formatted}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
