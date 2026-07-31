import { describe, it, expect } from 'vitest';
import salesScorecard from '../../src/config/scorecards/sales-scorecard.js';

const byTitle = (t) => salesScorecard.sections.find((s) => s.title === t);

describe('Sync Conversion Rate section', () => {
  it('sits directly after the trials Conversion Rate section', () => {
    const titles = salesScorecard.sections.map((s) => s.title);
    expect(titles[0]).toBe('Conversion Rate');
    expect(titles[1]).toBe('Sync Conversion Rate');
  });

  it('mirrors the trials section KPI count and label order', () => {
    const trials = byTitle('Conversion Rate');
    const sync = byTitle('Sync Conversion Rate');
    expect(sync.kpis).toHaveLength(trials.kpis.length);
    expect(sync.kpis.map((k) => k.label)).toEqual([
      'Conversion',
      'Conversion Trajectory',
      'Forecasted Sync Conversion Rate',
      'Sync Conversion Rate',
      'Sync Conversion Rate Trajectory',
      'Forecast vs. Trajectory',
      'Forecasted Attainment',
    ]);
  });

  it('has two charts using the same types and colors as the trials section', () => {
    const trials = byTitle('Conversion Rate');
    const sync = byTitle('Sync Conversion Rate');
    expect(sync.charts).toHaveLength(2);

    expect(sync.charts[0].chartType).toBe(trials.charts[0].chartType);
    expect(sync.charts[1].chartType).toBe(trials.charts[1].chartType);

    expect(sync.charts[0].metrics.map((m) => m.color))
      .toEqual(trials.charts[0].metrics.map((m) => m.color));
    expect(sync.charts[1].metrics.map((m) => m.color))
      .toEqual(trials.charts[1].metrics.map((m) => m.color));
  });

  it('injects nothing beyond the specified series', () => {
    const sync = byTitle('Sync Conversion Rate');
    expect(sync.charts[0].metrics).toHaveLength(3);
    expect(sync.charts[1].metrics).toHaveLength(3);
  });

  it('carries the level-comparability caveat in the rendered field', () => {
    const sync = byTitle('Sync Conversion Rate');
    // ScorecardSection.jsx renders section.description. A `note` field
    // would silently render nothing.
    expect(sync.description).toMatch(/not comparable in level/i);
  });

  it('gives every KPI its own metric id', () => {
    const sync = byTitle('Sync Conversion Rate');
    const ids = sync.kpis.map((k) => k.metricId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses no placeholder metric ids', () => {
    const sync = byTitle('Sync Conversion Rate');
    const ids = [
      ...sync.kpis.map((k) => k.metricId),
      ...sync.charts.flatMap((c) => c.metrics.map((m) => m.id)),
    ];
    for (const id of ids) {
      expect(String(id)).not.toMatch(/NEW_/);
    }
  });
});
