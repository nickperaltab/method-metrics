import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { isAdmin } from '../lib/permissions';
import { fetchMyDashboards, fetchApprovedDashboardsList, fetchStars } from '../lib/supabase';
import { SCORECARDS } from '../config/scorecards';
import { getScorecardStars } from '../pages/Home';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: '\u2302', exact: true },
];

const ADMIN_ITEMS = [
  { path: '/admin/registry', label: 'Metric Registry', icon: '\u2261' },
  { path: '/admin/insights', label: 'AI Insights', icon: '\u25C8' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { currentUser, switchUser } = useUser();
  const [myDashboards, setMyDashboards] = useState([]);
  const [approvedDashboards, setApprovedDashboards] = useState([]);
  const [stars, setStars] = useState([]);
  const [scStars, setScStars] = useState(() => getScorecardStars());
  const [adminOpen, setAdminOpen] = useState(false);

  const loadData = useCallback(() => {
    if (!currentUser) return;
    Promise.all([
      fetchMyDashboards(currentUser.id),
      fetchApprovedDashboardsList(),
    ]).then(([mine, approved]) => {
      setMyDashboards(mine);
      setApprovedDashboards(approved);
    }).catch(() => {});
    fetchStars(currentUser.id).then(setStars).catch(() => {});
  }, [currentUser]);

  useEffect(() => { loadData(); }, [loadData]);

  // Refresh when stars change elsewhere in the app
  useEffect(() => {
    const handler = () => {
      loadData();
      setScStars(getScorecardStars());
    };
    window.addEventListener('stars-changed', handler);
    return () => window.removeEventListener('stars-changed', handler);
  }, [loadData]);

  const linkStyle = ({ isActive }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 16px',
    color: isActive ? '#059669' : '#6b7280',
    background: isActive ? '#ecfdf5' : 'transparent',
    textDecoration: 'none',
    fontSize: 13,
    borderRadius: 6,
    margin: '2px 8px',
    transition: 'all .15s',
  });

  const sectionLabel = { padding: '4px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#6b7280' };

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="sidebar-overlay"
          onClick={onToggle}
          style={{
            display: 'none',
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 98,
          }}
        />
      )}

      <aside
        data-testid="sidebar"
        style={{
          width: collapsed ? 0 : 240,
          minWidth: collapsed ? 0 : 240,
          height: '100vh',
          background: '#f1f3f5',
          borderRight: collapsed ? 'none' : '1px solid #e2e5e9',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width .2s, min-width .2s',
          position: 'sticky',
          top: 0,
          zIndex: 99,
        }}
      >
        {/* Logo */}
        <div style={{ padding: '20px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <NavLink to="/" style={{ textDecoration: 'none' }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.12em',
              textTransform: 'uppercase',
              color: '#059669',
              background: '#ecfdf5',
              padding: '5px 10px',
              borderRadius: 4,
              border: '1px solid #a7f3d0',
            }}>
              Method
            </span>
          </NavLink>
        </div>

        {/* Main nav */}
        <nav style={{ flex: 1, overflowY: 'auto', paddingTop: 8 }}>
          {NAV_ITEMS.map(item => (
            <NavLink key={item.path} to={item.path} end={item.exact} style={linkStyle}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* Chart Builder */}
          <NavLink to="/chat" style={linkStyle}>
            <span style={{ fontSize: 16 }}>{'\u2728'}</span>
            Chart Builder
          </NavLink>

          {/* My Dashboards (starred AI dashboards only) */}
          {stars.length > 0 && (() => {
            const starredDashboards = [...myDashboards, ...approvedDashboards]
              .filter((d, i, arr) => stars.includes(d.id) && arr.findIndex(x => x.id === d.id) === i)
              .slice(0, 8);
            return (
              <>
                <div style={{ height: 1, background: '#e2e5e9', margin: '12px 16px' }} />
                <div style={sectionLabel}>My Dashboards</div>
                {starredDashboards.map(d => (
                  <NavLink key={`db-${d.id}`} to={`/dashboards/${d.id}`} style={linkStyle} title={d.name}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  </NavLink>
                ))}
              </>
            );
          })()}

          {/* Method Approved scorecards */}
          {(() => {
            const approved = Object.values(SCORECARDS).filter(sc => !sc.group);
            return (
              <>
                <div style={{ height: 1, background: '#e2e5e9', margin: '12px 16px' }} />
                <div style={sectionLabel}>Method Approved</div>
                {approved.map(sc => (
                  <NavLink key={sc.id} to={`/scorecards/${sc.id}`} style={linkStyle}>
                    {sc.title}
                  </NavLink>
                ))}
              </>
            );
          })()}

          {/* Admin — collapsible, with Funnel/Plan sub-headings */}
          {isAdmin(currentUser) && (() => {
            const funnel = Object.values(SCORECARDS).filter(sc => sc.group === 'funnel');
            const plan = Object.values(SCORECARDS).filter(sc => sc.group === 'plan');
            const revenue = Object.values(SCORECARDS).filter(sc => sc.group === 'revenue');
            const customer = Object.values(SCORECARDS).filter(sc => sc.group === 'customer');
            return (
              <>
                <div style={{ height: 1, background: '#e2e5e9', margin: '12px 16px' }} />
                <div
                  onClick={() => setAdminOpen(o => !o)}
                  style={{ ...sectionLabel, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16, userSelect: 'none' }}
                >
                  Admin
                  <span style={{ fontSize: 10, transition: 'transform .15s', display: 'inline-block', transform: adminOpen ? 'rotate(90deg)' : 'none' }}>›</span>
                </div>
                {adminOpen && (
                  <>
                    <div style={{ ...sectionLabel, paddingLeft: 24, color: '#c4c9d0', marginTop: 4 }}>Funnel</div>
                    {funnel.map(sc => (
                      <NavLink key={sc.id} to={`/scorecards/${sc.id}`} style={({ isActive }) => ({ ...linkStyle({ isActive }), paddingLeft: 24 })}>
                        <span style={{ fontSize: 12, color: sc.status === 'approved' ? '#059669' : '#f59e0b' }}>{'\u25C9'}</span>
                        {sc.title}
                      </NavLink>
                    ))}
                    <div style={{ ...sectionLabel, paddingLeft: 24, color: '#c4c9d0', marginTop: 8 }}>Plan</div>
                    {plan.map(sc => (
                      <NavLink key={sc.id} to={`/scorecards/${sc.id}`} style={({ isActive }) => ({ ...linkStyle({ isActive }), paddingLeft: 24 })}>
                        <span style={{ fontSize: 12, color: sc.status === 'approved' ? '#059669' : '#f59e0b' }}>{'\u25C9'}</span>
                        {sc.title}
                      </NavLink>
                    ))}
                    <div style={{ ...sectionLabel, paddingLeft: 24, color: '#c4c9d0', marginTop: 8 }}>Revenue</div>
                    {revenue.map(sc => (
                      <NavLink key={sc.id} to={`/scorecards/${sc.id}`} style={({ isActive }) => ({ ...linkStyle({ isActive }), paddingLeft: 24 })}>
                        <span style={{ fontSize: 12, color: sc.status === 'approved' ? '#059669' : '#f59e0b' }}>{'\u25C9'}</span>
                        {sc.title}
                      </NavLink>
                    ))}
                    <div style={{ ...sectionLabel, paddingLeft: 24, color: '#c4c9d0', marginTop: 8 }}>Customer</div>
                    {customer.map(sc => (
                      <NavLink key={sc.id} to={`/scorecards/${sc.id}`} style={({ isActive }) => ({ ...linkStyle({ isActive }), paddingLeft: 24 })}>
                        <span style={{ fontSize: 12, color: sc.status === 'approved' ? '#059669' : '#f59e0b' }}>{'\u25C9'}</span>
                        {sc.title}
                      </NavLink>
                    ))}
                    <div style={{ height: 1, background: '#e2e5e9', margin: '8px 16px' }} />
                    {ADMIN_ITEMS.map(item => (
                      <NavLink key={item.path} to={item.path} style={({ isActive }) => ({ ...linkStyle({ isActive }), paddingLeft: 24 })}>
                        <span style={{ fontSize: 16 }}>{item.icon}</span>
                        {item.label}
                      </NavLink>
                    ))}
                  </>
                )}
              </>
            );
          })()}
        </nav>

        {/* User section at bottom */}
        {currentUser && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #e2e5e9' }}>
            <span style={{ fontSize: 13, color: '#374151' }}>{currentUser.name}</span>
          </div>
        )}
      </aside>
    </>
  );
}
