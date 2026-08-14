/**
 * Shared interactive primitives for the scorecards.
 *
 * Three components had the same two defects independently: a `<div onClick>` or
 * `<span onClick>` with no keyboard path, and a selected state signalled by
 * colour and font weight alone, neither of which is announced. Patching each
 * site would have left the next screen free to reinvent the same bug, so the
 * behaviour lives here instead.
 *
 * Focus rings come from a real `:focus-visible` rule rather than an
 * `onFocus`/`onBlur` style swap: inline styles cannot express `:focus-visible`,
 * and `onFocus` fires on mouse clicks too, which puts a ring on controls the
 * user just clicked. `<ScorecardStyles />` renders that rule once per page.
 */
import React from 'react';
import { color, focusRing, font, radius, srOnly, type, weight } from '../../styles/tokens';

/** Class applied to anything that should show the shared focus ring. */
export const FOCUSABLE = 'sc-focusable';

/**
 * Exported so a test can assert the ring exists and is the accent at 2px,
 * rather than asserting on a string buried in JSX.
 */
export const FOCUS_CSS = `
.${FOCUSABLE}:focus-visible {
  outline: ${focusRing.outline};
  outline-offset: ${focusRing.outlineOffset}px;
  border-radius: ${radius.control}px;
}
`;

/** Mount once per page. Gives the scorecards their focus-visible rule. */
export function ScorecardStyles() {
  return <style>{FOCUS_CSS}</style>;
}

/** Chrome reset shared by every button primitive below. */
const resetButton = {
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

/**
 * Text visible only to assistive technology. Pairs with an `aria-hidden` glyph
 * so the two together read correctly in both directions.
 */
export function SrOnly({ children }) {
  return <span style={srOnly}>{children}</span>;
}

/**
 * An icon-only trigger — the ⓘ that opens the Metric Inspector. The glyph is
 * hidden from the accessibility tree and `label` supplies the name, because a
 * screen reader announcing "circled Latin small letter i" tells nobody
 * anything. `title` is not a substitute: it is unreliable across AT and
 * invisible to touch.
 */
export function IconButton({ label, onClick, glyph = 'ⓘ', style }) {
  const [active, setActive] = React.useState(false);
  return (
    <button
      type="button"
      className={FOCUSABLE}
      aria-label={label}
      onClick={onClick}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        ...resetButton,
        fontSize: 14,
        lineHeight: 1,
        color: active ? color.accentText : color.inkMuted,
        transition: 'color 100ms',
        ...style,
      }}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );
}

/**
 * A segmented-control button. `selected` drives the visual state AND the
 * announced one — weight and background are invisible to a screen reader, so
 * the state has to be in ARIA as well.
 *
 * `role="tab"` switches the announced state from `aria-pressed` to
 * `aria-selected`, which is what a tablist expects.
 */
export function Pill({ label, selected, onClick, role, size = 'sm' }) {
  const isTab = role === 'tab';
  return (
    <button
      type="button"
      className={FOCUSABLE}
      role={role}
      onClick={onClick}
      {...(isTab ? { 'aria-selected': selected } : { 'aria-pressed': selected })}
      style={{
        ...resetButton,
        padding: size === 'lg' ? '6px 16px' : '4px 12px',
        fontSize: size === 'lg' ? type.body : type.label,
        fontWeight: selected ? weight.medium : weight.regular,
        fontFamily: font.sans,
        background: selected ? color.accentBg : color.surfaceAlt,
        color: selected ? color.accentText : color.inkMuted,
        borderRadius: radius.control,
        transition: 'background 150ms, color 150ms',
      }}
    >
      {label}
    </button>
  );
}

/**
 * The no-data cell. A dash is the data-grid convention and reads as "nothing
 * here" at a glance; repeating "No data" across a dense tile grid is noise. The
 * dash alone is silence to a screen reader, so both are rendered.
 */
export function NoDataCell({ style }) {
  return (
    <div style={style}>
      <span aria-hidden="true">—</span>
      <SrOnly>No data</SrOnly>
    </div>
  );
}
