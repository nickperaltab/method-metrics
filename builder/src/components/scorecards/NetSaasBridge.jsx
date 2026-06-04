import { useMemo, useState } from 'react';

// Per-bar palette (richer than the Phase 2 three-color set): each movement gets
// a distinct hue, totals are neutral grey, the closing total is green.
const BAR_COLORS = {
  start: '#9ca3af',     // grey
  new: '#2563eb',       // blue
  expansion: '#7c3aed', // purple
  downgrade: '#b45309', // gold/amber
  churn: '#dc2626',     // red
  end: '#059669',       // green
};
const COLOR_TOTAL = '#9ca3af';
const COLOR_POSITIVE = '#059669';
const COLOR_NEGATIVE = '#dc2626';
const COLOR_HIDDEN = '#2a3138';       // faint slab for lens-excluded bars
const COLOR_GRID = '#e5e7eb';

// Group definitions: which delta keys live under each bracket.
const GROUPS = [
  { label: 'ADDED', keys: ['new', 'expansion'] },
  { label: 'RETENTION LOSS', keys: ['downgrade', 'churn'] },
];

// Plot geometry.
const PLOT_HEIGHT = 320;   // px of vertical space for the bars
const BRACKET_BAND = 40;   // px reserved above the plot for group brackets
const LABEL_BAND = 26;     // px reserved above each bar for value labels
const AXIS_PAD_BOTTOM = 22; // px for x-axis category labels
const BAR_WIDTH_RATIO = 0.56; // bar width as a fraction of its column slot

// Compact currency formatter, e.g. $1.2M / $120K / -$45K / $0.
function formatUsd(v) {
  if (v == null || isNaN(v)) return '';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

// Signed percent label, e.g. "+12%" / "−23%". Uses a real minus glyph.
function formatPct(pct) {
  if (pct == null || isNaN(pct)) return '';
  const rounded = Math.round(pct * 100);
  if (rounded === 0) return '0%';
  return rounded > 0 ? `+${rounded}%` : `−${Math.abs(rounded)}%`;
}

const fontMono = "'JetBrains Mono', monospace";
const fontSans = "'DM Sans', sans-serif";

/**
 * L1 Net SaaS grouped waterfall (bridge), rendered as div/SVG for crisp
 * connectors and brackets (cleaner than ECharts for this layout).
 *
 * @param {object} props
 * @param {Array<{key,label,type,value,visible,pct}>} props.bars - output of
 *   applyLens(normalizeBridge(...)). Signs already applied (downgrade/churn
 *   negative). `visible` flags lens-included delta bars; `pct` is % of Start
 *   for dual-label lenses (null otherwise). Dual labels ($ + %) render whenever
 *   a visible delta bar carries a pct. For interim compatibility with the
 *   pre-Task-6 controller, `visible` may be undefined (treated as true) and
 *   `pct` may be undefined (treated as null).
 * @param {'netSaas'|'nrr'|'grr'} [props.lens] - active lens (label-mode hint).
 * @param {(key:string)=>void} props.onBarClick - called with bar key when a
 *   visible delta bar is clicked.
 */
export default function NetSaasBridge({ bars, lens, onBarClick }) {
  const [hovered, setHovered] = useState(null); // bar key being hovered

  const model = useMemo(() => {
    if (!bars || bars.length === 0) return null;

    // Graceful-undefined: undefined visible -> true, undefined pct -> null.
    const norm = bars.map((b) => ({
      ...b,
      visible: b.visible === undefined ? true : !!b.visible,
      pct: b.pct === undefined ? null : b.pct,
    }));

    // Dual mode ($ AND %) whenever a visible delta bar carries a pct (% of
    // Start). Driven by the bar data, not the lens key, so any dual-labelMode
    // lens renders %.
    const dualMode = norm.some((b) => b.type === 'delta' && b.pct != null);

    // y-scale: fixed baseline, y-max ~1.2x the largest total (Start/End).
    const totals = norm.filter((b) => b.type === 'total').map((b) => Math.abs(b.value));
    const peak = totals.length ? Math.max(...totals) : Math.max(1, ...norm.map((b) => Math.abs(b.value)));
    const yMax = peak * 1.2 || 1;
    const pxPerDollar = PLOT_HEIGHT / yMax;

    // Running total advances only on VISIBLE delta bars; totals reset/anchor it.
    let running = 0;
    const placed = norm.map((bar) => {
      if (bar.type === 'total') {
        const height = Math.abs(bar.value) * pxPerDollar;
        running = bar.value;
        return { ...bar, bottom: 0, height, top: height };
      }
      if (!bar.visible) {
        // Hidden bar: keep a faint placeholder slab near the current running
        // line so the column slot stays, but don't move the running total.
        const slab = 18;
        const bottom = Math.max(0, running * pxPerDollar - slab / 2);
        return { ...bar, bottom, height: slab, top: bottom + slab, hidden: true };
      }
      // Visible delta: float between running_before and running_after.
      const before = running;
      const after = running + bar.value; // value signed
      running = after;
      const lo = Math.min(before, after);
      const hi = Math.max(before, after);
      const bottom = lo * pxPerDollar;
      const height = (hi - lo) * pxPerDollar;
      return { ...bar, bottom, height, top: bottom + height, runBefore: before, runAfter: after };
    });

    // Group brackets: only over groups with >=1 visible bar under this lens.
    const groups = GROUPS.map((g) => {
      const members = placed.filter((b) => g.keys.includes(b.key) && b.visible && !b.hidden);
      if (members.length === 0) return null;
      const subtotal = members.reduce((s, b) => s + b.value, 0);
      const firstIdx = placed.findIndex((b) => b.key === members[0].key);
      const lastIdx = placed.findIndex((b) => b.key === members[members.length - 1].key);
      return { label: g.label, subtotal, firstIdx, lastIdx };
    }).filter(Boolean);

    return { placed, dualMode, pxPerDollar, yMax, n: placed.length, groups };
  }, [bars, lens]);

  if (!model) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', minHeight: 200, color: '#9ca3af', fontSize: 13,
        fontFamily: fontSans,
      }}>
        No data for this month
      </div>
    );
  }

  const { placed, dualMode, n, groups } = model;

  // Column geometry in CSS percentages (responsive width). Each bar gets an
  // equal slot; the bar is centered within its slot at BAR_WIDTH_RATIO width.
  const slotPct = 100 / n;
  const barWidthPct = slotPct * BAR_WIDTH_RATIO;
  const slotCenter = (i) => (i + 0.5) * slotPct;
  const slotLeftEdge = (i) => slotCenter(i) - barWidthPct / 2;
  const slotRightEdge = (i) => slotCenter(i) + barWidthPct / 2;

  // Total stack height: brackets band + labels band + plot + axis.
  const stackHeight = BRACKET_BAND + LABEL_BAND + PLOT_HEIGHT + AXIS_PAD_BOTTOM;
  // y from the top of the SVG to a given px-from-baseline value.
  const plotTop = BRACKET_BAND + LABEL_BAND;
  const baselineY = plotTop + PLOT_HEIGHT;
  const yOf = (pxFromBaseline) => baselineY - pxFromBaseline;

  // Visible delta bars in order — used to draw connectors between consecutive
  // visible bars (totals included, hidden excluded).
  const connectorSeq = placed
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.type === 'total' || (b.visible && !b.hidden));

  const colorFor = (bar) => {
    if (bar.hidden) return COLOR_HIDDEN;
    if (BAR_COLORS[bar.key]) return BAR_COLORS[bar.key];
    if (bar.type === 'total') return COLOR_TOTAL;
    return bar.value >= 0 ? COLOR_POSITIVE : COLOR_NEGATIVE;
  };

  return (
    <div style={{ position: 'relative', width: '100%', fontFamily: fontSans, userSelect: 'none' }}>
      <svg
        viewBox={`0 0 1000 ${stackHeight}`}
        preserveAspectRatio="none"
        width="100%"
        height={stackHeight}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* baseline */}
        <line
          x1="0" y1={baselineY} x2="1000" y2={baselineY}
          stroke={COLOR_GRID} strokeWidth="1"
        />

        {/* horizontal dashed connectors at the shared running-total height
            between consecutive visible bars (right edge of N -> left edge N+1) */}
        {connectorSeq.slice(0, -1).map(({ b, i }, k) => {
          const next = connectorSeq[k + 1];
          // Shared height = where bar N "ends" and bar N+1 "begins".
          // For totals that's their top; for deltas it's runAfter (N) /
          // runBefore (N+1) — which are equal by construction.
          const sharedPx =
            b.type === 'total' ? b.height : b.runAfter * model.pxPerDollar;
          const y = yOf(sharedPx);
          const x1 = (slotRightEdge(i) / 100) * 1000;
          const x2 = (slotLeftEdge(next.i) / 100) * 1000;
          return (
            <line
              key={`conn-${i}`}
              x1={x1} y1={y} x2={x2} y2={y}
              stroke="#9ca3af" strokeWidth="1" strokeDasharray="4 3"
              opacity="0.7"
            />
          );
        })}

        {/* group brackets */}
        {groups.map((g) => {
          const x1 = (slotLeftEdge(g.firstIdx) / 100) * 1000;
          const x2 = (slotRightEdge(g.lastIdx) / 100) * 1000;
          const cx = (x1 + x2) / 2;
          const by = BRACKET_BAND - 6; // bottom of bracket line
          const ty = by - 8;           // top of the little end ticks
          return (
            <g key={`grp-${g.label}`}>
              <path
                d={`M ${x1} ${by} L ${x1} ${ty} M ${x1} ${ty} L ${x2} ${ty} M ${x2} ${ty} L ${x2} ${by}`}
                stroke="#6b7280" strokeWidth="1" fill="none"
              />
              <text
                x={cx} y={ty - 5} textAnchor="middle"
                fontFamily={fontSans} fontSize="11" fontWeight="700"
                fill="#374151" letterSpacing="0.06em"
              >
                {g.label}
                <tspan dx="6" fontFamily={fontMono} fontWeight="600" fill="#6b7280">
                  {formatUsd(g.subtotal)}
                </tspan>
              </text>
            </g>
          );
        })}
      </svg>

      {/* Bars + labels as absolutely-positioned divs over the SVG. Using px-
          based vertical positioning keyed to the same baseline as the SVG. */}
      <div style={{ position: 'absolute', inset: 0, top: 0 }}>
        {placed.map((bar, i) => {
          const isClickable = bar.type === 'delta' && bar.visible && !bar.hidden;
          const fill = colorFor(bar);

          // Vertical placement: bar top edge (px from SVG top).
          const barTopY = plotTop + (PLOT_HEIGHT - bar.top);
          const barH = Math.max(bar.hidden ? bar.height : Math.max(bar.height, 2), 1);

          // Label line(s) above the bar.
          let lineMain = '';
          let lineSub = '';
          if (!bar.hidden) {
            if (bar.type === 'total') {
              lineMain = formatUsd(bar.value);
            } else if (dualMode) {
              lineMain = formatUsd(bar.value);
              lineSub = formatPct(bar.pct);
            } else {
              lineMain = formatUsd(bar.value);
            }
          }

          return (
            <div
              key={bar.key}
              style={{
                position: 'absolute',
                left: `${slotLeftEdge(i)}%`,
                width: `${barWidthPct}%`,
                top: 0,
                bottom: 0,
              }}
              onMouseEnter={() => setHovered(bar.key)}
              onMouseLeave={() => setHovered((h) => (h === bar.key ? null : h))}
            >
              {/* label stack above the bar */}
              {!bar.hidden && (
                <div style={{
                  position: 'absolute',
                  bottom: `calc(100% - ${barTopY}px + 4px)`,
                  left: 0, right: 0,
                  textAlign: 'center',
                  lineHeight: 1.15,
                  pointerEvents: 'none',
                }}>
                  <div style={{
                    fontFamily: fontMono, fontSize: 12, fontWeight: 600,
                    color: bar.type === 'total' ? '#374151' : fill,
                    whiteSpace: 'nowrap',
                  }}>
                    {lineMain}
                  </div>
                  {lineSub && (
                    <div style={{
                      fontFamily: fontMono, fontSize: 11, fontWeight: 500,
                      color: '#6b7280', whiteSpace: 'nowrap',
                    }}>
                      {lineSub}
                    </div>
                  )}
                </div>
              )}

              {/* the bar itself */}
              <div
                onClick={isClickable ? () => onBarClick && onBarClick(bar.key) : undefined}
                style={{
                  position: 'absolute',
                  top: `${barTopY}px`,
                  left: 0, right: 0,
                  height: `${barH}px`,
                  background: fill,
                  opacity: bar.hidden ? 0.28 : 1,
                  borderRadius: 2,
                  cursor: isClickable ? 'pointer' : 'default',
                  border: bar.hidden ? '1px dashed #4b5563' : 'none',
                  transition: 'filter 120ms ease, opacity 120ms ease',
                  filter: hovered === bar.key && isClickable ? 'brightness(1.12)' : 'none',
                  boxShadow: isClickable ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
                }}
              />

              {/* hidden-bar label */}
              {bar.hidden && (
                <div style={{
                  position: 'absolute',
                  top: `${barTopY - 16}px`,
                  left: 0, right: 0,
                  textAlign: 'center',
                  fontFamily: fontSans, fontSize: 9, fontStyle: 'italic',
                  color: '#9ca3af', whiteSpace: 'nowrap', pointerEvents: 'none',
                }}>
                  hidden
                </div>
              )}

              {/* x-axis category label */}
              <div style={{
                position: 'absolute',
                top: `${baselineY + 6}px`,
                left: 0, right: 0,
                textAlign: 'center',
                fontFamily: fontSans, fontSize: 10, fontWeight: 600,
                color: bar.hidden ? '#9ca3af' : '#4b5563',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                pointerEvents: 'none',
              }}>
                {bar.label}
              </div>

              {/* hover tooltip (lightweight CSS popover) for visible bars */}
              {hovered === bar.key && !bar.hidden && (
                <div style={{
                  position: 'absolute',
                  top: `${barTopY - 8}px`,
                  left: '50%',
                  transform: 'translate(-50%, -100%)',
                  background: '#111827',
                  color: '#f9fafb',
                  padding: '6px 9px',
                  borderRadius: 6,
                  fontSize: 11,
                  lineHeight: 1.4,
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                  zIndex: 10,
                  pointerEvents: 'none',
                }}>
                  <div style={{ fontWeight: 700, marginBottom: 2, fontFamily: fontSans }}>
                    {bar.label}
                  </div>
                  <div style={{ fontFamily: fontMono }}>{formatUsd(bar.value)}</div>
                  {bar.pct != null && (
                    <div style={{ fontFamily: fontMono, color: '#9ca3af' }}>
                      {formatPct(bar.pct)} of Start
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
