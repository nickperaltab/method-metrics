// Free Hours — how many we delivered, and how many became paid PS work.
// Route: #/free-hours. Every number is deterministic: a delivered Free Hour is
// a logged `Free` time entry, a conversion is a billed PPU/Dedicated entry on
// the same account afterwards. No call scoring, no judgement. See lib/freeHours.js.
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  fetchFreeHours, fetchAgreementsSent, filterCalls, filterAgreements, summarize,
  byMonth, byConsultant, bySequence, byAgreementSent, totalAgreementsSent,
  conversions, conversionType, daysToConversion, distinctMonths, distinctConsultants,
  distinctLastFhMonths, sortRows,
  FAIR_WINDOW_DAYS, AGREEMENT_WINDOW_DAYS,
} from '../lib/freeHours';

const PPU = '#1d4ed8';
const DEP = '#b45309';

// Past this many rows the table stops being scannable; the filters above are how
// you reach the rest.
const ROW_LIMIT = 50;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m) => (m ? `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '');
const monthShort = (m) => (m ? MONTH_NAMES[Number(m.slice(5, 7)) - 1] : '');

const s = {
  wrap: { maxWidth: 1140, margin: '0 auto', padding: '40px 24px', fontFamily: "'DM Sans', sans-serif" },
  title: { fontSize: 22, fontWeight: 700, color: '#1a1a1a' },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 24, maxWidth: '68ch' },
  filters: {
    display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16,
    border: '1px solid #e2e5e9', borderRadius: 10, padding: '13px 16px', marginBottom: 20,
  },
  fg: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: {
    fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
    color: '#6b7280', fontFamily: "'JetBrains Mono', monospace",
  },
  select: {
    fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: '#1a1a1a', background: '#fff',
    border: '1px solid #e2e5e9', borderRadius: 7, padding: '8px 10px', cursor: 'pointer', minWidth: 120,
  },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 22 },
  tile: { border: '1px solid #e2e5e9', borderRadius: 10, padding: '14px 16px' },
  tileLab: {
    fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
    color: '#6b7280', fontFamily: "'JetBrains Mono', monospace",
  },
  tileBig: { fontSize: 30, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.1, marginTop: 8, fontVariantNumeric: 'tabular-nums' },
  tileFoot: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  panel: { border: '1px solid #e2e5e9', borderRadius: 10, marginBottom: 20, overflow: 'hidden' },
  phead: { padding: '14px 18px 11px', borderBottom: '1px solid #e2e5e9' },
  ph2: { fontSize: 16, fontWeight: 700, color: '#1a1a1a' },
  phsub: { fontSize: 12.5, color: '#6b7280', marginTop: 3, maxWidth: '76ch' },
  pbody: { padding: 18 },
  chart: { display: 'flex', alignItems: 'flex-end', gap: 14, height: 190 },
  col: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 5, height: '100%', minWidth: 0 },
  rate: { fontSize: 14, fontWeight: 700, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' },
  sub2: { fontSize: 9.5, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' },
  stack: { width: '100%', maxWidth: 62, display: 'flex', flexDirection: 'column-reverse', gap: 2, borderRadius: '4px 4px 0 0', overflow: 'hidden' },
  baseline: { height: 1, background: '#e2e5e9' },
  xlab: { fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' },
  legend: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: '#4b5563', marginTop: 10 },
  swatch: (c) => ({ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: c, marginRight: 7, verticalAlign: 'middle' }),
  note: { fontSize: 12.5, color: '#6b7280', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f0f1f3' },
  seqRow: { display: 'grid', gridTemplateColumns: '78px 1fr 122px', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid #f0f1f3' },
  seqLab: { fontSize: 13.5, fontWeight: 700, color: '#1a1a1a' },
  seqCount: { fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" },
  seqBar: { display: 'flex', height: 22, gap: 2, borderRadius: 4, overflow: 'hidden', background: '#f3f4f6' },
  seqRate: { display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 7 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  th: {
    textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.12em',
    textTransform: 'uppercase', color: '#6b7280', fontFamily: "'JetBrains Mono', monospace",
    borderBottom: '1px solid #e2e5e9', whiteSpace: 'nowrap',
  },
  thn: { textAlign: 'right' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f0f1f3', color: '#1a1a1a', whiteSpace: 'nowrap' },
  tdn: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: "'JetBrains Mono', monospace", fontSize: 13 },
  mono: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: '#6b7280' },
  pill: (color, bg, border) => ({
    display: 'inline-block', fontSize: 11, fontWeight: 700, color, background: bg,
    border: `1px solid ${border}`, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap',
  }),
  track: { flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', minWidth: 54 },
  meter: { display: 'flex', alignItems: 'center', gap: 9, minWidth: 124 },
  note2: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
  // Hover layer. A real tooltip rather than a native `title=`: it carries the
  // like-for-like comparison the month rate needs, and it opens on keyboard
  // focus, which `title` never does.
  tip: {
    position: 'fixed', zIndex: 60, pointerEvents: 'none', background: '#fff', color: '#1a1a1a',
    border: '1px solid #c3ccd6', borderRadius: 8, padding: '9px 11px', fontSize: 12.5,
    boxShadow: '0 4px 18px rgba(0,0,0,.16)', transform: 'translate(-50%, -100%)',
    marginTop: -8, maxWidth: 260, fontFamily: "'DM Sans', sans-serif",
  },
  tipHead: { fontWeight: 700, marginBottom: 5 },
  tipRow: { display: 'flex', justifyContent: 'space-between', gap: 16, fontVariantNumeric: 'tabular-nums' },
  tipVal: { fontFamily: "'JetBrains Mono', monospace" },
  tipSep: { height: 1, background: '#e2e5e9', margin: '7px -11px 6px' },
  tipNote: { color: '#6b7280', fontSize: 11.5, lineHeight: 1.45, marginTop: 6 },
  info: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15,
    borderRadius: '50%', border: '1px solid #c3ccd6', background: '#f3f4f6', color: '#6b7280',
    font: "600 10px/1 'DM Sans', sans-serif", cursor: 'help', padding: 0, marginLeft: 6,
    verticalAlign: 'middle', flex: 'none', textTransform: 'none', letterSpacing: 0,
  },
};

/** What a screen reader announces for one column of the month chart. */
const summaryOf = (m) => [
  monthLabel(m.month),
  `${m.delivered} Free Hours`,
  `${m.eligible} could convert`,
  `${m.converted} converted`,
  m.rate == null ? 'no rate' : `${m.rate} percent`,
].join(', ');

const ppuPill = () => s.pill(PPU, '#eff6ff', '#bfdbfe');
const depPill = () => s.pill(DEP, '#fffbeb', '#fde68a');

// The three denominators on this screen are different, which is the single
// thing people get wrong when reading it. Spelled out rather than left to
// hover notes, because the difference between them changes what a rate means.
const DEFINITIONS = [
  ['Free Hours delivered', 'Every logged `Free` time entry with hours above zero. No exclusions — this is the raw count of sessions given.'],
  ['Open case', 'The account had a consulting case still open when the call happened, so the hours it bills next were already committed. These stay in the delivered count but sit outside the rate. An account whose earlier case has closed counts as a fresh opportunity again.'],
  ['Could convert', 'Delivered minus open-case. This, not delivered, is the denominator of the rate.'],
  ['Rate', 'Converted divided by could-convert, counting a conversion whenever it happened. Older months therefore flatter themselves simply for having had more time.'],
  [`Rate within ${FAIR_WINDOW_DAYS} days`, `Bounds both sides to ${FAIR_WINDOW_DAYS} days and counts only calls old enough to have had the full window. This is the one to compare month against month. Hover a bar in the chart to see it.`],
  ['Trial Free Hours', 'Free Hours given to accounts with no paying SaaS subscription in the month of the call. The rest went to existing customers.'],
  ['Agreements sent', 'Pay-Per-Use or Dedicated agreements a consultant created in the period, whether or not a Free Hour came first.'],
  [`After trial FH`, `Trial Free Hours where the same consultant sent an agreement within ${AGREEMENT_WINDOW_DAYS} days. A proposal desk writes most agreements that follow a Free Hour; those are excluded here, so this is the rep's own follow-through.`],
  ['Days to sign', 'Call date to the date an agreement was accepted. Signature, not send.'],
  ['Days to 1st hour', 'Call date to the first billed Pay-Per-Use or Dedicated hour. Signing and starting are separate events, and the gap between them is scheduling.'],
  ['Paid hrs', 'Billed hours in the 90 days after the call — a fixed window, independent of the dates above.'],
].map(([term, def]) => ({ term, def }));

const TipRow = ({ k, v, accent }) => (
  <div style={s.tipRow}>
    <span style={accent ? { color: '#047857', fontWeight: 600 } : undefined}>{k}</span>
    <span style={{ ...s.tipVal, ...(accent ? { color: '#047857', fontWeight: 700 } : {}) }}>{v}</span>
  </div>
);

// Inline styles can't express :focus-visible or :hover, so the sort headers get a
// real stylesheet — a header you can tab to but can't see focused is worse than
// one you can't tab to at all.
const FH_CSS = `
.fh-sort {
  font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit;
  background: none; border: 0; padding: 0; margin: 0; cursor: pointer;
  display: inline-flex; align-items: baseline; gap: 5px;
}
.fh-sort:hover { color: #1a1a1a; }
.fh-sort:focus-visible { outline: 2px solid #047857; outline-offset: 3px; border-radius: 2px; }
.fh-caret { font-size: 8px; line-height: 1; width: 7px; text-align: center; }
`;

const ALREADY_TIP = 'Accounts with a consulting case still open when the call happened. The hours they bill next were already committed, so they sit outside the rate but still count as Free Hours delivered. An account whose earlier case has closed is eligible again.';
const TRIAL_TIP = 'Free Hours given to accounts with no paying SaaS subscription in the month of the call. The rest went to existing customers.';
const SENT_TIP = 'Agreements the consultant who delivered the Free Hour sent themselves, within 90 days of it. A proposal desk writes most agreements that follow a Free Hour, and those are not counted here.';
const CONSULTANT_RATE_TIP = 'Converted divided by the Free Hours that could convert, over the period selected above. A consultant with only a handful of Free Hours will swing wildly — read the Free Hours column first.';

// Columns of the two sortable tables. `value` is what the column sorts on, which
// is not always what the cell prints: Rate sorts on null for a consultant with
// nothing eligible so they sink instead of ranking as 0%.
const REP_COLS = [
  { key: 'consultant', label: 'Consultant', text: true, value: (r) => r.consultant },
  { key: 'delivered', label: 'Free Hours', value: (r) => r.delivered },
  {
    key: 'openCaseAtCall',
    label: 'Open case',
    tip: ALREADY_TIP,
    tipLabel: 'About already-paying accounts',
    value: (r) => r.openCaseAtCall,
  },
  {
    key: 'trialFreeHours',
    label: 'Trial FH',
    tip: TRIAL_TIP,
    tipLabel: 'About trial Free Hours',
    value: (r) => r.trialFreeHours,
  },
  {
    key: 'agreementsSent',
    label: 'Agr. sent',
    tip: 'Every Pay-Per-Use or Dedicated agreement this consultant created in the period, whether or not a Free Hour came first.',
    tipLabel: 'About agreements sent',
    value: (r) => r.agreementsSent,
  },
  {
    key: 'trialRepSentAgreement',
    label: 'After trial FH',
    tip: SENT_TIP,
    tipLabel: 'About agreements after a trial Free Hour',
    value: (r) => r.trialRepSentAgreement,
  },
  {
    key: 'agreementRateOfTrial',
    label: 'Agr. rate',
    align: 'left',
    tip: 'Trial Free Hours where the same consultant sent an agreement within 90 days, divided by their trial Free Hours.',
    tipLabel: 'About the agreement rate',
    value: (r) => (r.trialFreeHours ? r.agreementRateOfTrial : null),
  },
  { key: 'converted', label: 'Converted', value: (r) => r.converted },
  {
    key: 'rate',
    label: 'Rate',
    align: 'left',
    tip: CONSULTANT_RATE_TIP,
    tipLabel: 'About consultant rate',
    value: (r) => (r.eligible ? r.rate : null),
  },
  { key: 'ppu', label: 'PPU', value: (r) => r.ppu },
  { key: 'dep', label: 'DEP', value: (r) => r.dep },
  { key: 'paidHours', label: 'Paid hrs', value: (r) => r.paidHours },
];

const WON_COLS = [
  { key: 'callDate', label: 'Free Hour', text: true, align: 'left', open: 'desc', value: (c) => c.callDate },
  { key: 'account', label: 'Account', text: true, align: 'left', value: (c) => c.account },
  { key: 'consultant', label: 'Consultant', text: true, align: 'left', value: (c) => c.consultant },
  { key: 'seq', label: 'Nth FH', value: (c) => c.seq },
  { key: 'kind', label: 'Bought', text: true, align: 'left', value: (c) => conversionType(c) },
  { key: 'daysToAgreement', label: 'Days to sign', value: (c) => c.daysToAgreement },
  { key: 'daysToFirst', label: 'Days to 1st hour', value: (c) => daysToConversion(c) },
  { key: 'paidHours90d', label: 'Paid hrs', value: (c) => c.paidHours90d || null },
];

/**
 * Sort state for one table. A column you click for the first time opens the way
 * you'd want to read it: names A–Z, counts and dates highest first. `open`
 * overrides that per column.
 */
function useSort(defaultKey, defaultDir = 'desc') {
  const [key, setKey] = useState(defaultKey);
  const [dir, setDir] = useState(defaultDir);
  const toggle = (col) => {
    if (col.key === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setKey(col.key); setDir(col.open ?? (col.text ? 'asc' : 'desc')); }
  };
  return { key, dir, toggle };
}

const CARETS = { asc: '▲', desc: '▼' };

/** A circled "i". Opens the same tooltip on hover and on keyboard focus. */
function InfoDot({ label, content, onShow, onHide }) {
  const open = (e) => onShow(e, content);
  return (
    <button
      type="button"
      aria-label={label}
      style={s.info}
      onMouseEnter={open}
      onFocus={open}
      onMouseLeave={onHide}
      onBlur={onHide}
    >
      i
    </button>
  );
}

/**
 * One sortable header. The caret shows on every column so the row reads as
 * sortable. Where a column also explains itself, the info dot sits BESIDE the
 * sort button rather than inside it — nesting buttons is invalid HTML, and it
 * keeps "read the note" from firing "re-sort the table".
 */
function SortTh({ col, sort, onShow, onHide }) {
  const active = sort.key === col.key;
  const right = col.align !== 'left' && !col.text;
  return (
    <th
      scope="col"
      style={{ ...s.th, ...(right ? s.thn : null), ...(active ? { color: '#1a1a1a' } : null) }}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" className="fh-sort" onClick={() => sort.toggle(col)}>
        {col.label}
        <span className="fh-caret" style={{ opacity: active ? 1 : 0.4 }} aria-hidden="true">
          {active ? CARETS[sort.dir] : '▼'}
        </span>
      </button>
      {col.tip && (
        <InfoDot
          label={col.tipLabel}
          content={<div style={s.tipNote}>{col.tip}</div>}
          onShow={onShow}
          onHide={onHide}
        />
      )}
    </th>
  );
}

export default function FreeHours() {
  const [calls, setCalls] = useState(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [consultant, setConsultant] = useState('all');
  const [segment, setSegment] = useState('all');
  const [lastFrom, setLastFrom] = useState(null);
  const [lastTo, setLastTo] = useState(null);
  const [agreements, setAgreements] = useState([]);
  const [tip, setTip] = useState(null);

  // Anchor the tooltip to the element rather than the pointer, so it sits in the
  // same place whether it was opened by mouse or by tabbing to the control.
  const showTip = (e, content) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ content, x: r.left + r.width / 2, y: r.top });
  };
  const hideTip = () => setTip(null);

  useEffect(() => {
    let cancelled = false;
    fetchFreeHours()
      .then((rows) => {
        if (cancelled) return;
        setCalls(rows);
        const months = distinctMonths(rows);
        if (months.length) { setFrom(months[0]); setTo(months[months.length - 1]); }
        const last = distinctLastFhMonths(rows);
        if (last.length) { setLastFrom(last[0]); setLastTo(last[last.length - 1]); }
      })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, []);

  // Agreements sent is a separate grain — every proposal a consultant wrote,
  // Free Hour or not — so it loads on its own. A failure here leaves the rest of
  // the screen working with an empty agreements set rather than blanking it.
  useEffect(() => {
    let cancelled = false;
    fetchAgreementsSent()
      .then((rows) => { if (!cancelled) setAgreements(rows); })
      .catch(() => { if (!cancelled) setAgreements([]); });
    return () => { cancelled = true; };
  }, []);

  const months = useMemo(() => (calls ? distinctMonths(calls) : []), [calls]);
  const consultants = useMemo(() => (calls ? distinctConsultants(calls) : []), [calls]);
  const lastMonths = useMemo(() => (calls ? distinctLastFhMonths(calls) : []), [calls]);

  // Period + consultant + segment. Everything below reads from this one set.
  const scoped = useMemo(
    () => (calls ? filterCalls(calls, { from, to, consultant, segment, lastFrom, lastTo }) : []),
    [calls, from, to, consultant, segment, lastFrom, lastTo],
  );
  const scopedAgreements = useMemo(
    () => filterAgreements(agreements, { from, to, consultant }),
    [agreements, from, to, consultant],
  );
  const totals = useMemo(() => summarize(scoped), [scoped]);
  const agreementsSentTotal = useMemo(() => totalAgreementsSent(scopedAgreements), [scopedAgreements]);
  const followThrough = useMemo(() => byAgreementSent(scoped), [scoped]);
  const monthly = useMemo(() => byMonth(scoped), [scoped]);
  const repSort = useSort('rate');
  const wonSort = useSort('callDate');

  // Rate ties break on volume, so 100% off two Free Hours never outranks 100%
  // off twenty. byConsultant already applies that order; sorting keeps it.
  const reps = useMemo(() => {
    const col = REP_COLS.find((c) => c.key === repSort.key) ?? REP_COLS[0];
    return sortRows(byConsultant(scoped, scopedAgreements), {
      value: col.value,
      dir: repSort.dir,
      tiebreak: (a, b) => b.delivered - a.delivered || a.consultant.localeCompare(b.consultant),
    });
  }, [scoped, scopedAgreements, repSort.key, repSort.dir]);

  const won = useMemo(() => {
    const col = WON_COLS.find((c) => c.key === wonSort.key) ?? WON_COLS[0];
    return sortRows(conversions(scoped), {
      value: col.value,
      dir: wonSort.dir,
      tiebreak: (a, b) => (b.callDate ?? '').localeCompare(a.callDate ?? ''),
    });
  }, [scoped, wonSort.key, wonSort.dir]);
  // Sort first, cut second — the 50 rows shown are the top 50 of the chosen order.
  const wonShown = useMemo(() => won.slice(0, ROW_LIMIT), [won]);

  // The sequence panel deliberately ignores the segment filter — it exists to
  // show the whole shape, and filtering to "first" would empty three of its rows.
  const sequence = useMemo(
    () => (calls ? bySequence(filterCalls(calls, { from, to, consultant, lastFrom, lastTo })) : []),
    [calls, from, to, consultant, lastFrom, lastTo],
  );

  if (error) {
    return (
      <div style={s.wrap}>
        <div style={s.error}>
          {/BQ 403/.test(error)
            ? 'You don’t have access to the call_prep dataset yet. Ask Nic for the BigQuery grant.'
            : `Couldn’t load Free Hours: ${error}`}
        </div>
      </div>
    );
  }
  if (!calls) return <div style={s.wrap}><div style={s.note2}>Loading Free Hours…</div></div>;

  const scopeLabel = consultant === 'all' ? 'the whole team' : consultant;
  const period = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
  const peakRate = Math.max(30, ...monthly.map((m) => m.rate ?? 0));

  // The headline rate counts a conversion whenever it happened, so an older
  // cohort flatters itself. The windowed rate below the rule is the one to
  // compare month against month.
  const monthTip = (m) => (
    <>
      <div style={s.tipHead}>{monthLabel(m.month)}</div>
      <TipRow k="Free Hours" v={m.delivered} />
      <TipRow k="Could convert" v={m.eligible} />
      <TipRow k="Pay-Per-Use" v={m.ppu} />
      <TipRow k="Dedicated" v={m.dep} />
      <TipRow k="Rate so far" v={m.rate == null ? '—' : `${m.rate}%`} />
      <div style={s.tipSep} />
      <TipRow k={`Rate within ${FAIR_WINDOW_DAYS} days`} v={m.fairRate == null ? '—' : `${m.fairRate}%`} accent />
      <div style={s.tipNote}>
        {m.fairReady
          ? `Based on the ${m.fairReady} call${m.fairReady === 1 ? '' : 's'} old enough to have had the full ${FAIR_WINDOW_DAYS} days. Use this to compare months.`
          : `No call here is ${FAIR_WINDOW_DAYS} days old yet, so there is nothing comparable to show.`}
      </div>
    </>
  );

  const seqTip = (b) => (
    <>
      <div style={s.tipHead}>{b.label} Free Hour on the account</div>
      <TipRow k="Free Hours" v={b.delivered} />
      <TipRow k="Already paying" v={b.openCaseAtCall} />
      <TipRow k="Could convert" v={b.eligible} />
      <TipRow k="Converted" v={b.converted} />
      <TipRow k="Rate" v={b.rate == null ? '—' : `${b.rate}%`} accent />
      {b.delivered > 0 && (
        <div style={s.tipNote}>
          {Math.round((b.openCaseAtCall / b.delivered) * 100)}% of these went to accounts already buying PS work.
        </div>
      )}
    </>
  );

  const RATE_TIP = `Counts a conversion whenever it happened, so an older period has had more time to accumulate them. Hover a bar in the chart below for that month's like-for-like rate within ${FAIR_WINDOW_DAYS} days.`;
  // Rate meters are scaled to the best rate on screen, so re-sorting the table
  // never changes a bar's length.
  const best = Math.max(1, ...reps.map((x) => x.rate ?? 0));

  return (
    <div style={s.wrap}>
      <style>{FH_CSS}</style>
      <div style={s.title}>Free Hours</div>
      <div style={s.sub}>
        How many Free Hours we delivered, and how many turned into paid Pay-Per-Use or Dedicated work.
      </div>

      <div style={s.filters}>
        <div style={s.fg}>
          <label style={s.label} htmlFor="fh-from">Period</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <select id="fh-from" style={s.select} value={from ?? ''} onChange={(e) => setFrom(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <span style={{ color: '#6b7280', fontSize: 12.5 }}>to</span>
            <select id="fh-to" style={s.select} value={to ?? ''} onChange={(e) => setTo(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        </div>
        <div style={s.fg}>
          <label style={s.label} htmlFor="fh-rep">Consultant</label>
          <select id="fh-rep" style={s.select} value={consultant} onChange={(e) => setConsultant(e.target.value)}>
            <option value="all">All consultants</option>
            {consultants.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={s.fg}>
          <label style={s.label} htmlFor="fh-last-from">Last Free Hour</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <select id="fh-last-from" style={s.select} value={lastFrom ?? ''} onChange={(e) => setLastFrom(e.target.value)}>
              {lastMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <span style={{ color: '#6b7280', fontSize: 12.5 }}>to</span>
            <select id="fh-last-to" style={s.select} value={lastTo ?? ''} onChange={(e) => setLastTo(e.target.value)}>
              {lastMonths.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        </div>
        <div style={s.fg}>
          <label style={s.label} htmlFor="fh-seg">Account context</label>
          <select id="fh-seg" style={s.select} value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="all">All Free Hours</option>
            <option value="first">First Free Hour on the account</option>
            <option value="repeat">Repeat (2nd or later)</option>
            <option value="prior">Had a prior consulting case</option>
            <option value="trial">Trial (no paying SaaS that month)</option>
            <option value="customer">Existing SaaS customer</option>
          </select>
        </div>
      </div>

      <div style={s.tiles}>
        <Tile lab="Free Hours delivered" big={totals.delivered} foot={`${period} · ${scopeLabel}`} />
        <Tile
          lab={<>Led to paid work<InfoDot label="About the conversion rate" content={<div style={s.tipNote}>{RATE_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={totals.converted}
          foot={totals.openCaseAtCall
            ? `${totals.rate ?? '—'}% of the ${totals.eligible} that could convert · ${totals.openCaseAtCall} already paying`
            : `${totals.rate ?? '—'}% of ${totals.eligible}`}
        />
        <Tile lab="Split" big={`${totals.ppu} / ${totals.dep}`} foot={`${totals.ppu} Pay-Per-Use · ${totals.dep} Dedicated`} />
        <Tile
          lab="Median time to sign"
          big={totals.medianDaysToAgreement == null ? '—' : `${totals.medianDaysToAgreement}d`}
          foot={totals.signedCount
            ? `${totals.signedSameDay} same day · ${totals.signedWithinWeek} within a week`
            : 'no signatures in this selection'}
        />
        <Tile
          lab={<>Trial Free Hours<InfoDot label="About trial Free Hours" content={<div style={s.tipNote}>{TRIAL_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={totals.trialFreeHours}
          foot={`${totals.customerFreeHours} went to existing customers`}
        />
        <Tile
          lab={<>Agreements sent<InfoDot label="About agreements sent" content={<div style={s.tipNote}>{SENT_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={agreementsSentTotal}
          foot={totals.trialFreeHours
            ? `${totals.trialRepSentAgreement} after a trial Free Hour · ${totals.agreementRateOfTrial ?? 0}% of ${totals.trialFreeHours}`
            : 'no trial Free Hours in this selection'}
        />
        <Tile lab="Paid hours booked" big={totals.paidHours} foot="within 90 days of the Free Hour" />
      </div>

      <div style={s.panel}>
        <div style={s.phead}>
          <div style={s.ph2}>Conversion by month</div>
          <div style={s.phsub}>
            Share of accounts that could convert, for {scopeLabel}.
            Hover a bar for its {FAIR_WINDOW_DAYS}-day rate.
          </div>
        </div>
        <div style={s.pbody}>
          <div style={s.chart}>
            {monthly.map((m) => {
              const h = ((m.rate ?? 0) / peakRate) * 132;
              const tot = m.ppu + m.dep;
              const ph = tot ? Math.max(2, (m.ppu / tot) * h) : 0;
              const dh = tot && m.dep ? Math.max(2, (m.dep / tot) * h) : 0;
              const young = m.youngest < FAIR_WINDOW_DAYS;
              return (
                <div
                  key={m.month}
                  style={s.col}
                  tabIndex={0}
                  aria-label={summaryOf(m)}
                  onMouseEnter={(e) => showTip(e, monthTip(m))}
                  onFocus={(e) => showTip(e, monthTip(m))}
                  onMouseLeave={hideTip}
                  onBlur={hideTip}
                >
                  <div style={s.rate}>
                    {m.eligible ? `${m.rate ?? 0}%` : '—'}
                    {young && <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: DEP, marginLeft: 5, verticalAlign: 'middle' }} />}
                  </div>
                  <div style={s.sub2}>{m.converted} conv · {m.delivered} FH</div>
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', flex: 1 }}>
                    <div style={{ ...s.stack, height: Math.max(3, h) }}>
                      <div style={{ background: PPU, height: ph }} />
                      {dh > 0 && <div style={{ background: DEP, height: dh }} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={s.baseline} />
          <div style={{ ...s.chart, height: 'auto', alignItems: 'flex-start', paddingTop: 7 }}>
            {monthly.map((m) => (
              <div key={m.month} style={s.col}>
                <div style={s.xlab}>{monthShort(m.month)}<br /><span style={{ opacity: 0.6 }}>{m.month.slice(0, 4)}</span></div>
              </div>
            ))}
          </div>
          <div style={s.legend}>
            <span><i style={s.swatch(PPU)} />Pay-Per-Use</span>
            <span><i style={s.swatch(DEP)} />Dedicated</span>
            {totals.stillYoung > 0 && <span><i style={s.swatch(DEP)} />Still converting</span>}
          </div>
          {totals.stillYoung > 0 && (
            <div style={s.note}>
              <strong>{totals.stillYoung}</strong> Free Hours here are from the last {FAIR_WINDOW_DAYS} days and may still convert.
            </div>
          )}
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.phead}>
          <div style={s.ph2}>Repeat Free Hours</div>
          <div style={s.phsub}>
            Where each Free Hour sits in that account’s history.
          </div>
        </div>
        <div style={s.pbody}>
          {sequence.map((b, i) => {
            const widest = Math.max(1, ...sequence.map((x) => x.delivered));
            const w = (b.delivered / widest) * 100;
            const aPct = b.delivered ? (b.openCaseAtCall / b.delivered) * 100 : 0;
            const cPct = b.delivered ? (b.eligible / b.delivered) * 100 : 0;
            return (
              <div key={b.key} style={{ ...s.seqRow, borderBottom: i === sequence.length - 1 ? 'none' : s.seqRow.borderBottom }}>
                <div>
                  <div style={s.seqLab}>{b.label}</div>
                  <div style={s.seqCount}>{b.delivered} Free Hour{b.delivered === 1 ? '' : 's'}</div>
                </div>
                <div
                  style={{ ...s.seqBar, width: `${Math.max(3, w)}%` }}
                  tabIndex={0}
                  aria-label={`${b.label} Free Hour: ${b.delivered} delivered, ${b.openCaseAtCall} already paying, ${b.converted} of ${b.eligible} converted`}
                  onMouseEnter={(e) => showTip(e, seqTip(b))}
                  onFocus={(e) => showTip(e, seqTip(b))}
                  onMouseLeave={hideTip}
                  onBlur={hideTip}
                >
                  {b.openCaseAtCall > 0 && <i style={{ display: 'block', height: '100%', width: `${aPct}%`, background: DEP }} />}
                  {b.eligible > 0 && <i style={{ display: 'block', height: '100%', width: `${cPct}%`, background: PPU }} />}
                </div>
                <div style={s.seqRate}>
                  <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{b.rate == null ? '—' : `${b.rate}%`}</strong>
                  <span style={s.seqCount}>{b.converted} of {b.eligible}</span>
                </div>
              </div>
            );
          })}
          <div style={s.legend}>
            <span><i style={s.swatch(DEP)} />Already paying</span>
            <span><i style={s.swatch(PPU)} />Could convert</span>
          </div>
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.phead}>
          <div style={s.ph2}>Did the rep send an agreement?</div>
          <div style={s.phsub}>
            Free Hours split by whether the consultant who delivered it sent an agreement
            within {AGREEMENT_WINDOW_DAYS} days. Agreements written by the proposal desk are not counted.
          </div>
        </div>
        <table style={s.table} aria-label="Free Hours by whether the rep sent an agreement">
          <thead>
            <tr>
              <th scope="col" style={s.th}>Account at the call</th>
              <th scope="col" style={s.th}>Rep sent an agreement</th>
              <th scope="col" style={{ ...s.th, ...s.thn }}>Free Hours</th>
              <th scope="col" style={{ ...s.th, ...s.thn }}>Could convert</th>
              <th scope="col" style={{ ...s.th, ...s.thn }}>Converted</th>
              <th scope="col" style={{ ...s.th, ...s.thn }}>Rate</th>
            </tr>
          </thead>
          <tbody>
            {followThrough.every((b) => b.delivered === 0) && (
              <tr><td style={s.td} colSpan={6}><div style={s.note2}>No Free Hours in this selection.</div></td></tr>
            )}
            {followThrough.filter((b) => b.delivered > 0).map((b) => (
              <tr key={b.key}>
                <td style={s.td}>{b.label}</td>
                <td style={s.td}>
                  <span style={b.sent ? ppuPill() : s.pill('#6b7280', '#f3f4f6', '#e2e5e9')}>
                    {b.sent ? 'Sent' : 'Not sent'}
                  </span>
                </td>
                <td style={{ ...s.td, ...s.tdn }}>{b.delivered}</td>
                <td style={{ ...s.td, ...s.tdn, color: '#6b7280' }}>{b.eligible}</td>
                <td style={{ ...s.td, ...s.tdn }}>{b.converted}</td>
                <td style={{ ...s.td, ...s.tdn, fontWeight: 700 }}>{b.eligible ? `${b.rate ?? 0}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ ...s.note, margin: '0 18px 14px' }}>
          An agreement is close to a precondition for billed work, so read this as a funnel step
          rather than a cause.
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.phead}>
          <div style={s.ph2}>By consultant</div>
          <div style={s.phsub}>{period}. Click a column to sort.</div>
        </div>
        <table style={s.table} aria-label="Free Hour conversion by consultant">
          <thead>
            <tr>
              {REP_COLS.map((c) => (
                <SortTh key={c.key} col={c} sort={repSort} onShow={showTip} onHide={hideTip} />
              ))}
            </tr>
          </thead>
          <tbody>
            {reps.length === 0 && <tr><td style={s.td} colSpan={REP_COLS.length}><div style={s.note2}>No Free Hours in this selection.</div></td></tr>}
            {reps.map((r) => {
              return (
                <tr key={r.consultant}>
                  <td style={s.td}>{r.consultant}</td>
                  <td style={{ ...s.td, ...s.tdn }}>{r.delivered}</td>
                  <td style={{ ...s.td, ...s.tdn, color: '#6b7280' }}>{r.openCaseAtCall}</td>
                  <td style={{ ...s.td, ...s.tdn }}>{r.trialFreeHours}</td>
                <td style={{ ...s.td, ...s.tdn }}>{r.agreementsSent}</td>
                <td style={{ ...s.td, ...s.tdn }}>{r.trialRepSentAgreement}</td>
                <td style={s.td}>
                  <span style={{ ...s.mono, minWidth: 32, display: 'inline-block' }}>
                    {r.trialFreeHours ? `${r.agreementRateOfTrial ?? 0}%` : '—'}
                  </span>
                </td>
                <td style={{ ...s.td, ...s.tdn }}>{r.converted}</td>
                  <td style={s.td}>
                    <div style={s.meter}>
                      <div style={s.track}><div style={{ height: '100%', width: `${((r.rate ?? 0) / best) * 100}%`, background: PPU, borderRadius: 3 }} /></div>
                      <span style={{ ...s.mono, minWidth: 32 }}>{r.eligible ? `${r.rate ?? 0}%` : '—'}</span>
                    </div>
                  </td>
                  <td style={{ ...s.td, ...s.tdn }}>{r.ppu}</td>
                  <td style={{ ...s.td, ...s.tdn }}>{r.dep}</td>
                  <td style={{ ...s.td, ...s.tdn }}>{r.paidHours}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={s.panel}>
        <div style={s.phead}>
          <div style={s.ph2}>Conversions</div>
          <div style={s.phsub}>
            {won.length === 0 && 'No conversions in this selection.'}
            {won.length > 0 && won.length <= ROW_LIMIT
              && `${won.length} Free Hour${won.length === 1 ? '' : 's'} that produced billed work.`}
            {won.length > ROW_LIMIT
              && `Top ${ROW_LIMIT} of ${won.length} in this order. Sort or filter to see others.`}
          </div>
        </div>
        <table style={s.table} aria-label="Free Hours that produced billed work">
          <thead>
            <tr>
              {WON_COLS.map((c) => (
                <SortTh key={c.key} col={c} sort={wonSort} onShow={showTip} onHide={hideTip} />
              ))}
            </tr>
          </thead>
          <tbody>
            {won.length === 0 && <tr><td style={s.td} colSpan={WON_COLS.length}><div style={s.note2}>Nothing to show.</div></td></tr>}
            {wonShown.map((c) => {
              const kind = conversionType(c);
              return (
                <tr key={c.id}>
                  <td style={{ ...s.td, ...s.mono }}>{c.callDate}</td>
                  <td style={{ ...s.td, ...s.mono }}>{c.account ?? '—'}</td>
                  <td style={s.td}>{c.consultant}</td>
                  <td style={{ ...s.td, ...s.tdn, color: c.seq > 1 ? DEP : '#1a1a1a' }}>{c.seq}</td>
                  <td style={s.td}>
                    <span style={kind === 'ppu' ? ppuPill() : depPill()}>{kind === 'ppu' ? 'Pay-Per-Use' : 'Dedicated'}</span>
                  </td>
                  <td style={{ ...s.td, ...s.tdn }}>{c.daysToAgreement ?? '—'}</td>
                  <td style={{ ...s.td, ...s.tdn }}>{daysToConversion(c)}</td>
                  <td style={{ ...s.td, ...s.tdn }}>{c.paidHours90d ? c.paidHours90d.toFixed(1) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tip && (
        <div
          role="tooltip"
          style={{
            ...s.tip,
            left: Math.min(Math.max(tip.x, 140), (typeof window === 'undefined' ? 1200 : window.innerWidth) - 140),
            top: tip.y,
          }}
        >
          {tip.content}
        </div>
      )}

      <details style={s.panel}>
        <summary style={{ ...s.phead, cursor: 'pointer', borderBottom: 'none', fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
          How these numbers work
        </summary>
        <div style={{ padding: '0 18px 18px' }}>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(150px, 190px) 1fr', gap: '11px 18px', fontSize: 13.5 }}>
            {DEFINITIONS.map((d) => (
              <Fragment key={d.term}>
                <dt style={{ fontWeight: 700, color: '#1a1a1a' }}>{d.term}</dt>
                <dd style={{ margin: 0, color: '#4b5563', lineHeight: 1.5 }}>{d.def}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </details>

      <div style={{ ...s.note, borderTop: '1px solid #e2e5e9', paddingTop: 14 }}>
        Counts billed Pay-Per-Use and Dedicated work that followed a Free Hour. Accounts with a
        consulting case already open at the call are shown but sit outside the rate.
        See <code>docs/ps-free-hours.md</code>.
      </div>
    </div>
  );
}

function Tile({ lab, big, foot }) {
  return (
    <div style={s.tile}>
      <div style={s.tileLab}>{lab}</div>
      <div style={s.tileBig}>{big}</div>
      <div style={s.tileFoot}>{foot}</div>
    </div>
  );
}
