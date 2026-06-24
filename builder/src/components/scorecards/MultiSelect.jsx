import { useState, useRef, useEffect } from 'react';

// Compact multi-select: button shows "Label: All" / "Label: N", popover has checkboxes.
export default function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const count = selected.size;
  const toggle = (v) => {
    const next = new Set(selected);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(next);
  };
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-block', marginRight: 10 }}>
      <button onClick={() => setOpen((o) => !o)} style={{
        padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
        border: '1px solid #d1d5db', background: count ? '#ecfdf5' : '#fff', color: '#374151',
      }}>{label}: {count === 0 ? 'All' : count} &#9660;</button>
      {open && (
        <div style={{
          position: 'absolute', zIndex: 20, top: '110%', left: 0, minWidth: 160, maxHeight: 260,
          overflowY: 'auto', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: 6,
        }}>
          {count > 0 && (
            <div onClick={() => onChange(new Set())} style={{ fontSize: 12, color: '#2563eb', cursor: 'pointer', padding: '4px 6px' }}>Clear</div>
          )}
          {options.map((v) => (
            <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, padding: '3px 6px', cursor: 'pointer' }}>
              <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} />
              {v}
            </label>
          ))}
        </div>
      )}
    </span>
  );
}
