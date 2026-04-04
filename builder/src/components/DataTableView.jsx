import React, { useState, useMemo } from 'react';
import { formatDateLabels } from '../lib/chartUtils';

const styles = {
  wrapper: {
    maxHeight: 450,
    overflowY: 'auto',
    border: '1px solid #e2e5e9',
    borderRadius: 8,
    background: '#f8f9fa',
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
    background: '#ffffff',
    color: '#374151',
    padding: '10px 14px',
    textAlign: 'right',
    borderBottom: '1px solid #e2e5e9',
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
    borderBottom: '1px solid #e2e5e9',
    color: '#374151',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  },
  tdFirst: {
    textAlign: 'left',
    color: '#8b929b',
  },
  totalRow: {
    background: '#ffffff',
    fontWeight: 600,
  },
  sortArrow: {
    marginLeft: 4,
    fontSize: 10,
    color: '#6b7280',
  },
};

function fmtPivot(v, type) {
  if (v == null) return '-';
  if (type === 'string') return v;
  const n = Number(v);
  if (isNaN(n)) return v;
  if (type === 'delta' || type === 'pct') return `${n > 0 ? '+' : ''}${n.toLocaleString()}%`;
  if (type === 'signed') return `${n > 0 ? '+' : ''}${n.toLocaleString()}`;
  return n.toLocaleString();
}

function deltaColor(v, type) {
  if (type !== 'delta' && type !== 'signed') return undefined;
  const n = Number(v);
  if (isNaN(n) || n === 0) return undefined;
  return n > 0 ? '#059669' : '#dc2626';
}

function PivotTable({ pivotData, columns, noTotal }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const dataRows = noTotal ? pivotData : pivotData.slice(0, -1);
  const totalRow = noTotal ? null : pivotData[pivotData.length - 1];

  const sorted = useMemo(() => {
    if (!sortCol) return dataRows;
    return [...dataRows].sort((a, b) => {
      const av = a[sortCol] ?? -Infinity, bv = b[sortCol] ?? -Infinity;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [dataRows, sortCol, sortDir]);

  function handleSort(key) {
    if (key === 'dim') return;
    if (sortCol === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(key); setSortDir('desc'); }
  }

  function arrow(key) {
    if (sortCol !== key) return null;
    return <span style={styles.sortArrow}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  return (
    <div style={styles.wrapper}>
      <table style={styles.table}>
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                style={{ ...styles.th, ...(i === 0 ? styles.thFirst : {}), cursor: col.key === 'dim' ? 'default' : 'pointer' }}
                onClick={() => handleSort(col.key)}
              >
                {col.label}{arrow(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={ri}>
              {columns.map((col, i) => (
                <td
                  key={col.key}
                  style={{
                    ...styles.td,
                    ...(i === 0 ? styles.tdFirst : {}),
                    color: deltaColor(row[col.key], col.type) || styles.td.color,
                    fontWeight: col.type === 'delta' || col.type === 'signed' ? 600 : undefined,
                  }}
                >
                  {fmtPivot(row[col.key], col.type)}
                </td>
              ))}
            </tr>
          ))}
          {totalRow && (
            <tr style={styles.totalRow}>
              {columns.map((col, i) => (
                <td
                  key={col.key}
                  style={{
                    ...styles.td,
                    ...(i === 0 ? styles.tdFirst : {}),
                    fontWeight: 600,
                    color: deltaColor(totalRow[col.key], col.type) || undefined,
                  }}
                >
                  {fmtPivot(totalRow[col.key], col.type)}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function DataTableView({ labels, datasets, title, pivotData, columns, noTotal }) {
  if (pivotData && columns) {
    return <PivotTable pivotData={pivotData} columns={columns} noTotal={noTotal} />;
  }
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
