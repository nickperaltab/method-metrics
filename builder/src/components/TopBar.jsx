import React from 'react';
import { NavLink } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { MOCK_MODE } from '../dev/mockMode';


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
  // Loud on purpose: nothing on these screens is real in offline UI mode.
  mockBadge: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#b45309',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px',
  },
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
        <NavLink to="/ps" style={routerNavStyle}>PS</NavLink>
        <NavLink to="/call-prep" style={routerNavStyle}>Call Prep</NavLink>
        <NavLink to="/handoffs" style={routerNavStyle}>Handoffs</NavLink>
        {/* Projects has no backing store yet — only linked in offline mock mode
            so it can't be clicked into an empty screen in production. */}
        {MOCK_MODE && <NavLink to="/projects" style={routerNavStyle}>Projects</NavLink>}
        <a href="../tracker.html" style={styles.navLink}>Metrics</a>
      </div>
      <div style={styles.right}>
        {MOCK_MODE && <span style={styles.mockBadge}>Mock data</span>}
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
