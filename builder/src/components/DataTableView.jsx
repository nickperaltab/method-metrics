import React, { useState, useMemo } from 'react';
import { formatDateLabels } from '../lib/chartUtils';

const styles = {
  wrapper: {
    maxHeight: 450,
    overflowY: 'auto',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    background: '#0c0f12',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
  },
  th: {
    position: 'sticky',
    top: 0,
    background: '#111518',
    color: '#c8cdd3',
    padding: '10px 14px',
    textAlign: 'right',
    borderBottom: '1px solid #1a1e24',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    fontSize: 11,
    fontWeight: 600,
  },
  thFirst: {
    textAlign: 'left',
  },
  td: {
    padding: '8px 14px',
    borderBottom: '1px solid #1a1e24',
    color: '#c8cdd3',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  tdFirst: {
    textAlign: 'left',
    color: '#8b929b',
  },
  totalRow: {
    background: '#111518',
    fontWeight: 600,
  },
  sortArrow: {
    marginLeft: 4,
    fontSize: 10,
    color: '#5a6370',
  },
};

export default function DataTableView({ labels, datasets, title }) {
  const [sortCol, setSortCol] = useState(null); // null = period, 0..n = dataset index
  const [sortDir, setSortDir] = useState('asc');

  const displayLabels = useMemo(() => formatDateLabels(labels), [labels]);

  const rows = useMemo(() => {
    const base = labels.map((raw, i) => ({
      idx: i,
      period: displayLabels[i],
      rawPeriod: raw,
      values: datasets.map(ds => ds.data[i] ?? 0),
    }));

    if (sortCol === null) {
      // Sort by raw period string
      base.sort((a, b) => sortDir === 'asc'
        ? a.rawPeriod.localeCompare(b.rawPeriod)
        : b.rawPeriod.localeCompare(a.rawPeriod)
      );
    } else {
      base.sort((a, b) => sortDir === 'asc'
        ? a.values[sortCol] - b.values[sortCol]
        : b.values[sortCol] - a.values[sortCol]
      );
    }
    return base;
  }, [labels, displayLabels, datasets, sortCol, sortDir]);

  const totals = useMemo(() =>
    datasets.map(ds => ds.data.reduce((sum, v) => sum + (v ?? 0), 0)),
    [datasets]
  );

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  function arrow(col) {
    if (sortCol !== col) return null;
    return <span style={styles.sortArrow}>{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>;
  }

  function fmt(v) {
    if (v == null) return '-';
    return typeof v === 'number' ? v.toLocaleString() : v;
  }

  return (
    <div style={styles.wrapper}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th
              style={{ ...styles.th, ...styles.thFirst }}
              onClick={() => handleSort(null)}
            >
              Period{arrow(null)}
            </th>
            {datasets.map((ds, i) => (
              <th key={i} style={styles.th} onClick={() => handleSort(i)}>
                {ds.label}{arrow(i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.idx}>
              <td style={{ ...styles.td, ...styles.tdFirst }}>{row.period}</td>
              {row.values.map((v, i) => (
                <td key={i} style={styles.td}>{fmt(v)}</td>
              ))}
            </tr>
          ))}
          <tr style={styles.totalRow}>
            <td style={{ ...styles.td, ...styles.tdFirst, fontWeight: 600 }}>Total</td>
            {totals.map((t, i) => (
              <td key={i} style={{ ...styles.td, fontWeight: 600 }}>{fmt(t)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
