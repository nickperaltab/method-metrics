import React, { useState, useRef, useEffect } from 'react';

/**
 * Simple overflow menu: a ••• button that opens a dropdown.
 * items = [{ label, onClick, danger? }]
 */
export default function OverflowMenu({ items, label = '•••', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        aria-label="More actions"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#6b7280', fontSize: 16, padding: '4px 8px',
          lineHeight: 1, borderRadius: 4,
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        {label}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            [align]: 0,
            background: '#ffffff',
            border: '1px solid #e2e5e9',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            minWidth: 140,
            zIndex: 100,
            padding: 4,
          }}
          onClick={e => e.stopPropagation()}
        >
          {items.map((item, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(e); }}
              disabled={item.disabled}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'none', border: 'none',
                padding: '8px 12px', borderRadius: 4,
                fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                color: item.disabled ? '#d1d5db' : (item.danger ? '#dc2626' : '#374151'),
                cursor: item.disabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={e => !item.disabled && (e.currentTarget.style.background = item.danger ? '#fef2f2' : '#f8f9fa')}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
