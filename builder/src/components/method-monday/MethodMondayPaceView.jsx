import React from 'react';
import { buildPaceRows } from '../../lib/methodMondayPace';

/**
 * Method Monday — shared-axis pace view. Page-scoped: this component is not
 * used by any other scorecard and does not touch components/scorecards/
 * (ScorecardSection / KpiTile / KpiColumn / utils.js), which is where the
 * 3289%-scale bug and the NULL-renders-as-0% bug live. All formatting and
 * normalization logic here is new and lives in lib/methodMondayPace.js.
 *
 * Renders seven horizontal bars on a single 0–150% axis with a vertical
 * "on pace" rule at 100%, sorted worst-first (see buildPaceRows). Colour is
 * driven by harmful distance from 100%, not raw magnitude — see
 * classifyBand in lib/methodMondayPace.js for why churn (inverted) and
 * every other metric use the same function with a single boolean flip.
 */

const AXIS_MAX = 150;
const ON_PACE_X = (100 / AXIS_MAX) * 100; // % position of the 100% rule on the track

// Every row (label / track / pair / attainment) uses this same grid so the
// footer caption below can share it and stay aligned with the rule at any
// container width — see ROW_GRID usage in the footer.
const ROW_GRID = '160px 1fr 150px 90px';

const BAND_COLORS = {
  green: '#059669',
  amber: '#b45309',
  red: '#dc2626',
  unknown: '#d1d5db',
};

const fontSans = "'DM Sans', sans-serif";
const fontMono = "'JetBrains Mono', monospace";

function formatPaceNumber(value, format) {
  if (value == null || Number.isNaN(value)) return '—';
  if (format === 'decimal_rate') return `${value.toFixed(2)}%`; // already normalized to 0–100 by buildPaceRow
  if (format === 'percent') return `${value.toFixed(1)}%`;
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatAttainment(value) {
  if (value == null || Number.isNaN(value)) return 'No data';
  return `${value.toFixed(1)}%`;
}

export default function MethodMondayPaceView({ dataMap }) {
  const rows = buildPaceRows(dataMap);

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
        a longer bar is worse for churn, unlike every other row.
      </div>

      {rows.map((row) => {
        const barWidthPct = row.attainment == null
          ? 0
          : Math.max(0, Math.min(row.attainment, AXIS_MAX)) / AXIS_MAX * 100;
        const color = BAND_COLORS[row.band];

        return (
          <div
            key={row.key}
            style={{
              display: 'grid',
              gridTemplateColumns: ROW_GRID,
              alignItems: 'center',
              gap: 16,
              padding: '10px 0',
              borderBottom: '1px solid #f1f3f5',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', fontFamily: fontSans }}>
                {row.label}
              </div>
              {row.inverted && (
                <div
                  title="Inverted: for churn, over 100% is bad, not good"
                  style={{ fontSize: 10, color: '#b45309', fontFamily: fontMono, marginTop: 1 }}
                >
                  over forecast = bad
                </div>
              )}
            </div>

            <div style={{ position: 'relative', height: 20, background: '#f3f4f6', borderRadius: 4 }}>
              {/* Danger-zone tint: for an inverted metric (churn), the region
                  past the 100% rule is the harmful direction. Shaded whether
                  or not the bar currently reaches it, so the meaning of
                  "past this line" is visible at a glance, not just implied
                  by the rule + a text tag. */}
              {row.inverted && (
                <div
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
              {/* on-pace rule at 100% */}
              <div
                style={{
                  position: 'absolute',
                  left: `${ON_PACE_X}%`,
                  top: -2,
                  bottom: -2,
                  width: 1,
                  background: '#9ca3af',
                }}
              />
              <div
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
            </div>

            <div style={{ fontSize: 13, fontFamily: fontMono, color: '#374151', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {formatPaceNumber(row.numerator, row.numeratorFormat)} / {formatPaceNumber(row.denominator, row.denominatorFormat)}
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: fontMono, color, textAlign: 'right' }}>
              {formatAttainment(row.attainment)}
            </div>
          </div>
        );
      })}

      {/* Footer caption shares ROW_GRID + ON_PACE_X with the rows above, so
          the "100% on pace" label stays under the rule it names at any
          container width instead of drifting via a hardcoded margin. */}
      <div style={{ display: 'grid', gridTemplateColumns: ROW_GRID, gap: 16, paddingTop: 8, paddingBottom: 4 }}>
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
        <div />
      </div>
    </div>
  );
}
