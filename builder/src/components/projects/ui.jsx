// Shared look-and-feel for the project tracker screens.
//
// The rest of this app styles inline with a local `s` object per file; once the
// tracker grew past two files that meant the same table and chip styles drifted
// between them. These are the same tokens, in one place, so the board, the
// detail page and the forms stay visually identical.

import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { daysUntil } from '../../lib/projects';
import { formatRatio, ratingTone } from '../../lib/efficiency';

/**
 * Inline styles can't express pseudo-classes, so focus rings and row hover live in
 * a real stylesheet. Render <TrackerStyles/> once per screen.
 *
 * Before this existed there was no :focus-visible anywhere in builder/ — keyboard
 * users got only the browser default on native controls and nothing at all on the
 * chips, so this is the vehicle for that fix.
 */
export const TRACKER_CSS = `
.tk-focus:focus-visible,
.tk-row:focus-visible {
  outline: 2px solid #047857;
  outline-offset: 2px;
  border-radius: 2px;
}
.tk-row:hover { background: #fafbfc; }
.tk-cellLink { color: #047857; text-decoration: underline; text-underline-offset: 2px; }
.tk-cellLink:hover { text-decoration-thickness: 2px; }
`;

export function TrackerStyles() {
  return <style>{TRACKER_CSS}</style>;
}

export const s = {
  wrap: { maxWidth: 1180, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  wrapNarrow: { maxWidth: 780, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a1a' },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 24, maxWidth: 760, lineHeight: 1.5 },
  mono: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#6b7280' },
  monoSmall: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280' },
  // Underlined on purpose: colour alone can't carry "this is a link" (WCAG 1.4.1),
  // and these sit next to body text of the same size and weight.
  back: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#047857', textDecoration: 'underline', textUnderlineOffset: 2 },
  link: { fontSize: 12, color: '#047857', textDecoration: 'underline', textUnderlineOffset: 2, fontFamily: "'JetBrains Mono', monospace" },

  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 },
  stat: { border: '1px solid #e2e5e9', borderRadius: 8, padding: '14px 16px', background: '#fff' },
  statLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6,
  },
  statValue: { fontSize: 22, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.1 },
  statValueAlert: { fontSize: 22, fontWeight: 700, color: '#b45309', lineHeight: 1.1 },
  statSub: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280', marginTop: 4 },

  section: { marginBottom: 36 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 700, color: '#1a1a1a' },

  controls: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 },
  spacer: { flex: 1 },
  chip: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: '5px 10px',
    borderRadius: 4, border: '1px solid #e2e5e9', background: '#fff', color: '#6b7280', cursor: 'pointer',
  },
  chipOn: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: '5px 10px',
    borderRadius: 4, border: '1px solid #047857', background: '#ecfdf5', color: '#047857',
    cursor: 'pointer', fontWeight: 700,
  },
  primary: {
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: '8px 16px',
    borderRadius: 6, border: 'none', background: '#047857', color: '#fff', cursor: 'pointer',
  },
  secondary: {
    fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, padding: '8px 16px',
    borderRadius: 6, border: '1px solid #e2e5e9', background: '#fff', color: '#374151', cursor: 'pointer',
  },
  danger: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: '4px 8px',
    borderRadius: 4, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', cursor: 'pointer',
  },
  select: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: '5px 8px',
    borderRadius: 4, border: '1px solid #e2e5e9', background: '#fff', color: '#374151',
  },

  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280',
    fontFamily: "'JetBrains Mono', monospace", borderBottom: '1px solid #e2e5e9',
  },
  thNum: { textAlign: 'right' },
  td: { padding: '12px', borderBottom: '1px solid #f0f1f3', color: '#1a1a1a', verticalAlign: 'top' },
  tdNum: { textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 13 },
  tdMuted: { padding: '12px', borderBottom: '1px solid #f0f1f3', color: '#6b7280', verticalAlign: 'top' },
  rowClickable: { cursor: 'pointer' },

  bar: { height: 4, background: '#f0f1f3', borderRadius: 2, marginTop: 6, width: 96 },
  barFill: { height: 4, background: '#047857', borderRadius: 2 },
  barFillWarn: { height: 4, background: '#b45309', borderRadius: 2 },

  card: { border: '1px solid #e2e5e9', borderRadius: 8, padding: '14px 16px', background: '#fff' },
  cardList: { display: 'grid', gap: 8 },

  field: { marginBottom: 16 },
  label: {
    display: 'block', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
    letterSpacing: '.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6,
  },
  input: {
    width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", border: '1px solid #e2e5e9', borderRadius: 6, color: '#1a1a1a',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6,
    border: '1px solid #e2e5e9', borderRadius: 6, color: '#1a1a1a', minHeight: 260, resize: 'vertical',
  },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 6, lineHeight: 1.45 },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  row3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
  checkRow: { display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16 },

  muted: { color: '#6b7280' },
  due: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280', marginTop: 3 },
  dueLate: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#b91c1c', fontWeight: 700, marginTop: 3 },
  empty: {
    fontSize: 13, color: '#6b7280', padding: '20px 16px', textAlign: 'center',
    border: '1px dashed #e2e5e9', borderRadius: 8, background: '#fafbfc',
  },
  note: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
  banner: {
    fontSize: 13, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a',
    borderRadius: 8, padding: '10px 14px', marginBottom: 24, lineHeight: 1.45,
  },
};

const TAG_BASE = {
  display: 'inline-block', fontSize: 11, fontWeight: 600, borderRadius: 4,
  padding: '2px 8px', marginRight: 6, whiteSpace: 'nowrap',
};

export const tone = {
  // #6b7280 on the #f3f4f6 wash is 4.39:1 — just under AA at 11px, so the
  // neutral tag darkens further than the plain-white-background tokens do.
  neutral: { ...TAG_BASE, color: '#4b5563', background: '#f3f4f6', border: '1px solid #e5e7eb' },
  good: { ...TAG_BASE, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0' },
  warn: { ...TAG_BASE, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a' },
  bad: { ...TAG_BASE, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', fontWeight: 700 },
};

// One chip style per project status, so "blocked" reads differently from "on
// track" at a glance rather than needing the word to be read.
const STATUS_TONE = {
  Blocked: 'bad',
  'At risk': 'warn',
  'On track': 'good',
  'On hold': 'neutral',
  Complete: 'neutral',
};

export function StatusChip({ status }) {
  return <span style={tone[STATUS_TONE[status] ?? 'neutral']}>{status ?? '—'}</span>;
}

export function Tag({ children, kind = 'neutral' }) {
  return <span style={tone[kind]}>{children}</span>;
}

/** A rating as a coloured percentage, with the raw parts alongside it. */
export function RatingChip({ ratio, detail }) {
  return (
    <span>
      <span style={tone[ratingTone(ratio)]}>{formatRatio(ratio)}</span>
      {detail && <span style={s.monoSmall}>{detail}</span>}
    </span>
  );
}

export function Stat({ label, value, sub, alert }) {
  return (
    <div style={s.stat}>
      <div style={s.statLabel}>{label}</div>
      <div style={alert ? s.statValueAlert : s.statValue}>{value}</div>
      {sub && <div style={s.statSub}>{sub}</div>}
    </div>
  );
}

export function Meta({ label, value, sub, subLate }) {
  return (
    <div style={s.card}>
      <div style={s.statLabel}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a' }}>{value}</div>
      {sub && <div style={subLate ? s.dueLate : s.due}>{sub}</div>}
    </div>
  );
}

/**
 * A labelled form field. One implementation for every form in the tracker.
 *
 * This used to be copied into each form and rendered the <label> as a plain sibling
 * with no `htmlFor`, so all 36 controls were announced as "edit text, blank". The id
 * comes from useId() and is cloned onto the child, which means no call site has to
 * pass one — and the hint is wired up with aria-describedby so it's actually read
 * out with the field it explains.
 *
 * The child must be a single form control. Wrap anything more complex outside Field.
 */
export function Field({ label, hint, required, children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
      id,
      'aria-describedby': hintId,
      required: required || undefined,
      'aria-required': required ? 'true' : undefined,
    })
    : children;

  return (
    <div style={s.field}>
      <label style={s.label} htmlFor={id}>
        {label}{required ? <span style={{ color: '#b91c1c' }} aria-hidden="true"> *</span> : null}
      </label>
      {control}
      {hint && <div style={s.hint} id={hintId}>{hint}</div>}
    </div>
  );
}

/** Sits above the first field of a form that has required fields. */
export function RequiredLegend() {
  return <div style={{ ...s.hint, marginBottom: 16 }}><span style={{ color: '#b91c1c' }}>*</span> Required</div>;
}

/**
 * Validation summary. `role="alert"` so it's announced, and focused on appearance —
 * on the long project form the message can otherwise render below the fold from the
 * field it refers to.
 */
export function FormError({ children }) {
  const ref = useRef(null);
  useEffect(() => { if (children) ref.current?.focus(); }, [children]);
  if (!children) return null;
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      style={{ ...s.banner, color: '#b91c1c', background: '#fef2f2', borderColor: '#fecaca' }}
    >
      {children}
    </div>
  );
}

export function SectionHead({ title, aside }) {
  return (
    <div style={s.sectionHead}>
      <h2 style={s.sectionTitle}>{title}</h2>
      {typeof aside === 'string' ? <span style={s.mono}>{aside}</span> : aside}
    </div>
  );
}

export function Bar({ fraction, warn }) {
  return (
    <div style={s.bar}>
      <div style={{
        ...(warn ? s.barFillWarn : s.barFill),
        width: `${Math.max(0, Math.min(100, Math.round((fraction ?? 0) * 100)))}%`,
      }} />
    </div>
  );
}

/** "in 4d" / "3d late" / "today" — a bare date makes the reader do the maths. */
export function formatDue(dueIso, todayIso) {
  const days = daysUntil(dueIso, todayIso);
  if (days == null) return { text: 'no date', late: false };
  if (days === 0) return { text: 'today', late: false };
  if (days < 0) return { text: `${Math.abs(days)}d late`, late: true };
  return { text: `in ${days}d`, late: false };
}
