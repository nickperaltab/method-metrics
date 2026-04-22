import React, { useEffect } from 'react';
import ChatExplorer from './ChatExplorer';

const styles = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    backdropFilter: 'blur(2px)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
  },
  card: {
    width: '100%',
    maxWidth: 1200,
    height: '100%',
    maxHeight: 820,
    background: '#ffffff',
    border: '1px solid #e2e5e9',
    borderRadius: 12,
    boxShadow: '0 20px 60px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.08)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid #e2e5e9',
    background: '#f8f9fa',
    flexShrink: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: 600,
    color: '#1a1a1a',
    fontFamily: "'DM Sans', sans-serif",
  },
  closeBtn: {
    background: 'none',
    border: '1px solid #e2e5e9',
    color: '#6b7280',
    width: 30,
    height: 30,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
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
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={styles.header}>
          <span style={styles.title}>{editChartId ? 'Edit Chart' : 'Build a New Chart'}</span>
          <button style={styles.closeBtn} onClick={onClose} title="Close (Esc)">&#10005;</button>
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
    </div>
  );
}
