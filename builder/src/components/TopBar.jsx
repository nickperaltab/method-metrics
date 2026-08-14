import React from 'react';
import { NavLink } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';


const styles = {
  bar: { padding: '12px 24px', borderBottom: '1px solid #e2e5e9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8f9fa' },
  left: { display: 'flex', alignItems: 'center', gap: 16 },
  right: { display: 'flex', alignItems: 'center', gap: 16 },
  logo: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#059669', background: '#ecfdf5', padding: '5px 10px', borderRadius: 4, border: '1px solid #a7f3d0' },
  navLink: { color: '#6b7280', textDecoration: 'none', fontSize: 13, padding: '4px 12px', borderRadius: 4 },
  activeLink: { background: '#ecfdf5', color: '#059669' },
  connected: { color: '#059669', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
  connectBtn: { background: '#ecfdf5', border: '1px solid #059669', color: '#059669', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
  userInfo: { color: '#6b7280', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", display: 'flex', alignItems: 'center', gap: 8 },
  userName: { color: '#374151' },
  switchBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 11, padding: 0, textDecoration: 'underline', fontFamily: "'JetBrains Mono', monospace" },
};

function routerNavStyle({ isActive }) {
  return isActive
    ? { ...styles.navLink, ...styles.activeLink }
    : styles.navLink;
}

export default function TopBar({ connected, userEmail, onConnect }) {
  const { currentUser } = useUser();

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <a href="/method-metrics/index.html" style={{ ...styles.logo, textDecoration: 'none' }}>Method</a>
        <NavLink to="/chat" style={routerNavStyle}>Chat</NavLink>
        <NavLink to="/dashboards" style={routerNavStyle}>Dashboards</NavLink>
        {/*
          Call Prep is intentionally not linked here. The /call-prep routes stay
          registered in App.jsx and remain reachable by direct URL — this only
          removes it from the nav so it is not discoverable by browsing.
          Requested 2026-08-14.
        */}
        <a href="../tracker.html" style={styles.navLink}>Metrics</a>
      </div>
      <div style={styles.right}>
        {currentUser && (
          <span style={styles.userInfo}>
            <span style={styles.userName}>{currentUser.name}</span>
          </span>
        )}
        {connected
          ? <span style={styles.connected}>&#9679; BQ Connected{userEmail ? ` (${userEmail})` : ''}</span>
          : <button onClick={onConnect} style={styles.connectBtn}>Connect BigQuery</button>
        }
      </div>
    </div>
  );
}
