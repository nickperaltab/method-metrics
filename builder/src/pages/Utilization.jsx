// Utilization — of the hours a consultant was available, how many were billable.
// Route: #/utilization.
//
// The screen reports two rates that are easy to confuse, so it names them apart
// and shows both:
//
//   Utilization         billable / working hours (8 x the working days in the
//                       month, so 160 for August 2026)
//   % of billable work  billable / hours logged
//
// Every number is floored to two decimals, never rounded up: a rate must not
// present itself as having reached a target it missed. Two of the five hour
// buckets are read out of the entry notes because Method has no field for them.
// See lib/utilization.js and lib/workingTime.js.
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  fetchUtilization, filterMonths, summarize, byMonth, byConsultant, composition,
  distinctMonths, distinctConsultants, isInProgress, floor2,
} from '../lib/utilization';
import { workingDaysInMonth, workingDaysElapsed } from '../lib/workingTime';
import { sortRows } from '../lib/freeHours';

// One hue per bucket. Every one clears 4.5:1 on white, so the legend and the
// table text can use the same value as the bar.
const BILLABLE = '#1d4ed8';
const BANKABLE = '#b45309';
const DISCOUNTED = '#be123c';
const INTERNAL = '#6b7280';
// The second rate, kept visually distinct from utilization so the two charts
// are not read as the same measurement twice.
const SHARE = '#047857';
// A caveat about the bar rather than a sixth bucket, so it stays neutral.
const PROVISIONAL = '#6b7280';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m) => (m ? `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '');
const monthShort = (m) => (m ? MONTH_NAMES[Number(m.slice(5, 7)) - 1] : '');
const dayLabel = (d) => (d ? `${Number(d.slice(8, 10))} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1]}` : '');

/**
 * Hours, floored to two decimals.
 *
 * Fixed at two rather than scaled to the magnitude: this is an audit table, the
 * columns have to add up by eye, and a mix of 118 and 118.92 down one column
 * does not. `floor2` is the lib's, so the page and the data layer round the same
 * way and a tile can never disagree with the row it came from.
 */
const hrs = (n) => (n == null || !Number.isFinite(n)
  ? '—'
  : floor2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** A rate, floored to two decimals. */
const pct = (n) => (n == null || !Number.isFinite(n) ? '—' : `${floor2(n).toFixed(2)}%`);

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
  // 240 gives four tiles a row at the page's max width, so the eight sit as two
  // clean rows of four instead of a row of six and an orphaned pair.
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 22 },
  tile: { border: '1px solid #e2e5e9', borderRadius: 10, padding: '14px 16px' },
  tileLead: { border: '1px solid #c7d2fe', background: '#f5f7ff', borderRadius: 10, padding: '14px 16px' },
  tileLab: {
    fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase',
    color: '#6b7280', fontFamily: "'JetBrains Mono', monospace",
  },
  tileBig: { fontSize: 28, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.1, marginTop: 8, fontVariantNumeric: 'tabular-nums' },
  tileFoot: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  panel: { border: '1px solid #e2e5e9', borderRadius: 10, marginBottom: 20, overflow: 'hidden' },
  phead: { padding: '14px 18px 11px', borderBottom: '1px solid #e2e5e9' },
  ph2: { fontSize: 16, fontWeight: 700, color: '#1a1a1a' },
  phsub: { fontSize: 12.5, color: '#6b7280', marginTop: 3, maxWidth: '76ch' },
  pbody: { padding: 18 },
  banner: {
    display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid #fde68a', background: '#fffbeb',
    borderRadius: 10, padding: '11px 14px', marginBottom: 20, fontSize: 13, color: '#78350f', lineHeight: 1.5,
  },
  chart: { display: 'flex', alignItems: 'flex-end', gap: 14, height: 200 },
  col: { flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 5, height: '100%', minWidth: 0 },
  rate: { fontSize: 13, fontWeight: 700, color: '#1a1a1a', fontVariantNumeric: 'tabular-nums' },
  sub2: { fontSize: 9.5, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' },
  stack: { width: '100%', maxWidth: 62, display: 'flex', flexDirection: 'column-reverse', gap: 2, borderRadius: '4px 4px 0 0', overflow: 'hidden' },
  baseline: { height: 1, background: '#e2e5e9' },
  xlab: { fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' },
  legend: { display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: '#4b5563', marginTop: 12 },
  swatch: (c) => ({ display: 'inline-block', width: 11, height: 11, borderRadius: 3, background: c, marginRight: 7, verticalAlign: 'middle' }),
  swatchDot: (c) => ({ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: c, marginRight: 8, marginLeft: 2, verticalAlign: 'middle' }),
  provisionalDot: { display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: PROVISIONAL, marginLeft: 5, verticalAlign: 'middle' },
  note: { fontSize: 12.5, color: '#6b7280', marginTop: 14, paddingTop: 12, borderTop: '1px solid #f0f1f3' },
  mixRow: { display: 'grid', gridTemplateColumns: '132px 1fr 116px', alignItems: 'center', gap: 14, padding: '10px 0', borderBottom: '1px solid #f0f1f3' },
  mixLab: { fontSize: 13.5, fontWeight: 700, color: '#1a1a1a' },
  mixBar: { height: 22, borderRadius: 4, background: '#f3f4f6', overflow: 'hidden' },
  mixVal: { display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 7 },
  mixCount: { fontSize: 11, color: '#6b7280', fontFamily: "'JetBrains Mono', monospace" },
  // The share-by-month rows: month, bar, value.
  shareRow: { display: 'grid', gridTemplateColumns: '84px 1fr 92px', alignItems: 'center', gap: 14, padding: '8px 0', borderBottom: '1px solid #f0f1f3' },
  shareLab: { fontSize: 13, color: '#1a1a1a', fontFamily: "'JetBrains Mono', monospace" },
  shareBar: { height: 18, borderRadius: 4, background: '#f3f4f6', overflow: 'hidden' },
  shareVal: { textAlign: 'right', fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#1a1a1a' },
  scroll: { overflowX: 'auto' },
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
  track: { flex: 1, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden', minWidth: 44 },
  meter: { display: 'flex', alignItems: 'center', gap: 9, minWidth: 122 },
  note2: { fontSize: 14, color: '#6b7280', padding: 24, textAlign: 'center' },
  error: { fontSize: 14, color: '#b91c1c', padding: 24, textAlign: 'center' },
  tip: {
    position: 'fixed', zIndex: 60, pointerEvents: 'none', background: '#fff', color: '#1a1a1a',
    border: '1px solid #c3ccd6', borderRadius: 8, padding: '9px 11px', fontSize: 12.5,
    boxShadow: '0 4px 18px rgba(0,0,0,.16)', transform: 'translate(-50%, -100%)',
    marginTop: -8, maxWidth: 270, fontFamily: "'DM Sans', sans-serif",
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

const UTIL_CSS = `
.ut-sort {
  font: inherit; color: inherit; letter-spacing: inherit; text-transform: inherit;
  background: none; border: 0; padding: 0; margin: 0; cursor: pointer;
  display: inline-flex; align-items: baseline; gap: 5px;
}
.ut-sort:hover { color: #1a1a1a; }
.ut-sort:focus-visible { outline: 2px solid #047857; outline-offset: 3px; border-radius: 2px; }
.ut-caret { font-size: 8px; line-height: 1; width: 7px; text-align: center; }
`;

const CARETS = { asc: '▲', desc: '▼' };

const BILLED_TIP = 'Dedicated and pay-per-use hours as invoiced, before bankable and discounted time comes out.';
const BANKABLE_TIP = 'Dedicated hours a customer paid for and did not use. Logged at month end.';
const DISCOUNTED_TIP = 'Billed hours written off on a ticket.';
const INTERNAL_TIP = 'Time logged with no support type: internal projects, onboarding, training, product work.';
const BILLABLE_TIP = 'Hours logged minus bankable, discounted and internal time. Free Hours count.';
const WORKING_TIP = 'Eight hours for every working day, per consultant. Weekends and stat holidays are out.';
const UTIL_TIP = 'Billable hours divided by working hours.';
const SHARE_TIP = 'Billable hours as a share of the hours logged.';

// Columns of the leaderboard. `value` is what the column sorts on, which is not
// always what the cell prints: a rate sorts on null for a consultant with no
// hours so they sink instead of ranking as 0%.
const REP_COLS = [
  { key: 'consultant', label: 'Consultant', text: true, value: (r) => r.consultant },
  { key: 'billed', label: 'Billed', tip: BILLED_TIP, tipLabel: 'About billed hours', value: (r) => r.billed },
  { key: 'free', label: 'Free', value: (r) => r.free },
  { key: 'unusedDedicated', label: 'Bankable', tip: BANKABLE_TIP, tipLabel: 'About bankable hours', value: (r) => r.unusedDedicated },
  { key: 'discounted', label: 'Discounted', tip: DISCOUNTED_TIP, tipLabel: 'About discounted hours', value: (r) => r.discounted },
  { key: 'internal', label: 'Internal', tip: INTERNAL_TIP, tipLabel: 'About internal hours', value: (r) => r.internalProject + r.internalOther },
  { key: 'total', label: 'Logged', value: (r) => r.total },
  { key: 'billable', label: 'Billable', tip: BILLABLE_TIP, tipLabel: 'About billable hours', value: (r) => r.billable },
  { key: 'capacity', label: 'Working', tip: WORKING_TIP, tipLabel: 'About working hours', value: (r) => r.capacity },
  {
    key: 'billableShare',
    label: '% billable work',
    tip: SHARE_TIP,
    tipLabel: 'About percent of billable work',
    value: (r) => (r.total ? r.billableShare : null),
  },
  {
    key: 'utilization',
    label: 'Utilization',
    align: 'left',
    tip: UTIL_TIP,
    tipLabel: 'About utilization',
    value: (r) => (r.capacity ? r.utilization : null),
  },
];

// The five buckets every hour falls into, and how they combine into the two
// rates. Spelled out because the difference between billed, billable and
// working hours is what people get wrong when reading this screen.
const DEFINITIONS = [
  ['Working hours', 'Eight hours for every working day, for each consultant on the roster. August 2026 has 20 working days, so one consultant is 160 hours. Weekends and Ontario stat holidays are excluded. Method tracks no PTO, so a consultant on vacation is still charged full hours.'],
  ['Hours logged', 'Every time entry in the period. Attendance entries are the shift clock, so they are left out.'],
  ['Billed', 'Dedicated and pay-per-use hours as invoiced. This still contains the bankable and discounted hours below.'],
  ['Free', 'Free Hour sessions. Not invoiced, but they count as billable work.'],
  ['Bankable', 'Dedicated hours a customer paid for and did not use, written off at month end as unused dedicated time. Method has no field for it, so it is read from the entry note.'],
  ['Discounted', 'Billed hours given back on a ticket. Also read from the entry note, which carries the name of whoever approved the discount.'],
  ['Internal', 'Time logged with no Method support type: internal projects, onboarding, training and product work.'],
  ['Billable', 'Hours logged minus bankable, discounted and internal. The hours that were real, paid customer work.'],
  ['Utilization', 'Billable divided by working hours. Answers whether enough billable work got done.'],
  ['% of billable work', 'Billable divided by hours logged. Answers how much of the logged time was billable. A consultant who logs 40 hours and bills them all is at 100% here and 25% utilization.'],
  ['Roster', 'Consultants with an attendance record that month. Only they are charged working hours.'],
  ['Rounding', 'Every figure is rounded down to two decimals.'],
  ['Month in progress', 'The grey dot beside a rate. Working hours count only the days that have entries, and bankable hours are posted on the last day of the month.'],
];

const TipRow = ({ k, v, accent }) => (
  <div style={s.tipRow}>
    <span style={accent ? { color: '#047857', fontWeight: 600 } : undefined}>{k}</span>
    <span style={{ ...s.tipVal, ...(accent ? { color: '#047857', fontWeight: 700 } : {}) }}>{v}</span>
  </div>
);

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
 * One sortable header. The info dot sits BESIDE the sort button rather than
 * inside it: nesting buttons is invalid HTML, and it keeps "read the note" from
 * firing "re-sort the table".
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
      <button type="button" className="ut-sort" onClick={() => sort.toggle(col)}>
        {col.label}
        <span className="ut-caret" style={{ opacity: active ? 1 : 0.4 }} aria-hidden="true">
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

/**
 * Sort state for the leaderboard. A column you click for the first time opens
 * the way you'd want to read it: names A–Z, hours highest first.
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

/** What a screen reader announces for one column of the month chart. */
const summaryOf = (m) => [
  monthLabel(m.month),
  `${hrs(m.total)} hours logged`,
  `${hrs(m.billable)} billable`,
  `of ${hrs(m.capacity)} working hours`,
  m.utilization == null ? 'no utilization' : `${pct(m.utilization)} utilization`,
  m.inProgress ? 'month still open' : null,
].filter(Boolean).join(', ');

export default function Utilization() {
  const [rows, setRows] = useState(null);
  const [asOf, setAsOf] = useState(() => new Date());
  const [dataThrough, setDataThrough] = useState(null);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [consultant, setConsultant] = useState('all');
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
    fetchUtilization()
      .then((res) => {
        if (cancelled) return;
        setRows(res.rows);
        setAsOf(res.asOf);
        setDataThrough(res.dataThrough);
        const months = distinctMonths(res.rows);
        // Opens on the latest month alone, not the whole reporting window.
        // Utilization is a monthly figure, and a nine-month total in the same
        // tile reads as a monthly one that is nine times too big.
        if (months.length) {
          const latest = months[months.length - 1];
          setFrom(latest);
          setTo(latest);
        }
      })
      .catch((e) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, []);

  const months = useMemo(() => (rows ? distinctMonths(rows) : []), [rows]);
  const consultants = useMemo(() => (rows ? distinctConsultants(rows) : []), [rows]);

  const scoped = useMemo(
    () => (rows ? filterMonths(rows, { from, to, consultant }) : []),
    [rows, from, to, consultant],
  );
  const totals = useMemo(() => summarize(scoped, asOf), [scoped, asOf]);
  const monthly = useMemo(() => byMonth(scoped, asOf), [scoped, asOf]);
  const mix = useMemo(() => composition(scoped, asOf), [scoped, asOf]);
  // Opens on utilization, which only became a safe default ordering once the
  // denominator stopped moving with the numerator. Sorting on billable/logged
  // put anyone who logged a light month at the top with a perfect score; against
  // a fixed 160 hours, a 40-hour month reads as the 25% it is.
  const repSort = useSort('utilization');

  const reps = useMemo(() => {
    const col = REP_COLS.find((c) => c.key === repSort.key) ?? REP_COLS[0];
    return sortRows(byConsultant(scoped, asOf), {
      value: col.value,
      dir: repSort.dir,
      tiebreak: (a, b) => b.billable - a.billable || a.consultant.localeCompare(b.consultant),
    });
  }, [scoped, asOf, repSort.key, repSort.dir]);

  if (error) {
    return (
      <div style={s.wrap}>
        <div style={s.error}>
          {/BQ 403/.test(error)
            ? 'You don’t have access to the revenue dataset yet. Ask Nic for the BigQuery grant.'
            : `Couldn’t load utilization: ${error}`}
        </div>
      </div>
    );
  }
  if (!rows) return <div style={s.wrap}><div style={s.note2}>Loading utilization…</div></div>;

  const scopeLabel = consultant === 'all' ? 'the whole team' : consultant;
  const period = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
  // A multi-month selection is the one way to read a tile as a monthly figure
  // when it is not one, so a span carries its own per-month average.
  const perMonth = totals.months > 1 ? ` · ${hrs(totals.billable / totals.months)}/mo` : '';
  const openMonth = monthly.some((m) => m.inProgress);
  // Bars are scaled to the busiest month on screen, so a light month reads light.
  const peak = Math.max(1, ...monthly.map((m) => m.total));
  const bestUtil = Math.max(1, ...reps.map((r) => r.utilization ?? 0));

  /** What the working-hours tile says underneath: the arithmetic behind it. */
  const capacityFoot = () => {
    if (!totals.capacity) return 'nobody on the roster';
    if (from === to && from) {
      const days = isInProgress(from, asOf) ? workingDaysElapsed(from, asOf) : workingDaysInMonth(from);
      return consultant === 'all'
        ? `${totals.rosterConsultants} consultants × ${days} working days`
        : `${days} working days × 8 hours`;
    }
    return `${totals.rosterMonths} consultant-months`;
  };

  const monthTip = (m) => (
    <>
      <div style={s.tipHead}>{monthLabel(m.month)}</div>
      <TipRow k="Hours logged" v={hrs(m.total)} />
      <TipRow k="Billed" v={hrs(m.billed)} />
      <TipRow k="Free" v={hrs(m.free)} />
      <TipRow k="Bankable" v={hrs(m.unusedDedicated)} />
      <TipRow k="Discounted" v={hrs(m.discounted)} />
      <TipRow k="Internal" v={hrs(m.internalProject + m.internalOther)} />
      <div style={s.tipSep} />
      <TipRow k="Billable" v={hrs(m.billable)} accent />
      <TipRow k="Working hours" v={hrs(m.capacity)} />
      <TipRow k="Utilization" v={pct(m.utilization)} accent />
      <TipRow k="% of billable work" v={pct(m.billableShare)} />
      {m.inProgress && (
        <div style={s.tipNote}>
          Counts the {workingDaysElapsed(m.month, asOf)} working days with entries so far.
        </div>
      )}
    </>
  );

  return (
    <div style={s.wrap}>
      <style>{UTIL_CSS}</style>
      <div style={s.title}>Utilization</div>
      <div style={s.sub}>
        Billable hours against the hours each consultant was available to work.
      </div>

      <div style={s.filters}>
        <div style={s.fg}>
          <label style={s.label} htmlFor="ut-from">Period</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <select id="ut-from" style={s.select} value={from ?? ''} onChange={(e) => setFrom(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <span style={{ color: '#6b7280', fontSize: 12.5 }}>to</span>
            <select id="ut-to" style={s.select} value={to ?? ''} onChange={(e) => setTo(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
        </div>
        <div style={s.fg}>
          <label style={s.label} htmlFor="ut-rep">Consultant</label>
          <select id="ut-rep" style={s.select} value={consultant} onChange={(e) => setConsultant(e.target.value)}>
            <option value="all">All consultants</option>
            {consultants.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {openMonth && (
        <div style={s.banner}>
          <span aria-hidden="true">◐</span>
          <span>
            {monthLabel(months[months.length - 1])} is open. Measured through {dayLabel(dataThrough)};
            bankable hours post at month end.
          </span>
        </div>
      )}

      <div style={s.tiles}>
        <Tile
          lead
          lab={<>Utilization<InfoDot label="About utilization" content={<div style={s.tipNote}>{UTIL_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={pct(totals.utilization)}
          foot={`${hrs(totals.rosterBillable)} of ${hrs(totals.capacity)} working hours`}
        />
        <Tile
          lab={<>Billable hours<InfoDot label="About billable hours" content={<div style={s.tipNote}>{BILLABLE_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={hrs(totals.billable)}
          foot={`${period} · ${scopeLabel}${perMonth}`}
        />
        <Tile
          lab={<>Working hours<InfoDot label="About working hours" content={<div style={s.tipNote}>{WORKING_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={hrs(totals.capacity)}
          foot={capacityFoot()}
        />
        <Tile
          lab={<>% of billable work<InfoDot label="About percent of billable work" content={<div style={s.tipNote}>{SHARE_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={pct(totals.billableShare)}
          foot={`of ${hrs(totals.total)} hours logged`}
        />
        <Tile
          lab={<>Bankable<InfoDot label="About bankable hours" content={<div style={s.tipNote}>{BANKABLE_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={hrs(totals.unusedDedicated)}
          foot="unused dedicated time"
        />
        <Tile
          lab={<>Discounted<InfoDot label="About discounted hours" content={<div style={s.tipNote}>{DISCOUNTED_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={hrs(totals.discounted)}
          foot="written off on tickets"
        />
        <Tile
          lab={<>Internal<InfoDot label="About internal hours" content={<div style={s.tipNote}>{INTERNAL_TIP}</div>} onShow={showTip} onHide={hideTip} /></>}
          big={hrs(totals.internalProject + totals.internalOther)}
          foot={`${hrs(totals.internalProject)} on internal projects`}
        />
        <Tile lab="Billed" big={hrs(totals.billed)} foot="dedicated and pay-per-use, as invoiced" />
      </div>

      <div style={s.panel}>
        <div style={s.phead}>
          <div style={s.ph2}>Hours by month</div>
          <div style={s.phsub}>Where the logged hours went, for {scopeLabel}. Hover a bar for the breakdown.</div>
        </div>
        <div style={s.pbody}>
          <div style={s.chart}>
            {monthly.length === 0 && <div style={s.note2}>No hours in this selection.</div>}
            {monthly.map((m) => {
              const h = (v) => `${(v / peak) * 100}%`;
              const internal = m.internalProject + m.internalOther;
              return (
                <div key={m.month} style={s.col}>
                  <div style={s.rate}>
                    {pct(m.utilization)}
                    {m.inProgress && <i style={s.provisionalDot} aria-hidden="true" />}
                  </div>
                  <div style={s.sub2}>{hrs(m.billable)}h</div>
                  <div
                    style={{ ...s.stack, height: h(m.total) }}
                    tabIndex={0}
                    role="img"
                    aria-label={summaryOf(m)}
                    onMouseEnter={(e) => showTip(e, monthTip(m))}
                    onFocus={(e) => showTip(e, monthTip(m))}
                    onMouseLeave={hideTip}
                    onBlur={hideTip}
                  >
                    {m.billable > 0 && <i style={{ display: 'block', height: `${(m.billable / m.total) * 100}%`, background: BILLABLE }} />}
                    {m.unusedDedicated > 0 && <i style={{ display: 'block', height: `${(m.unusedDedicated / m.total) * 100}%`, background: BANKABLE }} />}
                    {m.discounted > 0 && <i style={{ display: 'block', height: `${(m.discounted / m.total) * 100}%`, background: DISCOUNTED }} />}
                    {internal > 0 && <i style={{ display: 'block', height: `${(internal / m.total) * 100}%`, background: INTERNAL }} />}
                  </div>
                  <div style={s.baseline} />
                  <div style={s.xlab}>{monthShort(m.month)}</div>
                </div>
              );
            })}
          </div>
          <div style={s.legend}>
            <span><i style={s.swatch(BILLABLE)} />Billable</span>
            <span><i style={s.swatch(BANKABLE)} />Bankable</span>
            <span><i style={s.swatch(DISCOUNTED)} />Discounted</span>
            <span><i style={s.swatch(INTERNAL)} />Internal</span>
            <span><i style={s.swatchDot(PROVISIONAL)} />Month still open</span>
          </div>
          <div style={s.note}>Percentage above each bar is utilization. Height is hours logged.</div>
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.phead}>
          <div style={s.ph2}>% of billable work</div>
          <div style={s.phsub}>Billable share of the hours logged, for {scopeLabel}.</div>
        </div>
        <div style={s.pbody}>
          {monthly.length === 0 && <div style={s.note2}>No hours in this selection.</div>}
          {monthly.map((m) => (
            <div key={m.month} style={s.shareRow}>
              <div style={s.shareLab}>
                {monthShort(m.month)}
                {m.inProgress && <i style={s.provisionalDot} aria-hidden="true" />}
              </div>
              <div style={s.shareBar}>
                <i style={{ display: 'block', height: '100%', width: `${m.billableShare ?? 0}%`, background: SHARE }} />
              </div>
              <div style={s.shareVal}>{pct(m.billableShare)}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.phead}>
          <div style={s.ph2}>Where the hours went</div>
          <div style={s.phsub}>{period}, {scopeLabel}.</div>
        </div>
        <div style={s.pbody}>
          {totals.total === 0 && <div style={s.note2}>No hours in this selection.</div>}
          {totals.total > 0 && mix.map((b) => (
            <div key={b.key} style={s.mixRow}>
              <div>
                <div style={s.mixLab}>{b.label}</div>
                <div style={s.mixCount}>{hrs(b.hours)}h</div>
              </div>
              <div style={s.mixBar}>
                <i
                  style={{
                    display: 'block', height: '100%', width: `${(b.hours / totals.total) * 100}%`,
                    background: { billable: BILLABLE, unused: BANKABLE, discounted: DISCOUNTED }[b.key] ?? INTERNAL,
                  }}
                />
              </div>
              <div style={s.mixVal}>
                <strong style={{ fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{pct(b.share)}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.panel}>
        <div style={s.phead}>
          <div style={s.ph2}>By consultant</div>
          <div style={s.phsub}>{period}. Click a column to sort. Hours, not headcount.</div>
        </div>
        <div style={s.scroll}><table style={s.table} aria-label="Utilization by consultant">
          <thead>
            <tr>
              {REP_COLS.map((c) => (
                <SortTh key={c.key} col={c} sort={repSort} onShow={showTip} onHide={hideTip} />
              ))}
            </tr>
          </thead>
          <tbody>
            {reps.length === 0 && (
              <tr><td style={s.td} colSpan={REP_COLS.length}><div style={s.note2}>No hours in this selection.</div></td></tr>
            )}
            {reps.map((r) => (
              <tr key={r.consultant}>
                <td style={s.td}>{r.consultant}</td>
                <td style={{ ...s.td, ...s.tdn }}>{hrs(r.billed)}</td>
                <td style={{ ...s.td, ...s.tdn }}>{hrs(r.free)}</td>
                <td style={{ ...s.td, ...s.tdn, color: BANKABLE }}>{hrs(r.unusedDedicated)}</td>
                <td style={{ ...s.td, ...s.tdn, color: DISCOUNTED }}>{hrs(r.discounted)}</td>
                <td style={{ ...s.td, ...s.tdn, color: INTERNAL }}>{hrs(r.internalProject + r.internalOther)}</td>
                <td style={{ ...s.td, ...s.tdn, color: '#6b7280' }}>{hrs(r.total)}</td>
                <td style={{ ...s.td, ...s.tdn, fontWeight: 700 }}>{hrs(r.billable)}</td>
                <td style={{ ...s.td, ...s.tdn, color: '#6b7280' }}>{r.capacity ? hrs(r.capacity) : '—'}</td>
                <td style={{ ...s.td, ...s.tdn, color: SHARE }}>{r.total ? pct(r.billableShare) : '—'}</td>
                <td style={s.td}>
                  <div style={s.meter}>
                    <div style={s.track}>
                      <div style={{ height: '100%', width: `${((r.utilization ?? 0) / bestUtil) * 100}%`, background: BILLABLE, borderRadius: 3 }} />
                    </div>
                    <span style={{ ...s.mono, minWidth: 48 }}>{r.capacity ? pct(r.utilization) : '—'}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <div style={{ padding: '0 18px 16px' }}>
          <div style={s.note}>
            No working hours means no attendance record this period.
          </div>
        </div>
      </div>

      {tip && (
        <div
          role="tooltip"
          style={{
            ...s.tip,
            left: Math.min(Math.max(tip.x, 145), (typeof window === 'undefined' ? 1200 : window.innerWidth) - 145),
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
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(120px, 170px) 1fr', gap: '11px 18px', fontSize: 13.5 }}>
            {DEFINITIONS.map(([term, def]) => (
              <Fragment key={term}>
                <dt style={{ fontWeight: 700, color: '#1a1a1a' }}>{term}</dt>
                <dd style={{ margin: 0, color: '#4b5563', lineHeight: 1.5 }}>{def}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      </details>

      <div style={{ ...s.note, borderTop: '1px solid #e2e5e9', paddingTop: 14 }}>
        Counts logged time entries only. See <code>docs/ps-utilization.md</code>.
      </div>
    </div>
  );
}

function Tile({ lab, big, foot, lead }) {
  return (
    <div style={lead ? s.tileLead : s.tile}>
      <div style={s.tileLab}>{lab}</div>
      <div style={s.tileBig}>{big}</div>
      <div style={s.tileFoot}>{foot}</div>
    </div>
  );
}
