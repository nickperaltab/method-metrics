import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
// Side-effect import: registers the 'method' ECharts theme + chart/component
// modules (echarts.use([...])) so `theme="method"` below resolves.
import '../EChart';

const fontMono = "'JetBrains Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

const COLOR_MRR = '#059669';   // green
const COLOR_SEATS = '#3b6ea5'; // blue
const COLOR_APPS = '#7c3aed';  // purple
const COLOR_GREY = '#6b7280';

// Lifecycle event styling: label + a subtle distinct color per event.
const LIFECYCLE_EVENTS = [
  { key: 'signup', label: 'Signup', color: '#9ca3af' },      // grey
  { key: 'firstSync', label: 'First sync', color: '#3b6ea5' }, // blue
  { key: 'firstInvoice', label: 'First invoice', color: '#059669' }, // green
  { key: 'cancelled', label: 'Cancelled', color: '#dc2626' }, // red
];

// Compact currency, e.g. $1.2M / $120K / $0 / -$45K.
function formatUsd(v) {
  if (v == null || isNaN(v)) return '';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-01' (or any 'YYYY-MM-..') -> "Jan '24". Returns the raw input on
// anything it can't parse so the chart still renders a (less pretty) label.
function monthLabel(monthStr) {
  if (!monthStr || typeof monthStr !== 'string') return '';
  const m = monthStr.match(/^(\d{4})-(\d{2})/);
  if (!m) return monthStr;
  const year = m[1];
  const mon = parseInt(m[2], 10);
  if (mon < 1 || mon > 12) return monthStr;
  return `${MONTHS[mon - 1]} '${year.slice(2)}`;
}

// A 'YYYY-MM-DD' date -> its 'YYYY-MM' key, or null if unparseable/null.
function monthKeyOf(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const m = dateStr.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

// Map a lifecycle 'YYYY-MM-DD' date to an x-axis category label.
// Strategy: compute the date's 'YYYY-MM'. If a history month shares that key,
// use its category label. Otherwise snap to the history month closest in time
// (by absolute month distance). Returns null if no usable match.
function categoryForDate(dateStr, monthMeta) {
  const key = monthKeyOf(dateStr);
  if (!key || !monthMeta.length) return null;
  // exact match first
  const exact = monthMeta.find((mm) => mm.key === key);
  if (exact) return exact.label;
  // snap to nearest by month-index distance
  const target = monthIndex(key);
  if (target == null) return null;
  let best = null;
  let bestDist = Infinity;
  for (const mm of monthMeta) {
    if (mm.idx == null) continue;
    const dist = Math.abs(mm.idx - target);
    if (dist < bestDist) { bestDist = dist; best = mm; }
  }
  return best ? best.label : null;
}

// 'YYYY-MM' -> a comparable integer (year * 12 + month). null if unparseable.
function monthIndex(key) {
  if (!key) return null;
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 12 + (parseInt(m[2], 10) - 1);
}

/**
 * Dual-axis account-history timeline.
 *
 * @param {object} props
 * @param {{Company:string, Segment?:string, UserTier?:string}} props.account
 * @param {Array<{month:string, mrr:number, seats:number, apps:number}>} props.history
 *   ascending by month; month is 'YYYY-MM-01'. May be empty.
 * @param {{signup?:string|null, firstSync?:string|null, firstInvoice?:string|null, cancelled?:string|null}} props.lifecycle
 */
export default function AccountDetail({ account, history, lifecycle }) {
  const acct = account || {};
  const rows = Array.isArray(history) ? history : [];
  const lc = lifecycle || {};

  // Per-month metadata: category label + comparable month index. Stable across
  // the chart option + markLine mapping.
  const monthMeta = useMemo(
    () => rows.map((r) => ({
      key: monthKeyOf(r.month),
      label: monthLabel(r.month),
      idx: monthIndex(monthKeyOf(r.month)),
    })),
    [rows]
  );

  const option = useMemo(() => {
    if (!rows.length) return null;

    const categories = monthMeta.map((mm) => mm.label);
    const mrr = rows.map((r) => (r.mrr == null ? null : r.mrr));
    const seats = rows.map((r) => (r.seats == null ? null : r.seats));
    const apps = rows.map((r) => (r.apps == null ? null : r.apps));

    // Lifecycle markLines: one vertical dashed line per non-null event that
    // maps to a category on the x-axis.
    const markLineData = [];
    for (const ev of LIFECYCLE_EVENTS) {
      const dateStr = lc[ev.key];
      if (!dateStr) continue;
      const cat = categoryForDate(dateStr, monthMeta);
      if (!cat) continue;
      markLineData.push({
        xAxis: cat,
        lineStyle: { color: ev.color, type: 'dashed', width: 1.5 },
        label: {
          formatter: ev.label,
          color: ev.color,
          fontFamily: fontSans,
          fontSize: 10,
          fontWeight: 600,
          rotate: 90,
          position: 'insideEndTop',
        },
      });
    }

    return {
      grid: { top: 36, right: 56, bottom: 28, left: 64 },
      legend: {
        top: 0,
        data: ['MRR', 'Seats', 'Apps'],
        textStyle: { fontFamily: fontSans, fontSize: 12 },
      },
      tooltip: {
        trigger: 'axis',
        valueFormatter: undefined, // per-series formatting below
        formatter: (params) => {
          if (!params || !params.length) return '';
          const header = params[0].axisValueLabel || params[0].axisValue || '';
          const lines = params.map((p) => {
            const v = p.value;
            const shown = p.seriesName === 'MRR'
              ? formatUsd(v)
              : (v == null ? '—' : String(v));
            return `${p.marker}${p.seriesName}: ${shown}`;
          });
          return `<div style="font-family:${fontSans};font-weight:700;margin-bottom:2px">${header}</div>`
            + lines.map((l) => `<div style="font-family:${fontMono}">${l}</div>`).join('');
        },
      },
      xAxis: {
        type: 'category',
        data: categories,
        boundaryGap: false,
      },
      yAxis: [
        {
          type: 'value',
          name: '$',
          position: 'left',
          nameTextStyle: { color: COLOR_MRR, fontFamily: fontSans, fontSize: 11 },
          axisLabel: { formatter: (v) => formatUsd(v) },
        },
        {
          type: 'value',
          name: '#',
          position: 'right',
          nameTextStyle: { color: COLOR_SEATS, fontFamily: fontSans, fontSize: 11 },
          minInterval: 1,
          splitLine: { show: false },
          axisLabel: { formatter: (v) => (v == null ? '' : String(Math.round(v))) },
        },
      ],
      series: [
        {
          name: 'MRR',
          type: 'line',
          yAxisIndex: 0,
          data: mrr,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: COLOR_MRR, width: 2 },
          itemStyle: { color: COLOR_MRR },
          areaStyle: { color: COLOR_MRR, opacity: 0.08 },
          connectNulls: true,
          markLine: markLineData.length
            ? {
                symbol: 'none',
                silent: true,
                data: markLineData,
              }
            : undefined,
        },
        {
          name: 'Seats',
          type: 'line',
          yAxisIndex: 1,
          data: seats,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: COLOR_SEATS, width: 2 },
          itemStyle: { color: COLOR_SEATS },
          connectNulls: true,
        },
        {
          name: 'Apps',
          type: 'line',
          yAxisIndex: 1,
          data: apps,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: COLOR_APPS, width: 2 },
          itemStyle: { color: COLOR_APPS },
          connectNulls: true,
        },
      ],
    };
  }, [rows, monthMeta, lc]);

  // Header bits.
  const subline = [acct.Segment, acct.UserTier].filter(Boolean).join(' · ');
  const last = rows.length ? rows[rows.length - 1] : null;
  const currentLine = last
    ? `${formatUsd(last.mrr)} · ${last.seats == null ? '—' : last.seats} seats · ${last.apps == null ? '—' : last.apps} apps`
    : '';

  const chips = LIFECYCLE_EVENTS
    .map((ev) => (lc[ev.key] ? { label: ev.label, date: lc[ev.key], color: ev.color } : null))
    .filter(Boolean);

  return (
    <div style={{ width: '100%', fontFamily: fontSans }}>
      {/* Header */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
          {acct.Company || 'Account'}
        </div>
        {subline && (
          <div style={{ fontSize: 12, color: COLOR_GREY, marginTop: 1 }}>
            {subline}
          </div>
        )}
        {currentLine && (
          <div style={{ fontSize: 13, fontFamily: fontMono, color: '#374151', marginTop: 3 }}>
            {currentLine}
          </div>
        )}
        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {chips.map((c) => (
              <span
                key={c.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  color: '#374151',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: 999,
                  padding: '2px 8px',
                }}
              >
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: c.color, display: 'inline-block',
                }} />
                <span style={{ fontWeight: 600 }}>{c.label}</span>
                <span style={{ fontFamily: fontMono, color: COLOR_GREY }}>{c.date}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Chart or empty guard */}
      {option ? (
        <ReactECharts
          option={option}
          theme="method"
          style={{ height: 340, width: '100%' }}
          opts={{ renderer: 'canvas' }}
          notMerge={true}
        />
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 340, minHeight: 200, color: '#9ca3af', fontSize: 13,
          fontFamily: fontSans,
        }}>
          No history for this account
        </div>
      )}
    </div>
  );
}
