import React from 'react';
import { NavLink } from 'react-router-dom';


const styles = {
  bar: { padding: '12px 24px', borderBottom: '1px solid #1a1e24', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0c0f12' },
  left: { display: 'flex', alignItems: 'center', gap: 16 },
  logo: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#34d399', background: '#0a1f17', padding: '5px 10px', borderRadius: 4, border: '1px solid #1a3d2e' },
  navLink: { color: '#5a6370', textDecoration: 'none', fontSize: 13, padding: '4px 12px', borderRadius: 4 },
  activeLink: { background: '#0a1f17', color: '#34d399' },
  connected: { color: '#34d399', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
  connectBtn: { background: '#0a1f17', border: '1px solid #34d399', color: '#34d399', padding: '4px 12px', borderRadius: 4, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 },
};

function routerNavStyle({ isActive }) {
  return isActive
    ? { ...styles.navLink, ...styles.activeLink }
    : styles.navLink;
}

export default function TopBar({ connected, userEmail, onConnect }) {
  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <a href="/method-metrics/" style={{ ...styles.logo, textDecoration: 'none' }}>Method</a>
        <NavLink to="/chat" style={routerNavStyle}>Chat</NavLink>
        <NavLink to="/dashboards" style={routerNavStyle}>Dashboards</NavLink>
        <a href="../tracker.html" style={styles.navLink}>Metrics</a>
      </div>
      <div>
        {connected
          ? <span style={styles.connected}>&#9679; BQ Connected{userEmail ? ` (${userEmail})` : ''}</span>
          : <button onClick={onConnect} style={styles.connectBtn}>Connect BigQuery</button>
        }
      </div>
    </div>
  );
}
