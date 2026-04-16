import React, { useState, useMemo } from 'react';

function formatCell(value) {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

function friendlyLabel(col) {
  return col
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

const PAGE_SIZE = 50;

export default function RawTable({ config, dataMap }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);

  const rawData = dataMap.get(`${config.metricId}:raw`);

  const cols = config.columns || Object.keys(rawData?.rows?.[0] || {});

  const sorted = useMemo(() => {
    if (!rawData?.rows?.length) return [];
    if (!sortCol) return rawData.rows;
    return [...rawData.rows].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase(), bs = String(bv).toLowerCase();
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [rawData, sortCol, sortDir]);

  if (!rawData?.rows?.length) {
    return (
      <div style={{ color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>
        No records available
      </div>
    );
  }

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageRows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(0);
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: '#374151',
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {config.label || 'Records'} ({sorted.length})
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7280' }}>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{
                background: 'none', border: '1px solid #e5e7eb', borderRadius: 4,
                padding: '2px 8px', cursor: page === 0 ? 'default' : 'pointer',
                color: page === 0 ? '#d1d5db' : '#374151', fontSize: 12,
              }}
            >Prev</button>
            <span>{page + 1} / {totalPages}</span>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{
                background: 'none', border: '1px solid #e5e7eb', borderRadius: 4,
                padding: '2px 8px', cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                color: page >= totalPages - 1 ? '#d1d5db' : '#374151', fontSize: 12,
              }}
            >Next</button>
          </div>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontSize: 12, fontFamily: "'DM Sans', sans-serif",
        }}>
          <thead>
            <tr>
              {cols.map(col => (
                <th
                  key={col}
                  onClick={() => handleSort(col)}
                  style={{
                    textAlign: 'left', padding: '6px 12px',
                    background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
                    color: sortCol === col ? '#1a1a1a' : '#6b7280',
                    fontWeight: 600, fontSize: 11,
                    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  {friendlyLabel(col)}
                  {sortCol === col && (
                    <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                {cols.map(col => (
                  <td key={col} style={{
                    padding: '6px 12px', color: '#374151',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
          Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
        </div>
      )}
    </div>
  );
}
