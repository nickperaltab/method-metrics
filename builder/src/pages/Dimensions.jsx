import React from 'react';

export default function Dimensions() {
  return (
    <div style={{ padding: 48, maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#edf0f3', marginBottom: 8 }}>
        Dimensions
      </h1>
      <p style={{ color: '#5a6370', fontSize: 14, lineHeight: 1.6 }}>
        Manage approved filter dimensions for each metric.
        Only verified dimensions appear in the chart builder.
      </p>
    </div>
  );
}
