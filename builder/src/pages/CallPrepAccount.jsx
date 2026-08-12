// Call Prep — account brief. Route: #/call-prep/account/:recordId
//
// This screen is the on-screen twin of the /call-prep skill's Google Doc
// (method-ps-skills/commands/call-prep.md). Section order and naming follow that
// template so a consultant reading the doc and the screen sees the same brief:
//
//   header identity → Top 3 points → Why today → Opportunity fit →
//   DEP signals → Time tracking → Cases → Recent activities   (main column)
//   Business context → Snapshot → Revenue & licenses          (rail)
//   Details                                                   (full width)
//
// Template sections with no column behind them are omitted rather than stubbed:
// Discovery Questions (generated per call, never persisted), recurring TT
// topics, the calendar note, and the app-routine and payments health flags are
// not in BigQuery today. The prose sections come from call_prep.brief_content,
// which only covers 24 preps and stopped being written on 2026-07-16 —
// everything degrades to "not recorded" without it.
//
// Width and zoom are user-controlled and persisted: the brief is read on a wide
// monitor during a call and on a laptop before one, and a fixed measure serves
// neither well.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  fetchAccountSnapshots, fetchAccountSessions, fetchAccountCases, fetchAccountOverview,
  fetchAccountOpportunityFit, fetchAccountActivities, latestFitByMotion, computeFlags,
  MOTION_LABELS, ACTIVITY_LIMIT,
} from '../lib/callPrep';

const PAPER = '#faf8f3';
const SHEET = '#fffdf8';
const INK = '#1c1a15';
const MUTE = '#5a5546';   // 7.3:1 on the sheet. Labels, meta, secondary values.
const HAIR = '#8c8677';   // decorative only: rules, neutral dots
const RULE = '#e6e1d5';
const ACCENT = '#1b5e43';
const AMBER = '#a85a1a';

// Reading widths. "Full" tracks the viewport; the other two are fixed measures.
const WIDTHS = [
  { key: 'narrow', label: 'Narrow', max: 880 },
  { key: 'wide', label: 'Wide', max: 1320 },
  { key: 'full', label: 'Full', max: null },
];
const ZOOM_MIN = 80;
const ZOOM_MAX = 150;
const ZOOM_STEP = 10;
const TOOLBAR_H = 46;
const NAV_H = 44;          // the jump-nav strip, measured at 100% zoom
const VISIBLE_SESSIONS = 6;

const WIDTH_KEY = 'callPrep.width';
const ZOOM_KEY = 'callPrep.zoom';
const COLLAPSED_KEY = 'callPrep.collapsed';

const s = {
  stage: { background: PAPER, minHeight: '100%', fontFamily: "'DM Sans', sans-serif", paddingBottom: 72 },

  toolbar: {
    position: 'sticky', top: 0, zIndex: 20, height: TOOLBAR_H, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
    padding: '0 22px', background: 'rgba(250,248,243,.94)', backdropFilter: 'blur(6px)',
    borderBottom: `1px solid ${RULE}`,
  },
  toolbarGroup: { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 },
  crumb: {
    fontSize: 12.5, color: ACCENT, fontWeight: 500, background: 'none', border: 'none',
    padding: 0, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
  },
  controlLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
    letterSpacing: '.14em', textTransform: 'uppercase', color: MUTE,
  },
  segment: { display: 'flex', border: `1px solid ${RULE}`, borderRadius: 5, overflow: 'hidden', background: SHEET },
  segmentBtn: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, padding: '4px 10px',
    border: 'none', borderLeft: `1px solid ${RULE}`, background: 'transparent',
    color: MUTE, cursor: 'pointer',
  },
  segmentOn: { background: '#e8f0ea', color: ACCENT, fontWeight: 600 },
  stepBtn: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: 1, width: 24, height: 24,
    border: `1px solid ${RULE}`, borderRadius: 4, background: SHEET, color: INK, cursor: 'pointer',
  },
  zoomValue: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK,
    minWidth: 38, textAlign: 'center',
  },
  select: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, padding: '4px 8px',
    borderRadius: 4, border: `1px solid ${RULE}`, background: SHEET, color: INK, cursor: 'pointer',
  },

  shellOuter: { padding: '26px 22px 0' },
  sheet: {
    margin: '0 auto', background: SHEET, border: `1px solid ${RULE}`, borderTop: `3px solid ${ACCENT}`,
    borderRadius: 3, padding: '30px 38px 40px',
    boxShadow: '0 1px 2px rgba(28,26,21,.04), 0 12px 34px -18px rgba(28,26,21,.22)',
  },

  kicker: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600,
    letterSpacing: '.22em', textTransform: 'uppercase', color: ACCENT, marginBottom: 12,
  },
  title: {
    fontFamily: "'Fraunces', serif", fontOpticalSizing: 'auto', fontWeight: 600,
    fontSize: 42, lineHeight: 1.04, letterSpacing: '-.01em', color: INK, margin: '0 0 12px',
  },
  when: { fontSize: 14.5, color: INK, fontWeight: 500, marginBottom: 18 },

  identity: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px 26px',
    padding: '16px 0', borderTop: `1px solid ${RULE}`, borderBottom: `1px solid ${RULE}`,
  },
  alertRow: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  alert: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, letterSpacing: '.02em',
    color: AMBER, background: '#fbf1e4', border: '1px solid #edd6b8', borderRadius: 3, padding: '4px 9px',
  },

  nav: {
    position: 'sticky', zIndex: 10, display: 'flex', gap: 6, flexWrap: 'wrap',
    margin: '22px 0 6px', padding: '10px 0', background: SHEET, borderBottom: `1px solid ${RULE}`,
  },
  navChip: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, letterSpacing: '.06em',
    textTransform: 'uppercase', color: MUTE, background: PAPER, border: `1px solid ${RULE}`,
    borderRadius: 999, padding: '5px 13px', cursor: 'pointer',
  },
  navChipOn: { background: '#e8f0ea', color: ACCENT, borderColor: ACCENT },

  section: { paddingTop: 38 },

  // Section headers. These used to be 10.5px grey mono — set smaller and lighter
  // than the body text they introduced, which is why the page read as one flat
  // grey column. They are now part of the document's voice (Fraunces, ink) and
  // mono is reserved for data labels, which gives each face one job.
  sectionMark: { width: 26, height: 3, background: ACCENT, borderRadius: 2, marginBottom: 13 },
  sectionH: { margin: '0 0 16px' },
  sectionBtn: {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%',
    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
    textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
  },
  sectionTitle: {
    fontFamily: "'Fraunces', serif", fontOpticalSizing: 'auto',
    fontSize: 25, fontWeight: 600, letterSpacing: '-.005em',
    color: INK, lineHeight: 1.15, flex: 1, minWidth: 0,
  },
  // A collapsed section still has to say what's inside it.
  sectionCount: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, fontWeight: 600,
    color: MUTE, background: PAPER, border: `1px solid ${RULE}`,
    borderRadius: 999, padding: '2px 10px', flexShrink: 0,
  },
  sectionCaret: { fontSize: 13, color: MUTE, flexShrink: 0, transition: 'transform .15s' },

  // Retained for the rail cards, where a small mono label is the right register.
  bodyLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
    letterSpacing: '.16em', textTransform: 'uppercase', color: MUTE, margin: '0 0 14px',
  },
  caret: {
    fontSize: 10, color: MUTE, display: 'inline-block', width: 10,
    transition: 'transform .15s',
  },
  caretOpen: { transform: 'rotate(90deg)' },
  empty: { fontSize: 14, color: MUTE, fontStyle: 'italic', margin: 0 },

  // Top 3
  points: { listStyle: 'none', margin: 0, padding: 0 },
  point: {
    position: 'relative', paddingLeft: 38, marginBottom: 16,
    fontSize: 16, lineHeight: 1.6, color: '#2c2921',
  },
  pointNum: {
    position: 'absolute', left: 0, top: 1, width: 24, height: 24, borderRadius: '50%',
    background: '#e8f0ea', color: ACCENT, fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  prose: { fontSize: 15.5, lineHeight: 1.62, color: '#2c2921', margin: '0 0 10px' },

  // DEP signals
  brief: { listStyle: 'none', margin: 0, padding: 0 },
  briefItem: { position: 'relative', paddingLeft: 24, marginBottom: 13, fontSize: 15, lineHeight: 1.6, color: '#2c2921' },
  briefMark: { position: 'absolute', left: 2, top: 9, width: 7, height: 7, borderRadius: '50%', background: ACCENT, opacity: .85 },

  // Stat strip
  stats: { display: 'flex', flexWrap: 'wrap', gap: '0 34px', marginBottom: 22 },
  statValue: { fontSize: 22, fontWeight: 600, color: INK, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 },

  // Timeline
  rail: { position: 'relative', margin: 0, padding: 0, listStyle: 'none' },
  railLine: { position: 'absolute', left: 7, top: 6, bottom: 6, width: 2, background: RULE },
  event: { position: 'relative', paddingLeft: 34, marginBottom: 18 },
  dot: { position: 'absolute', left: 2, top: 4, width: 13, height: 13, borderRadius: '50%', border: `2px solid ${SHEET}`, boxSizing: 'border-box' },
  eventHead: {
    display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap',
    background: 'none', border: 'none', padding: 0, textAlign: 'left', width: '100%',
    fontFamily: "'DM Sans', sans-serif",
  },
  eventDate: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: INK, fontWeight: 600 },
  typeBadge: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, letterSpacing: '.05em',
    textTransform: 'uppercase', borderRadius: 3, padding: '2px 7px',
  },
  eventMeta: { fontSize: 12, color: MUTE },
  eventNotes: {
    marginTop: 8, fontSize: 13.5, lineHeight: 1.55, color: '#3a362d', whiteSpace: 'pre-wrap',
    background: PAPER, border: `1px solid ${RULE}`, borderRadius: 4, padding: '10px 13px',
  },
  moreBtn: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, letterSpacing: '.04em',
    color: ACCENT, background: PAPER, border: `1px solid ${RULE}`, borderRadius: 4,
    padding: '6px 12px', cursor: 'pointer', marginTop: 4,
  },

  // Opportunity fit
  fitTable: { width: '100%', borderCollapse: 'collapse' },
  fitTh: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
    letterSpacing: '.1em', textTransform: 'uppercase', color: MUTE, textAlign: 'left',
    padding: '0 12px 8px 0', borderBottom: `1px solid ${RULE}`,
  },
  fitTd: { padding: '12px 12px 12px 0', borderBottom: `1px solid ${RULE}`, verticalAlign: 'top' },
  fitMotion: { fontSize: 14, fontWeight: 600, color: INK, whiteSpace: 'nowrap' },
  fitBadge: {
    display: 'inline-block', fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
    fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase',
    borderRadius: 3, padding: '3px 8px',
  },
  fitRationale: { fontSize: 13.5, lineHeight: 1.55, color: '#3a362d' },
  fitSignals: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  fitSignal: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: MUTE,
    background: PAPER, border: `1px solid ${RULE}`, borderRadius: 3, padding: '2px 7px',
  },
  caveat: {
    marginTop: 14, fontSize: 12.5, lineHeight: 1.5, color: AMBER,
    background: '#fbf1e4', border: '1px solid #edd6b8', borderRadius: 4, padding: '10px 13px',
  },
  caveatLabel: { fontWeight: 700 },

  // Cases
  caseRow: { padding: '12px 0', borderBottom: `1px solid ${RULE}` },
  caseTop: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  caseSubject: { fontSize: 14.5, fontWeight: 600, color: INK },
  caseBadge: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, fontWeight: 600, letterSpacing: '.05em',
    textTransform: 'uppercase', borderRadius: 3, padding: '2px 7px',
  },
  caseMeta: { fontSize: 12, color: MUTE, marginTop: 3 },

  // Rail cards
  card: { background: PAPER, border: `1px solid ${RULE}`, borderRadius: 4, padding: '16px 18px', marginBottom: 16 },
  cardRow: { display: 'flex', justifyContent: 'space-between', gap: 14, padding: '7px 0', borderTop: `1px solid ${RULE}` },
  cardRowFirst: { borderTop: 'none', paddingTop: 0 },
  cardKey: { fontSize: 12.5, color: MUTE, flexShrink: 0 },
  cardVal: { fontSize: 13.5, color: INK, fontWeight: 500, textAlign: 'right', lineHeight: 1.35 },

  // Details grid
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '16px 22px' },
  dLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
    letterSpacing: '.1em', textTransform: 'uppercase', color: MUTE, marginBottom: 4,
  },
  dValue: { fontSize: 14.5, fontWeight: 500, color: INK, lineHeight: 1.35 },
  dValueWarn: { color: AMBER },

  footer: {
    marginTop: 34, paddingTop: 16, borderTop: `1px solid ${RULE}`,
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8,
  },
  footerMeta: { fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: MUTE, letterSpacing: '.03em' },
  sourceLink: { fontSize: 12, color: ACCENT, borderBottom: `1px solid ${ACCENT}` },
  capNote: { fontSize: 12, color: MUTE, marginTop: 12 },
  center: { maxWidth: 720, margin: '0 auto', padding: '60px 24px', textAlign: 'center', color: MUTE, fontSize: 14 },
  errorTxt: { color: '#b91c1c' },
  loadNote: { fontSize: 13, color: MUTE, fontStyle: 'italic', margin: 0 },
};

const CSS = `
@keyframes cpRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.cp-rise { animation: cpRise .5s cubic-bezier(.2,.7,.2,1) both; }
.cp-crumb:hover, .cp-source:hover { text-decoration: underline; }
.cp-chip:hover { border-color: ${ACCENT}; color: ${ACCENT}; }
.cp-sec:hover .cp-sec-title { color: ${ACCENT}; }
.cp-sec-title { transition: color .15s; }
.cp-event-head:hover .cp-date { color: ${ACCENT}; }
.cp-seg-btn:first-child { border-left: none; }
.cp-seg-btn:hover { color: ${ACCENT}; }
.cp-step:hover:enabled { border-color: ${ACCENT}; color: ${ACCENT}; }
.cp-step:disabled { opacity: .4; cursor: default; }
.cp-cols { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 0 40px; align-items: start; }
.cp-rail { position: relative; }
@media (max-width: 1080px) {
  .cp-cols { grid-template-columns: minmax(0, 1fr); }
  .cp-toolbar-wrap { flex-wrap: wrap; }
}
button:focus-visible, select:focus-visible, a:focus-visible {
  outline: 2px solid ${ACCENT}; outline-offset: 2px;
}
.cp-sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
@media (prefers-reduced-motion: reduce) {
  .cp-rise { animation: none; }
  .cp-caret { transition: none; }
  * { scroll-behavior: auto !important; }
}
`;

// Section order for the jump nav and the scroll spy. One list so a section can
// never be in the nav but missing from the highlight, or the reverse.
const SECTIONS = [
  { id: 'top3', label: 'Top 3' },
  { id: 'why', label: 'Why today' },
  { id: 'fit', label: 'Opportunity fit' },
  { id: 'signals', label: 'Signals' },
  { id: 'sessions', label: 'Time tracking' },
  { id: 'cases', label: 'Cases' },
  { id: 'activities', label: 'Activities' },
  { id: 'details', label: 'Details' },
];

// Fit values arrive lowercase from BigQuery. "none" needs words, not the raw
// enum, or it reads as a missing value rather than an assessment.
const FIT_LABELS = {
  strong: 'Strong', moderate: 'Moderate', current: 'Current', none: 'No fit',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "2026-08-10" → "Aug 10, 2026". Parsed as local, so the date never slips a day. */
function fmtDate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function fmtWeekday(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return DAYS[new Date(y, m - 1, d).getDay()];
}

/** scheduled_time is a BQ TIMESTAMP; show it in the reader's own timezone. */
function fmtTime(ts) {
  if (!ts) return null;
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Fit vocabulary from call_prep.opportunity_fit. "current" means the account is
// already on that motion, so it reads neutral rather than as an opportunity.
const FIT_STYLE = {
  strong: { background: '#e8f0ea', color: ACCENT },
  moderate: { background: '#fbf1e4', color: AMBER },
  current: { background: '#eef2ff', color: '#3730a3' },
  none: { background: '#f1efe8', color: MUTE },
};

function ageLabel(months) {
  if (months == null) return null;
  const m = Math.round(months);
  // A four-week-old account reads as "0-month customer" in months. Under two
  // months, weeks are the unit that carries the meaning.
  if (months < 2) {
    const weeks = Math.max(1, Math.round(months * 4.345));
    return `~${weeks} week${weeks === 1 ? '' : 's'}`;
  }
  if (m < 12) return `${m}-month customer`;
  const y = Math.floor(m / 12);
  const rem = m % 12;
  return rem ? `${y}yr ${rem}mo customer` : `${y}-year customer`;
}

// Session Notes start with a weekday-date header and a ==== rule — strip those
// so the expanded note reads as the actual content.
function cleanNotes(notes) {
  if (!notes) return '';
  return notes
    .split('\n')
    .filter((ln) => !/^=+$/.test(ln.trim()) && !/^[A-Za-z]+day,\s/.test(ln.trim()))
    .join('\n')
    .trim();
}

function sessionKind(sess) {
  if (sess.isDemo) return { label: 'Demo', bg: '#eef2ff', fg: '#3730a3', dot: '#4f46e5' };
  const t = (sess.supportType || '').toLowerCase();
  if (t === 'free') return { label: 'Free hour', bg: '#ecfdf3', fg: ACCENT, dot: ACCENT };
  if (t.includes('pay')) return { label: 'Pay-per-use', bg: '#fbf1e4', fg: AMBER, dot: AMBER };
  return { label: sess.supportType || 'Session', bg: '#f1efe8', fg: MUTE, dot: HAIR };
}

/** A UI preference that survives a reload. Storage can throw in private mode. */
function usePersisted(key, fallback, parse) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : parse(raw);
    } catch { return fallback; }
  });
  const store = useCallback((next) => {
    setValue(next);
    try { localStorage.setItem(key, String(next)); } catch { /* preference is best-effort */ }
  }, [key]);
  return [value, store];
}

const Detail = ({ label, value, warn }) => (
  <div>
    <div style={s.dLabel}>{label}</div>
    <div style={{ ...s.dValue, ...(warn ? s.dValueWarn : null) }}>{value ?? '—'}</div>
  </div>
);

const Stat = ({ label, value }) => (
  <div>
    <div style={s.dLabel}>{label}</div>
    <div style={s.statValue}>{value ?? '—'}</div>
  </div>
);

const Row = ({ label, value, first, warn }) => (
  <div style={{ ...s.cardRow, ...(first ? s.cardRowFirst : null) }}>
    <span style={s.cardKey}>{label}</span>
    <span style={{ ...s.cardVal, ...(warn ? s.dValueWarn : null) }}>{value ?? '—'}</span>
  </div>
);

/**
 * One brief section. The header is the disclosure control, carries the section's
 * count so a collapsed section still reports what it holds, and is a real <h2>
 * so the document can be navigated by heading.
 */
const Section = ({ id, title, count, open, onToggle, style, children }) => (
  <section id={id} style={style}>
    <div style={s.sectionMark} aria-hidden="true" />
    <h2 style={s.sectionH}>
      <button
        type="button"
        className="cp-sec"
        style={s.sectionBtn}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="cp-sec-title" style={s.sectionTitle}>{title}</span>
        {count != null && <span style={s.sectionCount}>{count}</span>}
        <span
          className="cp-caret"
          aria-hidden="true"
          style={{ ...s.sectionCaret, ...(open ? s.caretOpen : null) }}
        >
          ▸
        </span>
      </button>
    </h2>
    {open ? children : null}
  </section>
);

const Card = ({ title, children }) => (
  <section style={s.card}>
    <h2 style={{ ...s.bodyLabel, marginBottom: 10 }}>{title}</h2>
    {children}
  </section>
);

export default function CallPrepAccount() {
  const { recordId } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState(null);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [sessionsErr, setSessionsErr] = useState('');
  const [openEvent, setOpenEvent] = useState(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [cases, setCases] = useState(null);
  const [casesErr, setCasesErr] = useState('');
  const [overview, setOverview] = useState(null);
  const [fit, setFit] = useState(null);
  const [fitErr, setFitErr] = useState('');
  const [activities, setActivities] = useState(null);
  const [activitiesErr, setActivitiesErr] = useState('');
  const [openActivity, setOpenActivity] = useState(null);
  const sheetRef = useRef(null);

  const [widthKey, setWidthKey] = usePersisted(WIDTH_KEY, 'wide', (v) => v);
  const [zoom, setZoom] = usePersisted(ZOOM_KEY, 100, (v) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n)) : 100;
  });
  const width = WIDTHS.find((w) => w.key === widthKey) ?? WIDTHS[1];

  // Which sections the reader has folded away, remembered between briefs — a
  // consultant who never reads Activities shouldn't re-collapse it every call.
  // Stored as a comma-joined list because usePersisted writes String(value).
  const [collapsedCsv, setCollapsedCsv] = usePersisted(COLLAPSED_KEY, '', (v) => v);
  const collapsed = useMemo(
    () => new Set(collapsedCsv.split(',').filter(Boolean)),
    [collapsedCsv]
  );
  const toggleSection = useCallback((id) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCollapsedCsv([...next].join(','));
  }, [collapsed, setCollapsedCsv]);

  useEffect(() => {
    let cancelled = false;
    setHistory(null); setSelectedDate(null); setError('');
    setSessions(null); setSessionsErr(''); setOpenEvent(null); setShowAllSessions(false);
    setCases(null); setCasesErr(''); setOverview(null);
    setFit(null); setFitErr(''); setActivities(null); setActivitiesErr(''); setOpenActivity(null);
    fetchAccountSnapshots(recordId)
      .then((h) => { if (!cancelled) setHistory(h); })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    // Timeline, cases, and overview load independently — a CRM/warehouse-table
    // failure must not blank the brief.
    fetchAccountSessions(recordId)
      .then((rows) => { if (!cancelled) setSessions(rows); })
      .catch((e) => { if (!cancelled) setSessionsErr(e?.message || String(e)); });
    fetchAccountCases(recordId)
      .then((rows) => { if (!cancelled) setCases(rows); })
      .catch((e) => { if (!cancelled) setCasesErr(e?.message || String(e)); });
    fetchAccountOverview(recordId)
      .then((o) => { if (!cancelled) setOverview(o); })
      .catch(() => { if (!cancelled) setOverview(null); });
    fetchAccountOpportunityFit(recordId)
      .then((rows) => { if (!cancelled) setFit(rows); })
      .catch((e) => { if (!cancelled) setFitErr(e?.message || String(e)); });
    fetchAccountActivities(recordId)
      .then((rows) => { if (!cancelled) setActivities(rows); })
      .catch((e) => { if (!cancelled) setActivitiesErr(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [recordId]);

  const snap = useMemo(() => {
    if (!history?.length) return null;
    return history.find((h) => h.snapshotDate === selectedDate) || history[0];
  }, [history, selectedDate]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const flags = useMemo(() => (snap ? computeFlags(snap, todayIso) : []), [snap, todayIso]);

  // TimeTracking comes back oldest-first; the brief reads newest-first, like
  // every other list on the page.
  const timeline = useMemo(() => (sessions ? [...sessions].reverse() : null), [sessions]);
  const openCases = useMemo(() => (cases ? cases.filter((c) => c.isOpen) : []), [cases]);

  const fitRows = useMemo(
    () => (fit && snap ? latestFitByMotion(fit, snap.snapshotDate) : null),
    [fit, snap]
  );
  // One caveat can repeat across motions; it is a standing internal note, so
  // show each distinct one once under the table.
  const fitCaveats = useMemo(
    () => [...new Set((fitRows ?? []).map((r) => r.caveats).filter(Boolean))],
    [fitRows]
  );

  // Which section the reader is in. An eight-section sticky nav that never says
  // where you are is decoration.
  const [activeSection, setActiveSection] = useState(null);
  useEffect(() => {
    const root = sheetRef.current;
    if (!root) return undefined;
    const els = SECTIONS
      .map(({ id }) => root.querySelector(`#${id}`))
      .filter(Boolean);
    if (!els.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const showing = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (showing.length) setActiveSection(showing[0].target.id);
      },
      // Top inset clears the two sticky bars; the bottom inset stops a section
      // counting as "current" while it's still only a sliver at the bottom.
      { rootMargin: '-120px 0px -55% 0px' }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [history]);

  const jump = (id) => {
    // Jumping to a section the reader folded away would land on a bare heading,
    // so open it on the way.
    if (collapsed.has(id)) toggleSection(id);
    const el = sheetRef.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (error) {
    return <div style={s.stage}><div style={s.center}><span style={s.errorTxt}>Couldn’t load snapshot: {error}</span></div></div>;
  }
  if (!history) return <div style={s.stage}><div style={s.center}>Loading brief…</div></div>;
  if (!history.length) {
    return (
      <div style={s.stage}>
        <div style={s.center}>
          <button type="button" style={s.crumb} className="cp-crumb" onClick={() => navigate('/call-prep')}>← Call Prep</button>
          <p style={{ marginTop: 16 }}>No snapshots exist for account {recordId} yet.</p>
        </div>
      </div>
    );
  }

  const industry = [snap.industryL1, snap.industryL2, snap.industryL3].filter(Boolean).join(' › ');
  const age = ageLabel(snap.accountAgeMonths);
  const syncWarn = (snap.syncStatus && snap.syncStatus !== 'healthy') || snap.syncFailCount > 0;
  const callTime = fmtTime(snap.scheduledTime);
  const weekday = fmtWeekday(snap.snapshotDate);
  const shownSessions = timeline && !showAllSessions ? timeline.slice(0, VISIBLE_SESSIONS) : timeline;
  const hiddenCount = timeline ? timeline.length - (shownSessions?.length ?? 0) : 0;
  const navTop = Math.round(TOOLBAR_H / (zoom / 100));
  // Anchor offset has to clear both sticky bars. The toolbar sits outside the
  // zoomed container so its height needs the same correction navTop gets; the
  // nav is inside it and doesn't.
  const anchorOffset = navTop + NAV_H;
  const sectionStyle = { ...s.section, scrollMarginTop: anchorOffset };

  const parentLine = snap.multiEntityParentName
    ? `Child of ${snap.multiEntityParentName}${snap.parentIsDep ? ' (parent is DEP)' : ''}`
    : 'No';

  return (
    <div style={s.stage}>
      <style>{CSS}</style>

      <div style={s.toolbar} className="cp-toolbar-wrap">
        <div style={s.toolbarGroup}>
          {/* Links, not buttons: these navigate, so they have to survive
              middle-click, cmd-click and "copy link address". */}
          <Link
            style={s.crumb}
            className="cp-crumb"
            to={`/call-prep/${encodeURIComponent(snap.consultant || '')}`}
          >
            ← {snap.consultant || 'Call Prep'}{snap.consultant ? '’s book' : ''}
          </Link>
          {/* This sheet is the pre-call view: one call, one date. The customer
              page is the everything view — projects, full call history, audit
              feedback. Cross-linked rather than merged, because they're read at
              different moments. */}
          <Link
            style={s.crumb}
            className="cp-crumb"
            to={`/accounts/${encodeURIComponent(recordId)}`}
          >
            Customer view →
          </Link>
        </div>

        <div style={s.toolbarGroup}>
          {history.length > 1 && (
            <>
              <span style={s.controlLabel} id="cp-snapshot-label">Snapshot</span>
              <select
                style={s.select}
                aria-labelledby="cp-snapshot-label"
                value={snap.snapshotDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              >
                {history.map((h) => (
                  <option key={h.snapshotDate} value={h.snapshotDate}>{fmtDate(h.snapshotDate)}</option>
                ))}
              </select>
            </>
          )}

          <span style={s.controlLabel} id="cp-width-label">Width</span>
          <div style={s.segment} role="group" aria-labelledby="cp-width-label">
            {WIDTHS.map((w) => (
              <button
                key={w.key}
                type="button"
                className="cp-seg-btn"
                aria-pressed={w.key === width.key}
                style={{ ...s.segmentBtn, ...(w.key === width.key ? s.segmentOn : null) }}
                onClick={() => setWidthKey(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>

          <span style={s.controlLabel} id="cp-zoom-label">Zoom</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} role="group" aria-labelledby="cp-zoom-label">
            <button
              type="button"
              className="cp-step"
              style={s.stepBtn}
              aria-label="Zoom out"
              disabled={zoom <= ZOOM_MIN}
              onClick={() => setZoom(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
            >
              −
            </button>
            <span style={s.zoomValue} aria-live="polite">{zoom}%</span>
            <button
              type="button"
              className="cp-step"
              style={s.stepBtn}
              aria-label="Zoom in"
              disabled={zoom >= ZOOM_MAX}
              onClick={() => setZoom(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* zoom scales the brief only; the toolbar keeps its own size so the
          controls stay where the eye left them. */}
      <div style={{ ...s.shellOuter, zoom: zoom / 100 }}>
        <div style={{ ...s.sheet, maxWidth: width.max ?? '100%' }} ref={sheetRef}>
          <div className="cp-rise"><div style={s.kicker}>{[snap.callType, 'Pre-call brief'].filter(Boolean).join(' · ')}</div></div>
          <h1 className="cp-rise" style={{ ...s.title, animationDelay: '40ms' }}>{snap.accountName ?? '—'}</h1>

          <div className="cp-rise" style={{ animationDelay: '90ms' }}>
            <div style={s.when}>
              {[weekday, fmtDate(snap.snapshotDate)].filter(Boolean).join(', ')}
              {callTime ? ` @ ${callTime}` : ''}
            </div>

            <div style={s.identity}>
              <Detail
                label="Contact"
                value={snap.contactName || snap.contactEmail
                  ? <span>{snap.contactName || snap.contactEmail}
                      {snap.contactName && snap.contactEmail
                        ? <span style={{ display: 'block', fontSize: 12.5, fontWeight: 400, color: MUTE }}>{snap.contactEmail}</span>
                        : null}
                    </span>
                  : null}
              />
              <Detail label="Consultant" value={snap.consultant} />
              <Detail
                label="Account age"
                value={age
                  ? <span>{age}
                      {snap.signupDate
                        ? <span style={{ display: 'block', fontSize: 12.5, fontWeight: 400, color: MUTE }}>
                            signed up {fmtDate(snap.signupDate)}
                          </span>
                        : null}
                    </span>
                  : null}
              />
              <Detail label="DEP enrolled" value={snap.depEnrolled ? 'Yes' : 'No'} />
            </div>

            {flags.length > 0 && (
              <div style={s.alertRow}>
                {flags.map((f) => <span key={f} style={s.alert}>{f}</span>)}
              </div>
            )}
          </div>

          <nav style={{ ...s.nav, top: navTop }} aria-label="Brief sections">
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className="cp-chip"
                style={{ ...s.navChip, ...(activeSection === id ? s.navChipOn : null) }}
                aria-current={activeSection === id ? 'true' : undefined}
                onClick={() => jump(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="cp-cols">
            <div>
              <Section
                id="top3"
                title="Top 3 points for today"
                count={snap.top3.length || null}
                open={!collapsed.has('top3')}
                onToggle={() => toggleSection('top3')}
                style={sectionStyle}
              >
                {snap.top3.length > 0 ? (
                  <ol style={s.points}>
                    {snap.top3.map((point, i) => (
                      <li key={point} style={s.point}>
                        <span style={s.pointNum} aria-hidden="true">{i + 1}</span>
                        {point}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p style={s.empty}>No points written for this prep.</p>
                )}
              </Section>

              <Section
                id="why"
                title="Why today"
                open={!collapsed.has('why')}
                onToggle={() => toggleSection('why')}
                style={sectionStyle}
              >
                {snap.whyToday ? <p style={s.prose}>{snap.whyToday}</p> : <p style={s.empty}>Not recorded for this prep.</p>}
                {openCases.length > 0 && (
                  <p style={{ ...s.prose, marginTop: 12 }}>
                    <strong>Most recent open case:</strong>{' '}
                    {openCases[0].subject ?? `Case #${openCases[0].recordId}`} — opened {fmtDate(openCases[0].createdDate)}
                  </p>
                )}
              </Section>

              <Section
                id="fit"
                title="Opportunity fit"
                count={fitRows?.length || null}
                open={!collapsed.has('fit')}
                onToggle={() => toggleSection('fit')}
                style={sectionStyle}
              >
                {fitErr ? (
                  <p style={s.loadNote}>Couldn’t load opportunity fit.</p>
                ) : fitRows == null ? (
                  <p style={s.loadNote}>Loading opportunity fit…</p>
                ) : fitRows.length === 0 ? (
                  <p style={s.empty}>No motions assessed for this account yet.</p>
                ) : (
                  <>
                    <table style={s.fitTable}>
                      <caption className="cp-sr-only">
                        Commercial motion fit for {snap.accountName}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" style={s.fitTh}>Motion</th>
                          <th scope="col" style={s.fitTh}>Fit</th>
                          <th scope="col" style={s.fitTh}>Rationale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fitRows.map((row) => (
                          <tr key={row.motion}>
                            <th scope="row" style={{ ...s.fitTd, ...s.fitMotion }}>
                              {MOTION_LABELS[row.motion] ?? row.motion}
                            </th>
                            <td style={s.fitTd}>
                              <span style={{ ...s.fitBadge, ...(FIT_STYLE[row.fit] ?? FIT_STYLE.none) }}>
                                {FIT_LABELS[row.fit] ?? 'Unknown'}
                              </span>
                            </td>
                            <td style={s.fitTd}>
                              <div style={s.fitRationale}>{row.rationale ?? '—'}</div>
                              {row.signals.length > 0 && (
                                <div style={s.fitSignals}>
                                  {row.signals.map((sig) => <span key={sig} style={s.fitSignal}>{sig}</span>)}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {fitCaveats.map((c) => (
                      <p key={c} style={s.caveat}>
                        <span style={s.caveatLabel}>Internal only.</span> {c}
                      </p>
                    ))}
                  </>
                )}
              </Section>

              <Section
                id="signals"
                title="DEP signals"
                count={snap.depSignals.length || null}
                open={!collapsed.has('signals')}
                onToggle={() => toggleSection('signals')}
                style={sectionStyle}
              >
                {snap.depSignals.length > 0 ? (
                  <ul style={s.brief}>
                    {snap.depSignals.map((sig) => (
                      <li key={sig} style={s.briefItem}>
                        <span style={s.briefMark} />
                        {sig}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={s.empty}>None evident from current data.</p>
                )}
              </Section>

              <Section
                id="sessions"
                title="Time tracking"
                count={timeline?.length || null}
                open={!collapsed.has('sessions')}
                onToggle={() => toggleSection('sessions')}
                style={sectionStyle}
              >
                <div style={s.stats}>
                  <Stat label="Total billed" value={snap.ttTotalHours != null ? `${snap.ttTotalHours} hrs` : null} />
                  <Stat label="Sessions" value={snap.ttSessionCount} />
                  <Stat label="Last session" value={fmtDate(snap.ttLastSessionDate)} />
                </div>
                {sessionsErr ? (
                  <p style={s.loadNote}>Couldn’t load session history.</p>
                ) : timeline == null ? (
                  <p style={s.loadNote}>Loading session history…</p>
                ) : timeline.length === 0 ? (
                  <p style={s.empty}>No sessions recorded yet.</p>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <span style={s.railLine} aria-hidden="true" />
                    <ul style={s.rail}>
                      {shownSessions.map((sess, i) => {
                        const kind = sessionKind(sess);
                        const key = `${sess.date}-${i}`;
                        const isThisCall = sess.date === snap.snapshotDate;
                        const body = cleanNotes(sess.notes);
                        const open = openEvent === key;
                        // Only a session that has notes is a control; the rest
                        // are plain rows, so nothing focusable does nothing.
                        const head = (
                          <>
                            {body && (
                              <span
                                className="cp-caret"
                                aria-hidden="true"
                                style={{ ...s.caret, ...(open ? s.caretOpen : null) }}
                              >
                                ▸
                              </span>
                            )}
                            <span className="cp-date" style={s.eventDate}>{fmtDate(sess.date)}</span>
                            <span style={{ ...s.typeBadge, background: kind.bg, color: kind.fg }}>{kind.label}</span>
                            <span style={s.eventMeta}>
                              {sess.durationHours != null ? `${sess.durationHours} hr` : ''}
                              {isThisCall ? '  ·  this call’s day' : ''}
                            </span>
                          </>
                        );
                        return (
                          <li key={key} style={s.event}>
                            <span style={{ ...s.dot, background: kind.dot }} />
                            {body ? (
                              <button
                                type="button"
                                className="cp-event-head"
                                style={{ ...s.eventHead, cursor: 'pointer' }}
                                aria-expanded={open}
                                onClick={() => setOpenEvent(open ? null : key)}
                              >
                                {head}
                              </button>
                            ) : (
                              <div style={s.eventHead}>{head}</div>
                            )}
                            {body && open ? <div style={s.eventNotes}>{body}</div> : null}
                          </li>
                        );
                      })}
                      {snap.signupDate && showAllSessions && (
                        <li style={s.event}>
                          <span style={{ ...s.dot, background: INK }} />
                          <div style={s.eventHead}>
                            <span style={s.eventDate}>{fmtDate(snap.signupDate)}</span>
                            <span style={{ ...s.typeBadge, background: '#efece3', color: INK }}>Signed up</span>
                          </div>
                        </li>
                      )}
                    </ul>
                    {hiddenCount > 0 && (
                      <button type="button" style={s.moreBtn} onClick={() => setShowAllSessions(true)}>
                        Show all {timeline.length} sessions
                      </button>
                    )}
                    {showAllSessions && timeline.length > VISIBLE_SESSIONS && (
                      <button type="button" style={s.moreBtn} onClick={() => setShowAllSessions(false)}>
                        Show recent only
                      </button>
                    )}
                  </div>
                )}
              </Section>

              <Section
                id="cases"
                title="Cases"
                count={cases?.length || null}
                open={!collapsed.has('cases')}
                onToggle={() => toggleSection('cases')}
                style={sectionStyle}
              >
                {casesErr ? (
                  <p style={s.loadNote}>Couldn’t load cases.</p>
                ) : cases == null ? (
                  <p style={s.loadNote}>Loading cases…</p>
                ) : cases.length === 0 ? (
                  <p style={s.empty}>No cases on record.</p>
                ) : (
                  <div>
                    <p style={{ ...s.eventMeta, marginTop: 0, marginBottom: 8 }}>
                      {cases.length} on record · {openCases.length} open · {cases.length - openCases.length} closed
                    </p>
                    {cases.map((c) => (
                      <div key={c.recordId} style={s.caseRow}>
                        <div style={s.caseTop}>
                          <span style={s.caseSubject}>{c.subject ?? `Case #${c.recordId}`}</span>
                          <span style={{ ...s.caseBadge, ...(c.isOpen ? { background: '#fbf1e4', color: AMBER } : { background: '#f1efe8', color: MUTE }) }}>
                            {c.status || (c.isOpen ? 'Open' : 'Closed')}
                          </span>
                          {c.priority ? <span style={{ ...s.caseBadge, background: '#f1efe8', color: MUTE }}>{c.priority}</span> : null}
                        </div>
                        <div style={s.caseMeta}>
                          #{c.recordId} · opened {fmtDate(c.createdDate)}
                          {c.closedDate ? ` · closed ${fmtDate(c.closedDate)}` : ''}
                          {c.contactName ? ` · ${c.contactName}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              <Section
                id="activities"
                title="Recent activities"
                count={activities?.length || null}
                open={!collapsed.has('activities')}
                onToggle={() => toggleSection('activities')}
                style={sectionStyle}
              >
                {activitiesErr ? (
                  <p style={s.loadNote}>Couldn’t load activities.</p>
                ) : activities == null ? (
                  <p style={s.loadNote}>Loading activities…</p>
                ) : activities.length === 0 ? (
                  <p style={s.empty}>No activities logged on this account.</p>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <span style={s.railLine} aria-hidden="true" />
                    <ul style={s.rail}>
                      {activities.map((act) => {
                        const open = openActivity === act.recordId;
                        const head = (
                          <>
                            {act.notes && (
                              <span
                                className="cp-caret"
                                aria-hidden="true"
                                style={{ ...s.caret, ...(open ? s.caretOpen : null) }}
                              >
                                ▸
                              </span>
                            )}
                            <span className="cp-date" style={s.eventDate}>{fmtDate(act.date)}</span>
                            <span style={{ ...s.typeBadge, background: '#f1efe8', color: MUTE }}>{act.type ?? 'Activity'}</span>
                            <span style={s.eventMeta}>
                              {act.agentId != null ? `agent #${act.agentId}` : ''}
                              {act.status && act.status !== 'Completed' ? `  ·  ${act.status}` : ''}
                            </span>
                          </>
                        );
                        return (
                          <li key={act.recordId} style={s.event}>
                            <span style={{ ...s.dot, background: HAIR }} />
                            {act.notes ? (
                              <button
                                type="button"
                                className="cp-event-head"
                                style={{ ...s.eventHead, cursor: 'pointer' }}
                                aria-expanded={open}
                                onClick={() => setOpenActivity(open ? null : act.recordId)}
                              >
                                {head}
                              </button>
                            ) : (
                              <div style={s.eventHead}>{head}</div>
                            )}
                            {act.notes && open ? <div style={s.eventNotes}>{act.notes}</div> : null}
                          </li>
                        );
                      })}
                    </ul>
                    {activities.length >= ACTIVITY_LIMIT && (
                      <p style={s.capNote}>Latest {ACTIVITY_LIMIT} activities.</p>
                    )}
                  </div>
                )}
              </Section>
            </div>

            <aside className="cp-rail" style={{ paddingTop: 38 }}>
              <Card title="Business context">
                <Row label="Industry" value={industry || null} first />
                <Row label="Operating model" value={snap.operatingModel} />
                {snap.bqConfidence != null && (
                  <Row label="Classifier confidence" value={`${Math.round(snap.bqConfidence * 100)}%`} />
                )}
                {snap.website && (
                  <Row
                    label="Website"
                    value={<a href={snap.website} target="_blank" rel="noreferrer" style={{ color: ACCENT }}>{snap.website.replace(/^https?:\/\//, '')}</a>}
                  />
                )}
                {snap.businessContext ? <p style={{ ...s.prose, fontSize: 13.5, marginTop: 12, marginBottom: 0 }}>{snap.businessContext}</p> : null}
              </Card>

              <Card title="Snapshot">
                <Row label="Type" value={snap.callType} first />
                <Row label="Sync status" value={snap.syncStatus} warn={syncWarn} />
                <Row label="Sync failures" value={snap.syncFailCount} warn={snap.syncFailCount > 0} />
                <Row label="Open cases" value={snap.casesOpenCount} warn={snap.casesOpenCount > 0} />
                <Row label="Multi-entity" value={parentLine} />
              </Card>

              {overview && (
                <Card title="Revenue & licenses">
                  <Row label="MRR (run-rate)" value={overview.mrrRunRate != null ? `$${overview.mrrRunRate.toLocaleString()}/mo` : null} first />
                  <Row label="User licenses" value={overview.userLicenses} />
                  <Row
                    label="Health score"
                    value={overview.healthScore != null ? Math.round(overview.healthScore) : null}
                    warn={overview.healthScore != null && overview.healthScore < 50}
                  />
                  <Row label="Billing" value={overview.saasPayType} />
                </Card>
              )}
            </aside>
          </div>

          <Section
            id="details"
            title="Details"
            open={!collapsed.has('details')}
            onToggle={() => toggleSection('details')}
            style={sectionStyle}
          >
            {/* Everything not already on the page. Twelve of the original
                fourteen entries here repeated the identity block, the stat strip
                or a rail card verbatim, which cost a screenful of scrolling and
                gave the eye nothing new. */}
            <div style={s.grid}>
              <Detail label="Closed cases (90d)" value={snap.casesClosed90dCount} />
              {snap.contactPhone ? <Detail label="Contact phone" value={snap.contactPhone} /> : null}
            </div>
          </Section>

          <div style={s.footer}>
            <span style={s.footerMeta}>
              Prepared for {snap.consultant || '—'} · account #{snap.accountRecordId} · snapshot {fmtDate(snap.snapshotDate)}
            </span>
            {snap.docLink ? (
              <a style={s.sourceLink} className="cp-source" href={snap.docLink} target="_blank" rel="noreferrer">
                source document ↗
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
