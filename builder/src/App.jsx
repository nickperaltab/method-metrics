import React from 'react';
import TopBar from './components/TopBar';
import Explorer from './components/Explorer';
import { useMetrics } from './hooks/useMetrics';
import { useBqAuth } from './hooks/useBqAuth';

export default function App() {
  const { metrics, loading: metricsLoading } = useMetrics();
  const { connected, userEmail, connect } = useBqAuth();

  return (
    <div style={{ background: '#06080a', color: '#c8cdd3', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
      <TopBar connected={connected} userEmail={userEmail} onConnect={connect} />
      {metricsLoading
        ? <p style={{ padding: 32, color: '#5a6370', textAlign: 'center' }}>Loading metrics...</p>
        : <Explorer metrics={metrics} bqConnected={connected} userEmail={userEmail} />
      }
    </div>
  );
}
