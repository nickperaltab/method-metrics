import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Explorer from './components/Explorer';
import DashboardList from './components/DashboardList';
import DashboardView from './components/DashboardView';
import ChatExplorer from './components/ChatExplorer';
import Home from './pages/Home';
import Charts from './pages/Charts';
import Registry from './pages/Registry';
import Dimensions from './pages/Dimensions';
import AdminInsights from './pages/AdminInsights';
import ApprovedDashboards from './pages/ApprovedDashboards';
import Scorecard from './pages/Scorecard';
import { UserProvider } from './contexts/UserContext';
import { useMetrics } from './hooks/useMetrics';
import { useBqAuth } from './hooks/useBqAuth';

const Loading = () => (
  <p style={{ padding: 32, color: '#5a6370', textAlign: 'center' }}>Loading metrics...</p>
);

export default function App() {
  const { metrics, loading: metricsLoading } = useMetrics();
  const { connected, userEmail, userAvatar, connect } = useBqAuth();

  return (
    <UserProvider>
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
            <Route path="/dashboards" element={<DashboardList userEmail={userEmail} />} />
            <Route path="/dashboards/:id" element={<DashboardView userEmail={userEmail} userAvatar={userAvatar} metrics={metrics} bqConnected={connected} />} />
            <Route path="/charts" element={<Charts />} />
            <Route path="/approved" element={<ApprovedDashboards />} />
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
