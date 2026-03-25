import React from 'react';
import { useMetrics } from './hooks/useMetrics';

export default function App() {
  const { metrics, grouped, loading, error } = useMetrics();

  return (
    <div style={{ background: '#06080a', color: '#c8cdd3', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ padding: 32, color: '#edf0f3' }}>Method Explorer</h1>
      <p style={{ padding: '0 32px', color: '#5a6370' }}>
        {loading ? 'Loading metrics...' : error ? `Error: ${error}` : `Loaded ${metrics.length} metrics (${grouped.primitives.length} primitives, ${grouped.derived.length} derived)`}
      </p>
    </div>
  );
}
