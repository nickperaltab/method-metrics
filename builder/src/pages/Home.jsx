import React from 'react';

export default function Home() {
  return (
    <div style={{ padding: 48, maxWidth: 600 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#edf0f3', marginBottom: 8 }}>
        Metrics Hub
      </h1>
      <p style={{ color: '#5a6370', fontSize: 14, lineHeight: 1.6 }}>
        Single source of truth for Method's revenue and marketing metrics.
        Favorites, recent charts, and suggestions will live here.
      </p>
    </div>
  );
}
