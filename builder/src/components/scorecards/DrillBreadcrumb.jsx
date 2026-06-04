// Net SaaS drill breadcrumb — e.g. "Net SaaS › Expansion › Seats".
// `trail` is an array of {level, label}; clicking a crumb emits onNavigate(level)
// so the controller can truncate drill state back to that level. The last crumb
// is the current location and is rendered inactive.

const wrap = { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, fontSize: 13, fontFamily: "'DM Sans', sans-serif", margin: '12px 0' };
const crumb = { background: 'none', border: 'none', padding: '2px 4px', fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: '#2563eb', cursor: 'pointer' };
const crumbActive = { padding: '2px 4px', fontSize: 13, color: '#1a1a1a', fontWeight: 700 };
const sep = { color: '#9ca3af' };

export default function DrillBreadcrumb({ trail, onNavigate }) {
  if (!trail || trail.length === 0) return null;
  return (
    <nav style={wrap} aria-label="Drill breadcrumb">
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1;
        return (
          <span key={`${c.level}-${c.label}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={sep}>›</span>}
            {isLast ? (
              <span style={crumbActive}>{c.label}</span>
            ) : (
              <button type="button" style={crumb} onClick={() => onNavigate?.(c.level)}>
                {c.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
