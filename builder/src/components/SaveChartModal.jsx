import React, { useState } from 'react';

const styles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 12,
    padding: 24, width: 400,
  },
  title: { fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 20 },
  label: { fontSize: 12, color: '#8b929b', marginBottom: 6, display: 'block', fontFamily: "'JetBrains Mono', monospace" },
  input: {
    width: '100%', background: '#ffffff', border: '1px solid #e2e5e9', color: '#1a1a1a',
    padding: '10px 12px', borderRadius: 6, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box',
  },
  select: {
    width: '100%', background: '#ffffff', border: '1px solid #e2e5e9', color: '#1a1a1a',
    padding: '10px 12px', borderRadius: 6, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
  },
  fieldGroup: { marginBottom: 16 },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 6, lineHeight: 1.5, fontStyle: 'italic' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 },
  cancelBtn: {
    background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
  },
  saveBtn: {
    background: '#ecfdf5', border: '1px solid #059669', color: '#059669',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
};

export default function SaveChartModal({ onSave, onClose, dashboards = [], defaultName = '', editingChart = null, onUpdate }) {
  const [name, setName] = useState(editingChart ? editingChart.name : defaultName);
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
        <div style={styles.title}>{editingChart ? 'Update Chart' : 'Save Chart'}</div>

        <div style={styles.fieldGroup}>
          <label style={styles.label}>Name</label>
          <input
            style={styles.input}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Chart name"
            autoFocus
          />
          <div style={styles.hint}>
            Suggested format: Metric(s) - Time Frame - Dimensions
            <br />
            e.g. "Trials - Last 6 Months - By Vertical"
          </div>
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

        {editingChart && (
          <div style={{ color: '#8b929b', fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>
            This will update the chart on all dashboards that use it.
          </div>
        )}

        <div style={styles.actions}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          {editingChart && (
            <button
              style={styles.saveBtn}
              onClick={() => onUpdate && onUpdate()}
            >
              Update "{editingChart.name}"
            </button>
          )}
          <button
            style={{ ...styles.saveBtn, opacity: name.trim() ? 1 : 0.5 }}
            onClick={handleSave}
            disabled={!name.trim()}
          >
            {editingChart ? 'Save as New' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
