import React from 'react';
import { Link } from 'react-router-dom';

const styles = {
  page: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 'calc(100vh - 52px)',
    padding: 32,
    gap: 32,
    flexWrap: 'wrap',
  },
  card: {
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 12,
    padding: '40px 36px',
    width: 320,
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    transition: 'border-color 0.15s',
  },
  title: {
    color: '#edf0f3',
    fontSize: 20,
    fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif",
    margin: 0,
  },
  desc: {
    color: '#5a6370',
    fontSize: 14,
    fontFamily: "'DM Sans', sans-serif",
    lineHeight: 1.5,
    margin: 0,
  },
  icon: {
    fontSize: 28,
    marginBottom: 4,
  },
};

export default function Home() {
  return (
    <div style={styles.page}>
      <Link to="/chat" style={styles.card} onMouseEnter={e => e.currentTarget.style.borderColor = '#34d399'} onMouseLeave={e => e.currentTarget.style.borderColor = '#1a1e24'}>
        <div style={styles.icon}>💬</div>
        <p style={styles.title}>Build a Chart</p>
        <p style={styles.desc}>
          Describe the chart you want in plain English. The AI picks the right metrics, queries BigQuery, and renders it live.
        </p>
      </Link>
      <Link to="/dashboards" style={styles.card} onMouseEnter={e => e.currentTarget.style.borderColor = '#34d399'} onMouseLeave={e => e.currentTarget.style.borderColor = '#1a1e24'}>
        <div style={styles.icon}>📊</div>
        <p style={styles.title}>My Dashboards</p>
        <p style={styles.desc}>
          View and manage saved dashboards. Pin your most important charts and share them with the team.
        </p>
      </Link>
    </div>
  );
}
