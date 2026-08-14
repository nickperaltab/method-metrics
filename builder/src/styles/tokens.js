/**
 * Design tokens for the metric scorecards.
 *
 * Before this file, 33 scorecard components each declared their own colours and
 * type sizes. Ten neutral greys with no scale, two competing accents, and a
 * chart palette with two measured defects (a deutan-confusable pair and an
 * amber that measured 2.09:1 on the surface). Anything visual that a scorecard
 * needs should come from here.
 *
 * Contrast: every value below was measured against WCAG 2.1 AA. See
 * builder/.claude/skills/ui-review/SKILL.md for the codebase's contrast table
 * and docs/ui-audit-2026-08-05.md for the findings that produced it.
 */

export const color = {
  // ── Neutral ramp ────────────────────────────────────────────────
  ink: '#101828',          // primary text, KPI values
  inkSecondary: '#344054', // table body text
  inkMuted: '#667085',     // labels, axis labels, secondary text (4.9:1 on white)

  // DECORATIVE ONLY. ~2.5:1 on white — fails AA at every text size. Use it for
  // marks a reader never has to read (a hairline rule, an inactive tick). Any
  // label, unit or em-dash placeholder a reader must perceive uses inkMuted.
  // The audit already flagged #9ca3af at 2.54:1; this is the same mistake under
  // a new name if it lands on text.
  inkFaint: '#98a2b3',

  border: '#e4e7ec',       // card borders, axis baseline
  borderSubtle: '#f2f4f7', // internal dividers, gridlines
  surface: '#ffffff',
  surfaceAlt: '#f9fafb',

  // Page background behind the section cards. `canvas` is the flat value;
  // `canvasWash` is a very soft vertical version for the scorecard page. The
  // wash is deliberately near-imperceptible — if you can see where it starts,
  // it is too strong. Page canvas only: never on a card, tile, bar or button.
  canvas: '#f7f9fc',
  canvasWash: 'linear-gradient(#f7f9fc, #eef2f7)',

  // ── Accent (green; the old #2563eb UI accent is retired) ────────
  accent: '#059669',       // chart marks, bar fills, active states
  accentText: '#047857',   // link and chip TEXT (passes AA where #059669 does not)
  accentBg: '#ecfdf5',     // active pill / chip background

  // ── Status text ─────────────────────────────────────────────────
  positive: '#047857',
  negative: '#b42318',
  warning: '#b54708',
  neutral: '#667085',
};

/**
 * Categorical chart palette. Order is load-bearing: it passed all five checks
 * of the dataviz validator (lightness band, chroma floor, adjacent-CVD
 * separation, normal-vision floor, contrast) as an ordered sequence, and
 * adjacency is what was validated. Do not reorder or insert.
 *
 * The blue at index 1 is a *series* hue, not the UI accent — the UI accent is
 * green (color.accent) and blue is retired from chrome.
 */
export const chartPalette = [
  '#059669',
  '#2563eb',
  '#ea580c',
  '#7c3aed',
  '#0891b2',
  '#be185d',
  '#65a30d',
  '#b45309',
];

export const font = {
  sans: "'DM Sans', sans-serif",
  mono: "'JetBrains Mono', monospace",
};

export const type = {
  label: 12,
  body: 13,
  sectionTitle: 18,
  pageTitle: 24,
  valueLg: 28,
  valueMd: 20,
};

/** 400 and 500 only. Nothing in the scorecards needs 600 or 700. */
export const weight = {
  regular: 400,
  medium: 500,
};

export const radius = {
  control: 8,
  card: 10,
};

/**
 * One shadow, used one way. Depth on this page should be felt, not seen: the
 * card border does the containing, and the shadow only lifts it off the canvas.
 * There is deliberately no second level, no coloured shadow and no glow —
 * raising this to make it visible is the wrong fix for a flat-looking page.
 */
export const shadow = {
  card: '0 1px 2px rgba(16, 24, 40, 0.06)',
};

/** The section card. Every scorecard section renders inside one of these. */
export const card = {
  background: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.card,
  boxShadow: shadow.card,
  padding: '18px 20px',
};

/**
 * Gap between section cards. Much tighter than the 48px that separated the old
 * bare divs — the card edge now does the separating, so the large gap only made
 * the page feel sparse.
 */
export const sectionGap = 14;

/** Every figure. Digits must not change width between renders. */
export const numeric = { fontVariantNumeric: 'tabular-nums' };

/** Large figures — tabular, plus a tightened tracking. */
export const numericLg = {
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.02em',
};

/** Chart marks. Shared by chartUtils.js and the EChart theme. */
export const chart = {
  barRadius: [4, 4, 0, 0],   // anchored to the baseline: top corners only
  barRadiusH: [0, 4, 4, 0],  // horizontal bars anchor on the left
  // ECharts expresses the gap between adjacent bars as a percentage of bar
  // width, not in pixels, so a literal 2px is not expressible. '2%' gives the
  // same hairline separation at the bar widths these scorecards render at.
  // (A bare number here would be read as a ratio: `2` means 200%.)
  barGap: '2%',
  lineWidth: 2,
  symbolSize: 8,             // ECharts symbolSize is a diameter; 4px radius
  symbolSizeLast: 10,        // 5px radius on the final point
  symbolRingWidth: 2,
};
