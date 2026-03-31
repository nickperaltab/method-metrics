import React from 'react';
import ChatExplorer from './ChatExplorer';

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 2000,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    borderBottom: '1px solid #e2e5e9',
    background: '#f8f9fa',
    flexShrink: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: '#1a1a1a',
    fontFamily: "'DM Sans', sans-serif",
  },
  closeBtn: {
    background: 'none',
    border: '1px solid #e2e5e9',
    color: '#6b7280',
    width: 32,
    height: 32,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
};

export default function ChatModal({ onClose, onChartSaved, metrics, bqConnected, userEmail, userAvatar, editChartId }) {
  return (
    <div style={styles.overlay}>
      <div style={styles.header}>
        <span style={styles.title}>{editChartId ? 'Edit Chart' : 'Build a New Chart'}</span>
        <button style={styles.closeBtn} onClick={onClose} title="Close">&#10005;</button>
      </div>
      <div style={styles.body}>
        <ChatExplorer
          metrics={metrics}
          bqConnected={bqConnected}
          userEmail={userEmail}
          userAvatar={userAvatar}
          modalMode
          onChartSaved={onChartSaved}
          editChartId={editChartId}
        />
      </div>
    </div>
  );
}
