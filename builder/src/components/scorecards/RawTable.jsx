import React, { useState } from 'react';

function formatCell(value) {
  if (value == null) return '—';
  // Format date strings nicely
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return String(value);
}

function friendlyLabel(col) {
  return col
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}

export default function RawTable({ config, dataMap }) {
  const [expanded, setExpanded] = useState(false);
  const rawData = dataMap.get(`${config.metricId}:raw`);

  if (!rawData?.rows?.length) {
    return (
      <div style={{ color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>
        No records available
      </div>
    );
  }

  const cols = config.columns || Object.keys(rawData.rows[0] || {});
  const displayLimit = expanded ? rawData.rows.length : 10;
  const rows = rawData.rows.slice(0, displayLimit);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {config.label || 'Recent Records'}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse',
          fontSize: 12, fontFamily: "'DM Sans', sans-serif",
        }}>
          <thead>
            <tr>
              {cols.map(col => (
                <th key={col} style={{
                  textAlign: 'left', padding: '6px 12px',
                  background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
                  color: '#6b7280', fontWeight: 600, fontSize: 11,
                  whiteSpace: 'nowrap',
                }}>
                  {friendlyLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
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
      {rawData.rows.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            marginTop: 8, fontSize: 12, color: '#2563eb', background: 'none',
            border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {expanded ? 'Show less' : `Show all ${rawData.rows.length} records`}
        </button>
      )}
    </div>
  );
}
