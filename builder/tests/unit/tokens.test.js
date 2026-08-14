import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { color, chartPalette, weight, shadow, card, sectionGap } from '../../src/styles/tokens.js';
import ScorecardSection from '../../src/components/scorecards/ScorecardSection.jsx';
import MethodMondayPaceView from '../../src/components/method-monday/MethodMondayPaceView.jsx';
import { COLORS, buildEChartsOption } from '../../src/lib/chartUtils.js';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '../../src');

/**
 * The nine files the token pass covers. Everything below is a guard against
 * silent drift — the failure mode that produced ten greys and two accents in
 * the first place is a component quietly redeclaring its own hex.
 */
const SCOPE = [
  'styles/tokens.js',
  'components/scorecards/KpiTile.jsx',
  'components/scorecards/KpiColumn.jsx',
  'components/scorecards/ScorecardSection.jsx',
  'components/scorecards/utils.js',
  'components/scorecards/ui.jsx',
  'pages/Scorecard.jsx',
  'lib/chartUtils.js',
  'components/EChart.jsx',
  'components/method-monday/MethodMondayPaceView.jsx',
];

function read(rel) {
  return readFileSync(join(srcRoot, rel), 'utf8');
}

/** Strip block and line comments so prose about a retired colour isn't a hit. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('chart palette', () => {
  it('is exactly the validated sequence, in order', () => {
    // Order is load-bearing: adjacent-pair CVD separation is what was
    // validated, so a reorder invalidates the check even with the same members.
    expect(chartPalette).toEqual([
      '#059669',
      '#2563eb',
      '#ea580c',
      '#7c3aed',
      '#0891b2',
      '#be185d',
      '#65a30d',
      '#b45309',
    ]);
  });

  it('drops the two measured defects: the deutan-confusable pair and the 2.09:1 amber', () => {
    expect(chartPalette).not.toContain('#db2777');
    expect(chartPalette).not.toContain('#16a34a');
    expect(chartPalette).not.toContain('#f59e0b');
  });

  it('chartUtils COLORS is the token palette, not a second copy', () => {
    expect(COLORS).toBe(chartPalette);
  });
});

describe('retired colours are gone from the files in scope', () => {
  // Blue survives as chartPalette[1], a *series* hue. It must not reappear as
  // UI chrome, so it is allowed in tokens.js and nowhere else.
  const uiFiles = SCOPE.filter(f => f !== 'styles/tokens.js');

  it.each(uiFiles)('%s has no #2563eb', (rel) => {
    expect(stripComments(read(rel))).not.toMatch(/#2563eb/i);
  });

  it.each(SCOPE)('%s has no #f0f4ff blue hover', (rel) => {
    expect(stripComments(read(rel))).not.toMatch(/#f0f4ff/i);
  });

  it('tokens.js contains #2563eb only inside chartPalette', () => {
    const src = stripComments(read('styles/tokens.js'));
    expect((src.match(/#2563eb/gi) || []).length).toBe(1);
    const palette = src.slice(src.indexOf('chartPalette'));
    expect(palette).toMatch(/#2563eb/i);
  });
});

describe('type weights', () => {
  it('the token scale offers 400 and 500 only', () => {
    expect(Object.values(weight).sort()).toEqual([400, 500]);
  });

  it.each(SCOPE)('%s declares no fontWeight above 500', (rel) => {
    const src = stripComments(read(rel));
    const declared = [...src.matchAll(/fontWeight:\s*(\d{3})/g)].map(m => Number(m[1]));
    for (const w of declared) expect(w).toBeLessThanOrEqual(500);
    expect(src).not.toMatch(/fontWeight:\s*(600|700|800|900)/);
    expect(src).not.toMatch(/\b(bold|bolder)\b/);
  });
});

describe('contrast: inkFaint never lands on text', () => {
  it.each(SCOPE)('%s does not colour text with inkFaint', (rel) => {
    // inkFaint measures ~2.5:1 on white. `color:` sets text colour; the token
    // is only legitimate as a fill/mark (`background:`, a chart band colour).
    const src = stripComments(read(rel));
    expect(src).not.toMatch(/color:\s*color\.inkFaint/);
  });
});

describe('depth: one shadow, used one way', () => {
  it('exactly one shadow token exists', () => {
    expect(Object.keys(shadow)).toEqual(['card']);
    expect(shadow.card).toBe('0 1px 2px rgba(16, 24, 40, 0.06)');
  });

  it('no file in scope defines a shadow of its own', () => {
    // A second shadow level, a coloured shadow, a glow or a filter:drop-shadow
    // is how a flat page gets "fixed" wrongly. There is one token; use it.
    for (const rel of SCOPE) {
      const src = stripComments(read(rel));
      const literals = [...src.matchAll(/boxShadow:\s*'([^']*)'/g)].map(m => m[1]);
      expect(literals).toEqual([]);
      expect(src).not.toMatch(/drop-shadow/);
    }
  });

  it('the card is the only consumer shape: surface, border, radius, one shadow', () => {
    expect(card.boxShadow).toBe(shadow.card);
    expect(card.background).toBe(color.surface);
    expect(card.borderRadius).toBe(10);
  });
});

describe('the wash is on the page canvas and nowhere else', () => {
  it('canvasWash is the only gradient in the token set', () => {
    const gradients = Object.entries(color).filter(([, v]) => String(v).includes('gradient'));
    expect(gradients.map(([k]) => k)).toEqual(['canvasWash']);
  });

  it('no gradient string appears outside the canvas token', () => {
    // No gradient on any card, tile, bar or button.
    for (const rel of SCOPE) {
      const src = stripComments(read(rel));
      const hits = [...src.matchAll(/[^\n]*gradient[^\n]*/g)].map(m => m[0].trim());
      const allowed = rel === 'styles/tokens.js'
        ? hits.filter(h => !h.startsWith('canvasWash:'))
        : hits.filter(h => !h.includes('color.canvasWash'));
      expect(allowed).toEqual([]);
    }
  });

  it('canvas keeps a flat fallback alongside the wash', () => {
    expect(color.canvas).toBe('#f7f9fc');
  });
});

describe('section containment', () => {
  const dataMap = new Map();
  const section = { title: 'Section', kpis: [{ metricId: 1, label: 'A', format: 'number' }] };

  function render(props) {
    return renderToStaticMarkup(React.createElement(ScorecardSection, { section, dataMap, ...props }));
  }

  it('a section renders as a card by default', () => {
    const html = render({});
    expect(html).toContain(`background:${color.surface}`);
    expect(html).toContain(`border:1px solid ${color.border}`);
    expect(html).toContain('box-shadow:0 1px 2px rgba(16, 24, 40, 0.06)');
    expect(html).toContain('padding:18px 20px');
  });

  it('variant="plain" opts out, for a section a parent has already contained', () => {
    const html = render({ variant: 'plain' });
    expect(html).not.toContain('box-shadow');
    expect(html).not.toContain(`border:1px solid ${color.border}`);
  });

  it('the inter-section gap shrank now that the card edge does the separating', () => {
    expect(sectionGap).toBe(14);
    expect(render({})).toContain(`margin-bottom:${sectionGap}px`);
  });

  it('a KPI group gets a hairline between adjacent tiles, none above the first', () => {
    const twoTiles = {
      title: 'Section',
      kpis: [
        { metricId: 1, label: 'A', format: 'number' },
        { metricId: 2, label: 'B', format: 'number' },
        { metricId: 3, label: 'C', format: 'number' },
      ],
    };
    const html = renderToStaticMarkup(
      React.createElement(ScorecardSection, { section: twoTiles, dataMap })
    );
    const rules = html.match(new RegExp(`border-top:1px solid ${color.borderSubtle}`, 'g')) || [];
    expect(rules.length).toBe(twoTiles.kpis.length - 1);
  });
});

describe('MethodMondayPaceView is not boxed twice', () => {
  it('draws its own card, so the page must not wrap it in another', () => {
    // It renders through the same section path as everything else; the page
    // opts it out. One shadow in the whole subtree is the proof.
    const html = renderToStaticMarkup(
      React.createElement(MethodMondayPaceView, { dataMap: new Map(), detailSections: [] })
    );
    expect((html.match(/box-shadow/g) || []).length).toBe(1);
  });
});

describe('chart marks', () => {
  const labels = ['2024-01', '2024-02', '2024-03'];
  const datasets = [{ label: 'Trials', data: [100, 200, 150] }];

  it('bars are anchored to the baseline — top two corners only, 4px', () => {
    const opt = buildEChartsOption('bar', labels, datasets, {});
    expect(opt.series[0].itemStyle.borderRadius).toEqual([4, 4, 0, 0]);
  });

  it('horizontal bars anchor on the left instead', () => {
    const opt = buildEChartsOption('horizontal_bar', labels, datasets, {});
    expect(opt.series[0].itemStyle.borderRadius).toEqual([0, 4, 4, 0]);
  });

  it('the time axis has no vertical gridlines and no tick marks', () => {
    const opt = buildEChartsOption('bar', labels, datasets, {});
    expect(opt.xAxis.splitLine).toEqual({ show: false });
    expect(opt.xAxis.axisTick).toEqual({ show: false });
    // The x baseline stays.
    expect(opt.xAxis.axisLine.lineStyle.color).toBe(color.border);
  });

  it('horizontal gridlines are solid borderSubtle, and the y-axis line is gone', () => {
    const opt = buildEChartsOption('bar', labels, datasets, {});
    expect(opt.yAxis.splitLine.lineStyle).toEqual({ color: color.borderSubtle, type: 'solid' });
    expect(opt.yAxis.axisLine).toEqual({ show: false });
    expect(opt.yAxis.axisTick).toEqual({ show: false });
  });

  it('axis labels are 12px sans in inkMuted, not 11px mono', () => {
    const opt = buildEChartsOption('bar', labels, datasets, {});
    expect(opt.xAxis.axisLabel.fontSize).toBe(12);
    expect(opt.xAxis.axisLabel.color).toBe(color.inkMuted);
    expect(opt.xAxis.axisLabel.fontFamily).not.toMatch(/JetBrains|mono/i);
  });

  it('lines are 2px with round cap and join', () => {
    const opt = buildEChartsOption('line', labels, datasets, {});
    expect(opt.series[0].lineStyle).toEqual({ width: 2, cap: 'round', join: 'round' });
  });

  it('markers are 4px radius, 5px on the final point, each with a 2px ring', () => {
    const opt = buildEChartsOption('line', labels, datasets, {}, { showLabels: true });
    const series = opt.series[0];
    expect(series.symbolSize).toBe(8);
    expect(series.itemStyle.borderColor).toBe(color.surface);
    expect(series.itemStyle.borderWidth).toBe(2);
    const last = series.data[series.data.length - 1];
    expect(last.symbolSize).toBe(10);
    expect(last.itemStyle.borderWidth).toBe(2);
  });

  it('tooltip is surface on border, 12px, ink text', () => {
    const opt = buildEChartsOption('bar', labels, datasets, {});
    expect(opt.tooltip.backgroundColor).toBe(color.surface);
    expect(opt.tooltip.borderColor).toBe(color.border);
    expect(opt.tooltip.textStyle.color).toBe(color.ink);
    expect(opt.tooltip.textStyle.fontSize).toBe(12);
  });
});
