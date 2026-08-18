import React from 'react';
import { formatMethodMondayWindow } from '../../lib/methodMondayWindow';
import { color, font, type, numeric } from '../../styles/tokens';

/**
 * Page header label: "Aug 1 – Aug 16, 2026 · day 16 of 31" — the window
 * `int_method_monday` actually queried, in the form the sales director used
 * ("Aug 1, 2026 - Aug 16, 2026") when he said the data window wasn't clear.
 *
 * Pure presentational: takes the already-fetched window (or null/undefined)
 * and renders nothing when there's nothing to show — not connected, still
 * loading, or the query failed. See hooks/useMethodMondayWindow.js for the
 * live fetch and lib/methodMondayWindow.js for the formatting rules.
 */
export default function MethodMondayWindowLabel({ window }) {
  const label = formatMethodMondayWindow(window);
  if (!label) return null;

  return (
    <div style={{ fontSize: type.label, color: color.inkMuted, fontFamily: font.sans, marginTop: 4, ...numeric }}>
      {label.rangeLabel} · {label.dayLabel}
    </div>
  );
}
