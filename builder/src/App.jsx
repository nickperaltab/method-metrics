import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Explorer from './components/Explorer';
import DashboardView from './components/DashboardView';
import ChatExplorer from './components/ChatExplorer';
import Home from './pages/Home';
import Registry from './pages/Registry';
import Dimensions from './pages/Dimensions';
import AdminInsights from './pages/AdminInsights';
import Scorecard from './pages/Scorecard';
import { UserProvider } from './contexts/UserContext';
import { useMetrics } from './hooks/useMetrics';
import { useBqAuth } from './hooks/useBqAuth';

const Loading = () => (
  <p style={{ padding: 32, color: '#5a6370', textAlign: 'center' }}>Loading metrics...</p>
);

function SignInGate({ onConnect }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f8f9fa', fontFamily: "'DM Sans', sans-serif",
    }}>
      <div style={{
        background: '#fff', border: '1px solid #e2e5e9', borderRadius: 12,
        padding: 48, maxWidth: 420, textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
          letterSpacing: '.12em', textTransform: 'uppercase', color: '#059669',
          background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 4,
          padding: '5px 10px', display: 'inline-block', marginBottom: 24,
        }}>Method Metrics</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 }}>
          Sign in with Google
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
          Connect your Google account to access dashboards and scorecards.
        </p>
        <button
          onClick={onConnect}
          style={{
            padding: '10px 24px', background: '#059669', color: '#fff',
            border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Connect Google Account
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { metrics, loading: metricsLoading } = useMetrics();
  const { connected, userEmail, userAvatar, connect } = useBqAuth();

  // Gate the app behind OAuth. No email → sign-in screen.
  if (!connected || !userEmail) {
    return <SignInGate onConnect={connect} />;
  }

  return (
    <UserProvider email={userEmail}>
      <HashRouter>
        <Layout bqConnected={connected} userEmail={userEmail} onConnect={connect}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/chat"
              element={
                metricsLoading ? <Loading /> :
                <ChatExplorer metrics={metrics} bqConnected={connected} userEmail={userEmail} userAvatar={userAvatar} />
              }
            />
            <Route
              path="/explorer"
              element={
                metricsLoading ? <Loading /> :
                <Explorer metrics={metrics} bqConnected={connected} userEmail={userEmail} userAvatar={userAvatar} />
              }
            />
            <Route path="/dashboards" element={<Navigate to="/" replace />} />
            <Route path="/dashboards/:id" element={<DashboardView userEmail={userEmail} userAvatar={userAvatar} metrics={metrics} bqConnected={connected} />} />
            <Route path="/approved" element={<Navigate to="/" replace />} />
            <Route path="/scorecards/:id" element={
              metricsLoading ? <Loading /> :
              <Scorecard metrics={metrics} bqConnected={connected} onConnect={connect} />
            } />
            <Route path="/admin/registry" element={<Registry />} />
            <Route path="/admin/dimensions" element={<Dimensions />} />
            <Route path="/admin/insights" element={<AdminInsights metrics={metrics} />} />
          </Routes>
        </Layout>
      </HashRouter>
    </UserProvider>
  );
}
