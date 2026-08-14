import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import ScorecardSection from '../../src/components/scorecards/ScorecardSection.jsx';
import KpiTile from '../../src/components/scorecards/KpiTile.jsx';
import { FOCUSABLE, FOCUS_CSS, IconButton, NoDataCell, Pill } from '../../src/components/scorecards/ui.jsx';
import { color, focusRing } from '../../src/styles/tokens.js';

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src');
const render = (el) => renderToStaticMarkup(el);

const dataMap = new Map();
const now = new Date();
const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
dataMap.set(1, { labels: [period], data: [42] });

describe('the KPI tile is operable by keyboard', () => {
  it('is a real button, not a div with a click handler', () => {
    const html = render(React.createElement(KpiTile, {
      label: 'Trials', value: 42, format: 'number', onClick: () => {},
    }));
    // A <div onClick> has no tab stop, no Enter/Space, and is invisible to a
    // screen reader. This is the click-through to the Metric Inspector — the
    // primary interaction on all 22 scorecards.
    expect(html).toMatch(/^<button/);
    expect(html).toContain('type="button"');
  });

  it('carries the shared focus style', () => {
    const html = render(React.createElement(KpiTile, {
      label: 'Trials', value: 42, format: 'number', onClick: () => {},
    }));
    expect(html).toContain(`class="${FOCUSABLE}"`);
  });

  it('the focus rule is a real :focus-visible ring at the accent, 2px', () => {
    expect(FOCUS_CSS).toContain(`.${FOCUSABLE}:focus-visible`);
    expect(FOCUS_CSS).toContain(focusRing.outline);
    expect(focusRing.outline).toBe(`2px solid ${color.accent}`);
    // Not display:none-style suppression, and not an onFocus swap that would
    // also ring on mouse click.
    expect(FOCUS_CSS).not.toMatch(/outline:\s*none/);
  });

  it('the ⓘ affordance is hidden from the accessibility tree', () => {
    // It duplicates the button's own action; announcing the glyph adds nothing.
    const html = render(React.createElement(KpiTile, {
      label: 'Trials', value: 42, format: 'number', onClick: () => {},
    }));
    expect(html).not.toMatch(/<span(?![^>]*aria-hidden)[^>]*>ⓘ/);
  });
});

describe('icon triggers have accessible names', () => {
  it('the primitive names itself and hides the glyph', () => {
    const html = render(React.createElement(IconButton, { label: 'How Trials is defined', onClick: () => {} }));
    expect(html).toContain('aria-label="How Trials is defined"');
    expect(html).toContain('<button');
    expect(html).toContain('aria-hidden="true"');
  });

  it("a section's inspector trigger is named after the section", () => {
    const html = render(React.createElement(ScorecardSection, {
      section: { title: 'Trials', type: 'rawTable', metricId: 9 },
      dataMap,
      onMetricClick: () => {},
    }));
    expect(html).toContain('aria-label="How Trials is defined"');
  });

  it('neither page uses a bare <span onClick> for a trigger any more', () => {
    // title= is not a substitute for a name: unreliable across AT, invisible on
    // touch, and it does not make the element focusable.
    for (const rel of ['pages/Scorecard.jsx', 'components/scorecards/ScorecardSection.jsx']) {
      const src = readFileSync(join(srcRoot, rel), 'utf8');
      expect(src).not.toMatch(/<span\s+onClick/);
    }
  });
});

describe('selected state is announced, not just coloured', () => {
  it('a pill exposes aria-pressed in both states', () => {
    expect(render(React.createElement(Pill, { label: '3M', selected: true, onClick: () => {} })))
      .toContain('aria-pressed="true"');
    expect(render(React.createElement(Pill, { label: '6M', selected: false, onClick: () => {} })))
      .toContain('aria-pressed="false"');
  });

  it('a tab exposes aria-selected instead, which is what a tablist expects', () => {
    const html = render(React.createElement(Pill, { label: 'Channel', role: 'tab', selected: true, onClick: () => {} }));
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).not.toContain('aria-pressed');
  });

  it('the grain group is named for assistive tech without a visible caption', () => {
    const html = render(React.createElement(ScorecardSection, {
      section: { title: 'Trials', kpis: [{ metricId: 1, label: 'A', format: 'number' }] },
      dataMap,
      grain: 'month',
      onGrain: () => {},
    }));
    expect(html).toContain('aria-label="Time grain"');
    expect(html).toContain('aria-pressed="true"');
    // The shouty 11px uppercase caption is gone from the screen.
    expect(html).not.toContain('>GRAIN<');
  });

  it('the date-range group is named too, and RANGE is off the screen', () => {
    const src = readFileSync(join(srcRoot, 'pages/Scorecard.jsx'), 'utf8');
    expect(src).toContain('label="Date range"');
    expect(src).not.toContain('>RANGE<');
  });
});

describe('the no-data cell reads correctly both ways', () => {
  it('renders a dash visually and "No data" for assistive tech', () => {
    const html = render(React.createElement(NoDataCell, {}));
    expect(html).toContain('aria-hidden="true">—<');
    expect(html).toContain('No data');
    // Visually hidden must stay in the accessibility tree: display:none and
    // visibility:hidden would remove it.
    expect(html).not.toMatch(/display:none/);
    expect(html).not.toMatch(/visibility:hidden/);
    expect(html).toContain('clip-path:inset(50%)');
  });

  it('a KPI tile with no data uses it', () => {
    const html = render(React.createElement(KpiTile, { label: 'Trials', noData: true }));
    expect(html).toContain('aria-hidden="true">—<');
    expect(html).toContain('No data');
    expect(html).not.toMatch(/font-style:italic/);
  });
});
