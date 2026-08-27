import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import posthog from './lib/posthog';
import { setCurrentUserEmail } from './lib/supabase';
import Layout from './components/Layout';
import Explorer from './components/Explorer';
import DashboardView from './components/DashboardView';
import ChatExplorer from './components/ChatExplorer';
import Home from './pages/Home';
import Registry from './pages/Registry';
import Dimensions from './pages/Dimensions';
import AdminInsights from './pages/AdminInsights';
import Scorecard from './pages/Scorecard';
import McpToken from './pages/McpToken';
import SaasDataExport from './pages/SaasDataExport';
import PsOverview from './pages/PsOverview';
import CallPrep from './pages/CallPrep';
import CallPrepAccount from './pages/CallPrepAccount';
import CallPrepBook from './pages/CallPrepBook';
import FreeHours from './pages/FreeHours';
import Handoffs from './pages/Handoffs';
import HandoffAccount from './pages/HandoffAccount';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ProjectNew from './pages/ProjectNew';
import ProjectEdit from './pages/ProjectEdit';
import CustomerPage from './pages/CustomerPage';
import { UserProvider } from './contexts/UserContext';
import { useMetrics } from './hooks/useMetrics';
import { useBqAuth } from './hooks/useBqAuth';

const Loading = () => (
  <p style={{ padding: 32, color: '#5a6370', textAlign: 'center' }}>Loading metrics...</p>
);

function PosthogPageview() {
  const location = useLocation();
  useEffect(() => {
    posthog.capture('$pageview', {
      $pathname: location.pathname + (location.search || ''),
    });
  }, [location.pathname, location.search]);
  return null;
}

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
  const { connected, userEmail, userAvatar, connect } = useBqAuth();
  const bypassAuth = import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH === 'true';

  // Set RLS identity header synchronously so useMetrics's fetch below
  // includes x-method-email from its first call onward.
  setCurrentUserEmail(userEmail || null);

  const { metrics, loading: metricsLoading } = useMetrics(userEmail);

  // Gate the app behind OAuth in production. In local dev, allow an explicit
  // VITE_BYPASS_AUTH=true override so UI work can proceed without Google login.
  if (!bypassAuth && (!connected || !userEmail)) {
    return <SignInGate onConnect={connect} />;
  }

  return (
    <UserProvider email={userEmail}>
      <HashRouter>
        <PosthogPageview />
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
            <Route path="/ps" element={<PsOverview />} />
            <Route path="/call-prep" element={<CallPrep />} />
            <Route path="/call-prep/account/:recordId" element={<CallPrepAccount />} />
            <Route path="/call-prep/:consultant" element={<CallPrepBook />} />
            <Route path="/free-hours" element={<FreeHours />} />
            <Route path="/handoffs" element={<Handoffs />} />
            <Route path="/handoffs/account/:recordId" element={<HandoffAccount />} />
            {/* Project tracker. Reachable by URL in production but deliberately
                not in the nav yet — it has no backing store, so it only has data
                under `npm run dev:mock`. See docs/local-ui-dev.md. */}
            <Route path="/projects" element={<Projects />} />
            {/* /new before /:projectId so "new" isn't parsed as a project id. */}
            <Route path="/projects/new" element={<ProjectNew />} />
            <Route path="/projects/:projectId" element={<ProjectDetail />} />
            <Route path="/projects/:projectId/edit" element={<ProjectEdit />} />
            {/* The customer page. Reads mostly real BigQuery tables, so unlike the
                rest of the tracker it is useful outside mock mode. */}
            <Route path="/accounts/:recordId" element={<CustomerPage />} />
            <Route path="/mcp-token" element={<McpToken userEmail={userEmail} bqConnected={connected} onConnect={connect} />} />
            <Route path="/admin/registry" element={<Registry />} />
            <Route path="/admin/dimensions" element={<Dimensions />} />
            <Route path="/admin/insights" element={<AdminInsights metrics={metrics} />} />
            {/* Disconnected admin route — no nav link, direct URL only. */}
            <Route path="/exports/saas-data" element={<SaasDataExport bqConnected={connected} />} />
          </Routes>
        </Layout>
      </HashRouter>
    </UserProvider>
  );
}
