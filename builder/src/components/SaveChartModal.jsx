import React, { useState } from 'react';

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#0c0f12', border: '1px solid #1a1e24', borderRadius: 12,
    padding: 24, width: 400,
  },
  title: { fontSize: 16, fontWeight: 600, color: '#edf0f3', marginBottom: 20 },
  label: { fontSize: 12, color: '#8b929b', marginBottom: 6, display: 'block', fontFamily: "'JetBrains Mono', monospace" },
  input: {
    width: '100%', background: '#06080a', border: '1px solid #1a1e24', color: '#edf0f3',
    padding: '10px 12px', borderRadius: 6, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', background: '#06080a', border: '1px solid #1a1e24', color: '#edf0f3',
    padding: '10px 12px', borderRadius: 6, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
  },
  fieldGroup: { marginBottom: 16 },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  cancelBtn: {
    background: '#111518', border: '1px solid #1a1e24', color: '#c8cdd3',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
  },
  saveBtn: {
    background: '#0a1f17', border: '1px solid #34d399', color: '#34d399',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
};

export default function SaveChartModal({ onSave, onClose, dashboards = [], defaultName = '' }) {
  const [name, setName] = useState(defaultName);
  const [dashboardId, setDashboardId] = useState('');
  const [newDashboardName, setNewDashboardName] = useState('');

  const isNewDashboard = dashboardId === '__new__';

  function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    onSave({
      name: trimmedName,
      dashboardId: isNewDashboard ? null : (dashboardId || null),
      newDashboardName: isNewDashboard ? newDashboardName.trim() : null,
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div style={styles.title}>Save Chart</div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Name</label>
          <input
            style={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Chart name"
            autoFocus
          />
        </div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Add to dashboard</label>
          <select
            style={styles.select}
            value={dashboardId}
            onChange={e => setDashboardId(e.target.value)}
          >
            <option value="">None</option>
            {dashboards.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
            <option value="__new__">+ New Dashboard</option>
          </select>
        </div>

        {isNewDashboard && (
          <div style={styles.fieldGroup}>
            <label style={styles.label}>New dashboard name</label>
            <input
              style={styles.input}
              value={newDashboardName}
              onChange={e => setNewDashboardName(e.target.value)}
              placeholder="Dashboard name"
            />
          </div>
        )}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...styles.saveBtn, opacity: name.trim() ? 1 : 0.5 }}
            onClick={handleSave}
            disabled={!name.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
