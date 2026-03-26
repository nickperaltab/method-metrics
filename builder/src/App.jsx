import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import TopBar from './components/TopBar';
import Home from './components/Home';
import Explorer from './components/Explorer';
import DashboardList from './components/DashboardList';
import DashboardView from './components/DashboardView';
import ChatExplorer from './components/ChatExplorer';
import { useMetrics } from './hooks/useMetrics';
import { useBqAuth } from './hooks/useBqAuth';

export default function App() {
  const { metrics, loading: metricsLoading } = useMetrics();
  const { connected, userEmail, connect } = useBqAuth();

  return (
    <HashRouter>
      <div style={{ background: '#06080a', color: '#c8cdd3', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif" }}>
        <TopBar connected={connected} userEmail={userEmail} onConnect={connect} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/explorer"
            element={
              metricsLoading
                ? <p style={{ padding: 32, color: '#5a6370', textAlign: 'center' }}>Loading metrics...</p>
                : <Explorer metrics={metrics} bqConnected={connected} userEmail={userEmail} />
            }
          />
          <Route
            path="/chat"
            element={
              metricsLoading
                ? <p style={{ padding: 32, color: '#5a6370', textAlign: 'center' }}>Loading metrics...</p>
                : <ChatExplorer metrics={metrics} bqConnected={connected} userEmail={userEmail} />
            }
          />
          <Route path="/dashboards" element={<DashboardList userEmail={userEmail} />} />
          <Route path="/dashboards/:id" element={<DashboardView userEmail={userEmail} metrics={metrics} bqConnected={connected} />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
