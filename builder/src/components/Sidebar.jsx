import React, { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { fetchMyDashboards, fetchApprovedDashboardsList, fetchStars } from '../lib/supabase';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: '\u2302', exact: true },
];

const ADMIN_ITEMS = [
  { path: '/admin/registry', label: 'Metric Registry', icon: '\u2261' },
  { path: '/admin/dimensions', label: 'Dimensions', icon: '\u25A6' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { currentUser, switchUser } = useUser();
  const [myDashboards, setMyDashboards] = useState([]);
  const [approvedDashboards, setApprovedDashboards] = useState([]);
  const [stars, setStars] = useState([]);

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
    const handler = () => loadData();
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
          <NavLink to="/charts" style={linkStyle}>
            <span style={{ fontSize: 16 }}>{'\u25A3'}</span>
            My Charts
          </NavLink>

          {/* Favorites */}
          {stars.length > 0 && (
            <>
              <div style={{ height: 1, background: '#e2e5e9', margin: '12px 16px' }} />
              <div style={sectionLabel}>{'\u2605'} Favorites</div>
              {[...myDashboards, ...approvedDashboards]
                .filter((d, i, arr) => stars.includes(d.id) && arr.findIndex(x => x.id === d.id) === i)
                .map(d => (
                  <NavLink key={`fav-${d.id}`} to={`/dashboards/${d.id}`} style={linkStyle} title={d.name}>
                    <span style={{ fontSize: 12, color: '#f59e0b' }}>{'\u2605'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                  </NavLink>
                ))}
            </>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: '#e2e5e9', margin: '12px 16px' }} />

          {/* Method Approved Dashboards */}
          {approvedDashboards.length > 0 && (
            <>
              <div style={sectionLabel}>Method Approved</div>
              {approvedDashboards.slice(0, 8).map(d => (
                <NavLink key={`approved-${d.id}`} to={`/dashboards/${d.id}`} style={linkStyle} title={d.name}>
                  <span style={{ fontSize: 10, color: '#059669', fontWeight: 700 }}>✓</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                </NavLink>
              ))}
              <div style={{ height: 1, background: '#e2e5e9', margin: '12px 16px' }} />
            </>
          )}

          {/* My Dashboards */}
          <NavLink to="/dashboards" end style={linkStyle}>
            <span style={{ fontSize: 16 }}>{'\u25A0'}</span>
            My Dashboards
          </NavLink>
          {myDashboards.slice(0, 8).map(d => (
            <NavLink key={d.id} to={`/dashboards/${d.id}`} style={linkStyle} title={d.name}>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{'\u25A0'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            </NavLink>
          ))}

          {/* Divider */}
          <div style={{ height: 1, background: '#e2e5e9', margin: '12px 16px' }} />

          {/* Admin */}
          <div style={{ padding: '4px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#6b7280' }}>
            Admin
          </div>
          {ADMIN_ITEMS.map(item => (
            <NavLink key={item.path} to={item.path} style={linkStyle}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User section at bottom */}
        {currentUser && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #e2e5e9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, color: '#374151' }}>{currentUser.name}</span>
            <button
              onClick={switchUser}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              switch
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
