// Escalation flags, rendered two ways from the same ranked list (see
// escalationFlags / accountFlagSummary in lib/customer.js):
//
//   <FlagBadges>  compact chips for a list row — worst first, capped
//   <FlagPanel>   the full list with dates, evidence and which source raised it
//
// Severity drives colour so the eye finds the critical ones without reading, and
// the cap on the badges exists so one noisy account can't push a whole list row
// off the screen.

import { s } from '../projects/ui';

const SEVERITY_STYLE = {
  critical: { color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', fontWeight: 700 },
  warn: { color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', fontWeight: 600 },
  info: { color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', fontWeight: 600 },
};

const styles = {
  badge: {
    display: 'inline-block', fontSize: 11, borderRadius: 4, padding: '2px 8px',
    marginRight: 6, marginBottom: 4, whiteSpace: 'nowrap',
  },
  row: { display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #f0f1f3' },
  marker: { width: 6, borderRadius: 3, flexShrink: 0 },
  body: { flex: 1, minWidth: 0 },
  head: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  label: { fontSize: 14, fontWeight: 600, color: '#1a1a1a' },
  meta: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280' },
  detail: { fontSize: 13, color: '#374151', lineHeight: 1.5, marginTop: 4 },
  clean: {
    fontSize: 13, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0',
    borderRadius: 8, padding: '10px 14px', lineHeight: 1.45,
  },
};

// These now colour the severity *word* as well as the marker bar, so `info` has to
// clear AA as text — not just 3:1 as a graphic.
const MARKER_COLOUR = { critical: '#b91c1c', warn: '#b45309', info: '#6b7280' };

export function FlagBadges({ flags, max = 3 }) {
  if (!flags.length) return <span style={s.muted}>—</span>;
  const shown = flags.slice(0, max);
  const hidden = flags.length - shown.length;
  return (
    <span>
      {shown.map((f) => (
        <span key={f.code + (f.label ?? '')} style={{ ...styles.badge, ...SEVERITY_STYLE[f.severity] }}>
          {f.label}
        </span>
      ))}
      {hidden > 0 && <span style={s.monoSmall}>+{hidden}</span>}
    </span>
  );
}

export function FlagPanel({ flags, cleanMessage }) {
  if (!flags.length) {
    return <div style={styles.clean}>{cleanMessage ?? 'Nothing flagged on this customer.'}</div>;
  }
  return (
    <div>
      {flags.map((f) => (
        <div key={f.code + (f.label ?? '') + (f.date ?? '')} style={styles.row}>
          <div style={{ ...styles.marker, background: MARKER_COLOUR[f.severity] }} />
          <div style={styles.body}>
            <div style={styles.head}>
              <span style={styles.label}>{f.label}</span>
              {/* The severity was previously carried only by the 6px colour bar, so
                  "3 critical" in the header had nothing to point at. */}
              <span style={{ ...styles.meta, color: MARKER_COLOUR[f.severity], fontWeight: 700 }}>
                {f.severity}
              </span>
              {f.date && <span style={styles.meta}>{f.date}</span>}
              {f.source && <span style={styles.meta}>· {f.source}</span>}
            </div>
            {f.detail && <div style={styles.detail}>{f.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * "3d ago by B. Saltzman · work log". The actor is the whole point, so it reads
 * as one line rather than a date with a tooltip.
 */
export function LastActivity({ activity, actorLabel, todayIso, style }) {
  if (!activity?.date) return <span style={s.muted}>no activity on record</span>;
  const days = Math.floor((Date.parse(todayIso) - Date.parse(activity.date)) / 86400000);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days}d ago`;
  const who = actorLabel(activity);
  return (
    <span style={style}>
      {when}
      {who ? ` by ${who}` : ''}
      <span style={s.monoSmall}> · {activity.source}</span>
    </span>
  );
}
