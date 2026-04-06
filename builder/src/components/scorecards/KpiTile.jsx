import React from 'react';
import { formatValue } from './utils';

const styles = {
  tile: {
    padding: '8px 0',
    borderBottom: '1px solid #f1f3f5',
  },
  label: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    color: '#6b7280',
    marginBottom: 2,
  },
  value: {
    fontSize: 28,
    fontWeight: 700,
    fontFamily: "'DM Sans', sans-serif",
    color: '#1a1a1a',
    lineHeight: 1.2,
  },
  delta: {
    fontSize: 12,
    fontFamily: "'DM Sans', sans-serif",
  },
  noData: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
};

export default function KpiTile({ label, value, format, deltaPercent, noData }) {
  if (noData) {
    return (
      <div style={styles.tile}>
        <div style={styles.label}>{label}</div>
        <div style={styles.noData}>No data</div>
      </div>
    );
  }

  const formatted = formatValue(value, format);

  let deltaEl = null;
  if (deltaPercent != null) {
    const color = deltaPercent > 0 ? '#059669' : deltaPercent < 0 ? '#dc2626' : '#6b7280';
    const arrow = deltaPercent > 0 ? '\u2191' : deltaPercent < 0 ? '\u2193' : '';
    const sign = deltaPercent > 0 ? '+' : '';
    deltaEl = (
      <div style={{ ...styles.delta, color }}>
        {arrow} {sign}{deltaPercent.toFixed(1)}%
      </div>
    );
  }

  return (
    <div style={styles.tile}>
      <div style={styles.label}>{label}</div>
      <div style={styles.value}>{formatted}</div>
      {deltaEl}
    </div>
  );
}
