import React, { useMemo, useState } from 'react';
import { buildPaceRows } from '../../lib/methodMondayPace';
import ScorecardSection from '../scorecards/ScorecardSection';

/**
 * Method Monday — shared-axis pace view. Page-scoped: this component is not
 * used by any other scorecard and does not touch components/scorecards/
 * (ScorecardSection / KpiTile / KpiColumn / utils.js), which is where the
 * 3289%-scale bug and the NULL-renders-as-0% bug live. All formatting and
 * normalization logic here is new and lives in lib/methodMondayPace.js.
 * ScorecardSection itself is imported and used UNMODIFIED — it's the
 * existing detail-tile renderer, reused rather than copied (see below).
 *
 * ── Progressive disclosure (2026-08-14, round 2) ─────────────────────
 * Default state: seven rows, one number each — name, bar, attainment %.
 * Nothing else. Clicking a row expands that metric's existing detail tiles
 * underneath it; clicking again collapses. Multiple rows can be open at
 * once (comparing two metrics is a real use, so this is not an accordion
 * that closes the previous selection). Expansion state is local component
 * state — not persisted anywhere.
 *
 * `detailSections` are the same 7 per-metric config sections that used to
 * render unconditionally above (Sync %, Trials, Syncs, Conversions,
 * Conversion Rate, Sync Conversion Rate, Churn) — see the `renderedBy`
 * note in method-monday-scorecard.js. They are matched to a pace row by
 * title === row.label and rendered via the real <ScorecardSection>, so the
 * expanded detail is exactly the tile group that existed before, not a
 * second copy of it.
 */

const AXIS_MAX = 150;
const ON_PACE_X = (100 / AXIS_MAX) * 100; // % position of the 100% rule on the track

// Every row (chevron / label / track / attainment) shares this grid so the
// footer caption below can stay aligned with the rule at any container width.
const ROW_GRID = '20px 160px 1fr 90px';

const BAND_COLORS = {
  green: '#059669',
  amber: '#b45309',
  red: '#dc2626',
  unknown: '#d1d5db',
};

const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";

function formatAttainment(value) {
  if (value == null || Number.isNaN(value)) return 'No data';
  return `${value.toFixed(1)}%`;
}

/**
 * Pure set-toggle for expansion state: add `key` if absent, remove if
 * present. Exported so the "two rows open simultaneously" / "toggling one
 * row doesn't affect another" behavior is directly unit-testable without a
 * DOM — this app has no jsdom/testing-library dependency installed, so
 * component tests here work through this pure function plus
 * renderToStaticMarkup structural checks on <PaceRow> in isolation, rather
 * than simulated click/keyboard events.
 */
export function toggleOpenKey(openKeys, key) {
  const next = new Set(openKeys);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * Exported (not just used internally) so tests can render one row directly
 * with an explicit `isOpen` prop, independent of the parent's useState —
 * see toggleOpenKey's comment for why.
 */
export function PaceRow({ row, isOpen, onToggle, detailSection, dataMap, onMetricClick }) {
  const [hovered, setHovered] = useState(false);
  const barWidthPct = row.attainment == null
    ? 0
    : Math.max(0, Math.min(row.attainment, AXIS_MAX)) / AXIS_MAX * 100;
  const color = BAND_COLORS[row.band];
  const detailId = `method-monday-pace-detail-${row.key}`;

  return (
    <div style={{ borderBottom: '1px solid #f1f3f5' }}>
      {/*
        A real <button>, per the task's a11y requirement — native Enter/Space
        activation and focus handling for free, no reimplemented keydown
        logic. Affordance follows two patterns already in this codebase:
        the hover background swap from KpiTile.jsx (components/scorecards/),
        and the rotating "›" chevron from MetricInspector.jsx's
        accordionTrigger (components/scorecards/, read for pattern only —
        neither file is imported or modified here).
      */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={detailId}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'grid',
          gridTemplateColumns: ROW_GRID,
          alignItems: 'center',
          gap: 16,
          width: '100%',
          padding: '10px 8px',
          margin: 0,
          border: 'none',
          borderRadius: 6,
          background: hovered ? '#f0f4ff' : 'transparent',
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'left',
          transition: 'background 150ms ease-out',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            color: '#9ca3af',
            fontSize: 16,
            fontFamily: 'monospace',
            transform: isOpen ? 'rotate(90deg)' : 'none',
            transition: 'transform 150ms ease-out',
          }}
        >
          ›
        </span>

        <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', fontFamily: fontSans }}>
          {row.label}
        </span>

        <span style={{ position: 'relative', height: 20, background: '#f3f4f6', borderRadius: 4 }}>
          {/* Danger-zone tint: for an inverted metric (churn), the region
              past the 100% rule is the harmful direction, shaded whether or
              not the bar currently reaches it. Explanation of WHY lives in
              the expanded detail section's header, not as extra text here —
              the collapsed row shows name, bar, percentage and nothing else. */}
          {row.inverted && (
            <span
              style={{
                position: 'absolute',
                left: `${ON_PACE_X}%`,
                right: 0,
                top: 0,
                bottom: 0,
                background: 'rgba(220, 38, 38, 0.08)',
                borderRadius: '0 4px 4px 0',
              }}
            />
          )}
          <span
            style={{
              position: 'absolute',
              left: `${ON_PACE_X}%`,
              top: -2,
              bottom: -2,
              width: 1,
              background: '#9ca3af',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${barWidthPct}%`,
              background: color,
              borderRadius: 4,
              transition: 'width 200ms ease-out',
            }}
          />
        </span>

        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: fontMono, color, textAlign: 'right' }}>
          {formatAttainment(row.attainment)}
        </span>
      </button>

      {isOpen && detailSection && (
        <div id={detailId} style={{ padding: '4px 8px 20px 36px' }}>
          {row.inverted && (
            <div style={{ fontSize: 12, color: '#b45309', fontFamily: fontSans, marginBottom: 8 }}>
              Inverted metric: for {row.label.toLowerCase()}, more than forecast is bad, not good.
            </div>
          )}
          <ScorecardSection
            section={detailSection}
            dataMap={dataMap}
            onMetricClick={onMetricClick}
          />
        </div>
      )}
    </div>
  );
}

export default function MethodMondayPaceView({ dataMap, detailSections = [], onMetricClick }) {
  const rows = buildPaceRows(dataMap);
  const [openKeys, setOpenKeys] = useState(() => new Set());

  const sectionByTitle = useMemo(
    () => new Map(detailSections.map((s) => [s.title, s])),
    [detailSections]
  );

  function toggle(key) {
    setOpenKeys((prev) => toggleOpenKey(prev, key));
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e2e5e9',
        borderRadius: 8,
        padding: '20px 24px 12px',
      }}
    >
      <div style={{ fontSize: 12, color: '#9ca3af', fontFamily: fontSans, marginBottom: 16 }}>
        Attainment = trajectory ÷ full-month forecast, sorted worst-first. Churn inverts —
        a longer bar is worse for churn, unlike every other row. Click a row for detail.
      </div>

      {rows.map((row) => (
        <PaceRow
          key={row.key}
          row={row}
          isOpen={openKeys.has(row.key)}
          onToggle={() => toggle(row.key)}
          detailSection={sectionByTitle.get(row.label)}
          dataMap={dataMap}
          onMetricClick={onMetricClick}
        />
      ))}

      {/* Footer caption shares ROW_GRID + ON_PACE_X with the rows above, so
          the "100% on pace" label stays under the rule it names at any
          container width instead of drifting via a hardcoded margin. */}
      <div style={{ display: 'grid', gridTemplateColumns: ROW_GRID, gap: 16, padding: '8px 8px 4px' }}>
        <div />
        <div />
        <div style={{ position: 'relative', height: 14 }}>
          <div
            style={{
              position: 'absolute',
              left: `${ON_PACE_X}%`,
              transform: 'translateX(-50%)',
              fontSize: 11,
              color: '#9ca3af',
              fontFamily: fontSans,
              whiteSpace: 'nowrap',
            }}
          >
            100% on pace
          </div>
        </div>
        <div />
      </div>
    </div>
  );
}
