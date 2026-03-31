import React, { useState, useEffect, useRef } from 'react';

/**
 * Dialog — replaces window.confirm and window.prompt with on-brand modals.
 *
 * Usage (confirm):
 *   <Dialog
 *     type="confirm"
 *     title="Delete dashboard?"
 *     message="This cannot be undone."
 *     danger
 *     onConfirm={() => doDelete()}
 *     onCancel={() => setDialog(null)}
 *   />
 *
 * Usage (prompt):
 *   <Dialog
 *     type="prompt"
 *     title="Rename dashboard"
 *     label="Name"
 *     defaultValue={db.name}
 *     onConfirm={name => doRename(name)}
 *     onCancel={() => setDialog(null)}
 *   />
 */
export default function Dialog({ type = 'confirm', title, message, label, defaultValue = '', danger = false, confirmLabel, cancelLabel = 'Cancel', onConfirm, onCancel }) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    if (type === 'prompt' && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [type]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && type === 'prompt') handleConfirm();
    if (e.key === 'Escape') onCancel();
  }

  function handleConfirm() {
    if (type === 'prompt') {
      if (!value.trim()) return;
      onConfirm(value.trim());
    } else {
      onConfirm();
    }
  }

  const resolvedConfirmLabel = confirmLabel || (danger ? 'Delete' : 'OK');

  return (
    <div style={s.overlay} onClick={onCancel} onKeyDown={handleKeyDown}>
      <div style={s.modal} onClick={e => e.stopPropagation()}>
        <div style={s.title}>{title}</div>

        {message && (
          <div style={s.message}>{message}</div>
        )}

        {type === 'prompt' && (
          <div style={s.fieldGroup}>
            {label && <label style={s.label}>{label}</label>}
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onCancel(); }}
              style={s.input}
            />
          </div>
        )}

        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={onCancel}>{cancelLabel}</button>
          <button
            style={danger ? s.dangerBtn : s.confirmBtn}
            onClick={handleConfirm}
            disabled={type === 'prompt' && !value.trim()}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 2000,
  },
  modal: {
    background: '#ffffff', border: '1px solid #e2e5e9', borderRadius: 10,
    padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
  },
  title: { fontSize: 16, fontWeight: 600, color: '#1a1a1a', marginBottom: 8 },
  message: { fontSize: 13, color: '#374151', marginBottom: 20, lineHeight: 1.5 },
  label: { fontSize: 11, color: '#6b7280', marginBottom: 6, display: 'block', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '.05em' },
  fieldGroup: { marginBottom: 20 },
  input: {
    width: '100%', background: '#ffffff', border: '1px solid #e2e5e9', color: '#1a1a1a',
    padding: '10px 12px', borderRadius: 6, fontSize: 14, fontFamily: "'DM Sans', sans-serif",
    outline: 'none', boxSizing: 'border-box',
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: {
    background: '#ffffff', border: '1px solid #e2e5e9', color: '#374151',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
  },
  confirmBtn: {
    background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#059669',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
  dangerBtn: {
    background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
    padding: '8px 20px', borderRadius: 6, cursor: 'pointer',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 600,
  },
};
