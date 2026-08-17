import React, { useMemo, useState } from 'react';
import { buildPaceRows } from '../../lib/methodMondayPace';
import ScorecardSection from '../scorecards/ScorecardSection';
import { FOCUSABLE, SrOnly } from '../scorecards/ui';
import { color, font, type, weight, radius, numeric, shadow } from '../../styles/tokens';

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

// Bar fill. `unknown` is a decorative empty-track marker, which is the only
// legitimate use of inkFaint — it fails AA and must never colour text.
const BAND_COLORS = {
  green: color.accent,
  amber: color.warning,
  red: color.negative,
  unknown: color.inkFaint,
};

// Text colour for the attainment figure. Identical to BAND_COLORS except on
// `unknown`, where the figure reads "No data" and has to be legible.
const BAND_TEXT_COLORS = {
  ...BAND_COLORS,
  unknown: color.inkMuted,
};

const fontSans = font.sans;

/**
 * A dash where there is no number, matching the KPI tiles. The dash alone is
 * silence to a screen reader, so the two halves are rendered separately and the
 * caller pairs them.
 */
function formatAttainment(value) {
  if (value == null || Number.isNaN(value)) return null;
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
  const [attainmentHovered, setAttainmentHovered] = useState(false);
  const barWidthPct = row.attainment == null
    ? 0
    : Math.max(0, Math.min(row.attainment, AXIS_MAX)) / AXIS_MAX * 100;
  const bandColor = BAND_COLORS[row.band];
  const bandTextColor = BAND_TEXT_COLORS[row.band];
  const detailId = `method-monday-pace-detail-${row.key}`;
  const attainment = formatAttainment(row.attainment);

  return (
    <div style={{ borderBottom: `1px solid ${color.borderSubtle}` }}>
      {/*
        Two SIBLING <button>s share one grid row, not one button nested
        inside another (invalid HTML, and the two actions — expand detail
        vs. inspect the attainment metric — need independent, unambiguous
        targets). The toggle button spans the first three grid columns with
        its own matching internal widths; the inspect button owns the
        fourth. A real <button>, per the task's a11y requirement — native
        Enter/Space activation and focus handling for free. Affordance
        follows two patterns already in this codebase: the hover background
        swap from KpiTile.jsx (components/scorecards/), and the rotating "›"
        chevron from MetricInspector.jsx's accordionTrigger
        (components/scorecards/, read for pattern only — neither file is
        imported or modified here).
      */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: ROW_GRID,
          alignItems: 'center',
          gap: 16,
          width: '100%',
        }}
      >
        <button
          type="button"
          className={FOCUSABLE}
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={detailId}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'grid',
            gridTemplateColumns: '20px 160px 1fr',
            alignItems: 'center',
            gap: 16,
            gridColumn: '1 / span 3',
            padding: '10px 8px',
            margin: 0,
            border: 'none',
            borderRadius: radius.control,
            background: hovered ? color.surfaceAlt : 'transparent',
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
              color: color.inkMuted,
              fontSize: 16,
              fontFamily: font.mono,
              transform: isOpen ? 'rotate(90deg)' : 'none',
              transition: 'transform 150ms ease-out',
            }}
          >
            ›
          </span>

          <span style={{ fontSize: type.body, fontWeight: weight.medium, color: color.ink, fontFamily: fontSans }}>
            {row.label}
          </span>

          <span style={{ position: 'relative', height: 20, background: color.surfaceAlt, borderRadius: 4 }}>
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
                  // 8% tint of color.negative; rgba() has no token form.
                  background: 'rgba(180, 35, 24, 0.08)',
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
                background: color.inkMuted,
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${barWidthPct}%`,
                background: bandColor,
                borderRadius: 4,
                transition: 'width 200ms ease-out',
              }}
            />
          </span>
        </button>

        {/* Distinct target from the toggle button above: clicking the
            attainment number opens MetricInspector for the registered
            metric behind it (row.attainmentMetricId), it does not expand
            the row. Falls back to a non-interactive span when the row has
            no registered attainment id or no click handler was wired. */}
        {row.attainmentMetricId != null && onMetricClick ? (
          <button
            type="button"
            className={FOCUSABLE}
            onClick={() => onMetricClick(row.attainmentMetricId, row.attainment, 'percent')}
            onMouseEnter={() => setAttainmentHovered(true)}
            onMouseLeave={() => setAttainmentHovered(false)}
            aria-label={`Inspect ${row.label} attainment metric`}
            style={{
              fontSize: 14,
              fontWeight: weight.medium,
              fontFamily: fontSans,
              color: bandTextColor,
              textAlign: 'right',
              background: attainmentHovered ? color.surfaceAlt : 'transparent',
              border: 'none',
              borderRadius: radius.control,
              padding: '10px 8px',
              margin: 0,
              cursor: 'pointer',
              ...numeric,
            }}
          >
            {attainment ?? (
              <>
                <span aria-hidden="true">—</span>
                <SrOnly>No data</SrOnly>
              </>
            )}
          </button>
        ) : (
          <span style={{
            fontSize: 14,
            fontWeight: weight.medium,
            fontFamily: fontSans,
            color: bandTextColor,
            textAlign: 'right',
            padding: '10px 8px',
            ...numeric,
          }}>
            {attainment ?? (
              <>
                <span aria-hidden="true">—</span>
                <SrOnly>No data</SrOnly>
              </>
            )}
          </span>
        )}
      </div>

      {isOpen && detailSection && (
        <div id={detailId} style={{ padding: '4px 8px 20px 36px' }}>
          {row.inverted && (
            <div style={{ fontSize: type.label, color: color.warning, fontFamily: fontSans, marginBottom: 8 }}>
              Inverted metric: more than forecast is bad for {row.label.toLowerCase()}.
            </div>
          )}
          <ScorecardSection
            section={detailSection}
            dataMap={dataMap}
            onMetricClick={onMetricClick}
            variant="plain"
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
        background: color.surface,
        border: `1px solid ${color.border}`,
        borderRadius: radius.card,
        boxShadow: shadow.card,
        padding: '20px 24px 12px',
      }}
    >
      <div style={{ fontSize: type.label, color: color.inkMuted, fontFamily: fontSans, marginBottom: 16 }}>
        Attainment = trajectory ÷ full-month forecast, sorted worst-first. Churn&apos;s bar is
        reversed: longer means worse.
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
              fontSize: type.label,
              color: color.inkMuted,
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
