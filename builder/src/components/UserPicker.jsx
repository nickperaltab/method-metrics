import React from 'react';
import { useUser } from '../contexts/UserContext';

export default function UserPicker() {
  const { users, selectUser, showPicker } = useUser();

  if (!showPicker) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.logo}>Method</div>
        <h2 style={styles.title}>Who are you?</h2>
        <p style={styles.subtitle}>Pick your name to get started.</p>
        <div style={styles.userList}>
          {users.map(user => (
            <button
              key={user.id}
              style={styles.userButton}
              onClick={() => selectUser(user)}
              onMouseEnter={e => {
                e.target.style.borderColor = '#34d399';
                e.target.style.background = '#0a1210';
              }}
              onMouseLeave={e => {
                e.target.style.borderColor = '#1a1e24';
                e.target.style.background = '#0c0f12';
              }}
            >
              <span style={styles.userName}>{user.name}</span>
              <span style={styles.userRole}>{user.role}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(6, 8, 10, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    fontFamily: "'DM Sans', sans-serif",
  },
  modal: {
    textAlign: 'center',
    maxWidth: 400,
    padding: '48px 32px',
  },
  logo: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.12em',
    textTransform: 'uppercase',
    color: '#34d399',
    background: '#0a1f17',
    padding: '6px 14px',
    borderRadius: 4,
    border: '1px solid #1a3d2e',
    display: 'inline-block',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    color: '#edf0f3',
    margin: '0 0 8px',
  },
  subtitle: {
    color: '#5a6370',
    fontSize: 14,
    margin: '0 0 32px',
  },
  userList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  userButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    background: '#0c0f12',
    border: '1px solid #1a1e24',
    borderRadius: 8,
    color: '#edf0f3',
    cursor: 'pointer',
    transition: 'all .15s',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 15,
  },
  userName: {
    fontWeight: 600,
  },
  userRole: {
    fontSize: 12,
    color: '#5a6370',
    textTransform: 'capitalize',
  },
};
