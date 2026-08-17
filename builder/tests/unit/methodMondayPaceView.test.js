import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MethodMondayPaceView, { PaceRow, toggleOpenKey } from '../../src/components/method-monday/MethodMondayPaceView';
import methodMonday from '../../src/config/scorecards/method-monday-scorecard.js';

// This repo has no jsdom / @testing-library dependency installed, so these
// tests work in two layers instead of simulated click/keyboard events:
//   1. Pure state logic (toggleOpenKey) — fully unit-testable, no DOM.
//   2. Structural assertions via react-dom/server's renderToStaticMarkup,
//      which needs no DOM at all — it renders straight to an HTML string.
// <PaceRow> is exported specifically so it can be rendered directly with an
// explicit `isOpen` prop, decoupled from the parent's internal useState —
// that's what stands in for "click row A" / "click row B" here.

function fakeSeries(value) {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return { labels: [period], data: [value] };
}

function fullDataMap() {
  const m = new Map();
  const values = {
    416: 74.6, 410: 232, 285: 311,
    418: 59.2, 295: 130, 286: 220,
    419: 54.0, 296: 57.23, 273: 106,
    421: 79.2, 414: 50.0, 361: 63.1,
    422: 91.3, 400: 0.2474, 402: 0.2711,
    423: 110.8, 411: 109.69, 274: 99,
    420: 60.9, 321: 10.95, 319: 0.1797,
    // detail-tile-only ids referenced by the per-metric sections
    406: 132, 407: 64, 408: 20, 409: 27, 412: 31, 413: 29, 415: -165, 417: -171, 357: 0.181,
  };
  for (const [id, v] of Object.entries(values)) m.set(Number(id), fakeSeries(v));
  return m;
}

function detailSections() {
  return methodMonday.sections.filter((s) => s.renderedBy === 'methodMondayPace');
}

describe('toggleOpenKey (pure expansion-state logic)', () => {
  it('opens a key that is not yet open', () => {
    const result = toggleOpenKey(new Set(), 'trials');
    expect(result.has('trials')).toBe(true);
  });

  it('closes a key that is already open', () => {
    const result = toggleOpenKey(new Set(['trials']), 'trials');
    expect(result.has('trials')).toBe(false);
  });

  it('two keys can be open simultaneously — opening one does not close another', () => {
    const afterFirst = toggleOpenKey(new Set(), 'trials');
    const afterSecond = toggleOpenKey(afterFirst, 'churn');
    expect(afterSecond.has('trials')).toBe(true);
    expect(afterSecond.has('churn')).toBe(true);
  });

  it('closing one open key leaves the other(s) open', () => {
    const both = new Set(['trials', 'churn']);
    const afterClosingOne = toggleOpenKey(both, 'trials');
    expect(afterClosingOne.has('trials')).toBe(false);
    expect(afterClosingOne.has('churn')).toBe(true);
  });

  it('does not mutate the set it was given', () => {
    const original = new Set(['trials']);
    toggleOpenKey(original, 'churn');
    expect(original.has('churn')).toBe(false);
    expect(original.size).toBe(1);
  });
});

describe('MethodMondayPaceView: collapsed-by-default structure', () => {
  it('renders no detail tile content for any metric on first render', () => {
    const html = renderToStaticMarkup(
      React.createElement(MethodMondayPaceView, {
        dataMap: fullDataMap(),
        detailSections: detailSections(),
      })
    );
    // Labels that only ever appear inside an expanded detail section's kpi
    // tiles, never in a collapsed pace row (which shows only name/bar/%).
    expect(html).not.toMatch(/Trials Forecast</);
    expect(html).not.toMatch(/Syncs MTD</);
    expect(html).not.toMatch(/Churn Trajectory</);
    expect(html).not.toMatch(/Forecasted Conversion Rate</);
  });

  it('every row is a real <button> with aria-expanded="false" by default', () => {
    const html = renderToStaticMarkup(
      React.createElement(MethodMondayPaceView, {
        dataMap: fullDataMap(),
        detailSections: detailSections(),
      })
    );
    const buttonCount = (html.match(/<button/g) || []).length;
    expect(buttonCount).toBe(7);
    expect(html).not.toMatch(/aria-expanded="true"/);
    expect((html.match(/aria-expanded="false"/g) || []).length).toBe(7);
  });

  it('the collapsed row shows no secondary numbers (no "x / y" pair, no raw trajectory/forecast)', () => {
    const html = renderToStaticMarkup(
      React.createElement(MethodMondayPaceView, {
        dataMap: fullDataMap(),
        detailSections: detailSections(),
      })
    );
    // The old round-1 layout printed the raw pair (e.g. "232 / 311") beside
    // every bar. That column is gone; collapsed markup should not contain
    // any of these known pair values as adjacent numbers.
    expect(html).not.toMatch(/232.*\/.*311/);
    expect(html).not.toMatch(/109\.69.*\/.*99/);
  });
});

describe('MethodMondayPaceView: expansion reveals exactly one metric\'s detail', () => {
  const trialsSection = detailSections().find((s) => s.title === 'Trials');
  const churnSection = detailSections().find((s) => s.title === 'Churn');
  const dataMap = fullDataMap();

  it('opening the Trials row renders the Trials detail tiles and nothing else', () => {
    const html = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber' },
        isOpen: true,
        onToggle: () => {},
        detailSection: trialsSection,
        dataMap,
      })
    );
    expect(html).toMatch(/Trials Forecast/);
    expect(html).toMatch(/Trials MTD/);
    expect(html).not.toMatch(/Churn Trajectory/);
    expect(html).not.toMatch(/Sync Conversion Rate/);
  });

  it('collapsed (isOpen=false) renders no detail tiles for that row', () => {
    const html = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber' },
        isOpen: false,
        onToggle: () => {},
        detailSection: trialsSection,
        dataMap,
      })
    );
    expect(html).not.toMatch(/Trials Forecast/);
    expect(html).toBe(renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber' },
        isOpen: false,
        onToggle: () => {},
        detailSection: trialsSection,
        dataMap,
      })
    ));
  });

  it('two rows rendered open at once each show only their own detail (no cross-contamination)', () => {
    const trialsHtml = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber' },
        isOpen: true,
        onToggle: () => {},
        detailSection: trialsSection,
        dataMap,
      })
    );
    const churnHtml = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'churn', label: 'Churn', inverted: true, attainment: 110.8, band: 'amber' },
        isOpen: true,
        onToggle: () => {},
        detailSection: churnSection,
        dataMap,
      })
    );
    expect(trialsHtml).toMatch(/Trials Forecast/);
    expect(trialsHtml).not.toMatch(/Forecasted Churn/);
    expect(churnHtml).toMatch(/Forecasted Churn/);
    expect(churnHtml).not.toMatch(/Trials Forecast/);
    // Simulating "both open at once" the same way the parent would: render
    // each independently (React would mount both in the same tree) and
    // concatenate — content from one never depends on or excludes the other.
    const both = trialsHtml + churnHtml;
    expect(both).toMatch(/Trials Forecast/);
    expect(both).toMatch(/Forecasted Churn/);
  });
});

describe('MethodMondayPaceView: attainment number is a distinct inspect target', () => {
  const trialsSection = detailSections().find((s) => s.title === 'Trials');

  it('without onMetricClick, the row renders exactly one <button> (no inspect target)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber', attainmentMetricId: 416 },
        isOpen: false,
        onToggle: () => {},
        detailSection: trialsSection,
        dataMap: fullDataMap(),
      })
    );
    expect((html.match(/<button/g) || []).length).toBe(1);
  });

  it('with onMetricClick and an attainmentMetricId, the row renders two SIBLING buttons, not nested', () => {
    const html = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber', attainmentMetricId: 416 },
        isOpen: false,
        onToggle: () => {},
        detailSection: trialsSection,
        dataMap: fullDataMap(),
        onMetricClick: () => {},
      })
    );
    expect((html.match(/<button/g) || []).length).toBe(2);
    // Not nested: the second <button opens strictly after the first one's
    // closing tag, never inside it — invalid HTML otherwise.
    const firstClose = html.indexOf('</button>');
    const secondOpen = html.indexOf('<button', firstClose);
    expect(firstClose).toBeGreaterThan(-1);
    expect(secondOpen).toBeGreaterThan(firstClose);
    // Only the toggle button carries aria-expanded; the inspect button does not.
    expect((html.match(/aria-expanded/g) || []).length).toBe(1);
    // The inspect button is independently labeled for screen readers.
    expect(html).toMatch(/aria-label="Inspect Trials attainment metric"/);
  });

  it('the inspect button is absent when the row has no registered attainmentMetricId', () => {
    const html = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber', attainmentMetricId: null },
        isOpen: false,
        onToggle: () => {},
        detailSection: trialsSection,
        dataMap: fullDataMap(),
        onMetricClick: () => {},
      })
    );
    expect((html.match(/<button/g) || []).length).toBe(1);
  });
});

describe('MethodMondayPaceView: keyboard semantics', () => {
  it('the row header is a real <button>, not a div with an onClick handler', () => {
    const html = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber' },
        isOpen: false,
        onToggle: () => {},
        detailSection: detailSections().find((s) => s.title === 'Trials'),
        dataMap: fullDataMap(),
      })
    );
    // A real <button type="button"> gets native Enter/Space activation and
    // focus handling for free — there is no custom onKeyDown to unit-test
    // separately from the browser's own button semantics.
    expect(html).toMatch(/<button type="button"[^>]*aria-expanded="false"/);
  });

  it('aria-expanded flips with the isOpen prop', () => {
    const closed = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber' },
        isOpen: false,
        onToggle: () => {},
        detailSection: detailSections().find((s) => s.title === 'Trials'),
        dataMap: fullDataMap(),
      })
    );
    const open = renderToStaticMarkup(
      React.createElement(PaceRow, {
        row: { key: 'trials', label: 'Trials', inverted: false, attainment: 74.6, band: 'amber' },
        isOpen: true,
        onToggle: () => {},
        detailSection: detailSections().find((s) => s.title === 'Trials'),
        dataMap: fullDataMap(),
      })
    );
    expect(closed).toMatch(/aria-expanded="false"/);
    expect(open).toMatch(/aria-expanded="true"/);
  });
});
