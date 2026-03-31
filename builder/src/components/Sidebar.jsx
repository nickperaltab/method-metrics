import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { fetchDashboards, fetchStars } from '../lib/supabase';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: '\u2302', exact: true },
];

const ADMIN_ITEMS = [
  { path: '/admin/registry', label: 'Metric Registry', icon: '\u2261' },
  { path: '/admin/dimensions', label: 'Dimensions', icon: '\u25A6' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { currentUser, switchUser } = useUser();
  const [dashboards, setDashboards] = useState([]);
  const [stars, setStars] = useState([]);

  useEffect(() => {
    fetchDashboards().then(setDashboards).catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchStars(currentUser.id).then(setStars).catch(() => {});
    }
  }, [currentUser]);

  const linkStyle = ({ isActive }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 16px',
    color: isActive ? '#34d399' : '#8b929a',
    background: isActive ? '#0a1f17' : 'transparent',
    textDecoration: 'none',
    fontSize: 13,
    borderRadius: 6,
    margin: '2px 8px',
    transition: 'all .15s',
  });

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
            background: 'rgba(0,0,0,0.5)',
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
          background: '#0a0d10',
          borderRight: collapsed ? 'none' : '1px solid #1a1e24',
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
              color: '#34d399',
              background: '#0a1f17',
              padding: '5px 10px',
              borderRadius: 4,
              border: '1px solid #1a3d2e',
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

          {/* Favorites */}
          {stars.length > 0 && (
            <>
              <div style={{ height: 1, background: '#1a1e24', margin: '12px 16px' }} />
              <div style={{ padding: '4px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#5a6370' }}>
                {'\u2605'} Favorites
              </div>
              {dashboards.filter(d => stars.includes(d.id)).map(d => (
                <NavLink key={`fav-${d.id}`} to={`/dashboards/${d.id}`} style={linkStyle}>
                  <span style={{ fontSize: 12, color: '#fbbf24' }}>{'\u2605'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
                </NavLink>
              ))}
            </>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: '#1a1e24', margin: '12px 16px' }} />

          {/* My Dashboards */}
          <div style={{ padding: '4px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#5a6370' }}>
            My Dashboards
          </div>
          {dashboards.slice(0, 8).map(d => (
            <NavLink key={d.id} to={`/dashboards/${d.id}`} style={linkStyle}>
              <span style={{ fontSize: 12, opacity: 0.5 }}>{'\u25A0'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
            </NavLink>
          ))}
          <NavLink to="/dashboards" end style={linkStyle}>
            <span style={{ fontSize: 12 }}>+</span>
            All Dashboards
          </NavLink>

          {/* Divider */}
          <div style={{ height: 1, background: '#1a1e24', margin: '12px 16px' }} />

          {/* Admin */}
          <div style={{ padding: '4px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#5a6370' }}>
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
            borderTop: '1px solid #1a1e24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, color: '#c8cdd3' }}>{currentUser.name}</span>
            <button
              onClick={switchUser}
              style={{
                background: 'none',
                border: 'none',
                color: '#5a6370',
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
