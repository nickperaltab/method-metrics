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

// ── Scale ────────────────────────────────────────────────────────────
//
// The tests above assert structure — counts, labels, colours, types. None
// of them asserts SCALE, which is how metric 301 shipped rendering at 100x
// in both places this section uses it.
//
// The trap: a Supabase metric with a `formula` and no `chart_sql`/`view_name`
// is routed to the derived-formula path by buildScorecardQueryPlan
// (builder/src/lib/sql/plan.js). The app evaluates the formula and never
// reads the dbt view. Where that formula ends in `* 100` the metric emits a
// PERCENTAGE, and formatValue's 'decimal_rate' branch
// (builder/src/components/scorecards/utils.js) multiplies by 100 again.
//
// These ids are Supabase formula metrics whose formula ends in `* 100`, so
// they emit a percentage number, not a decimal. Verified against the live
// Supabase rows 2026-07-31. Extend this list when a new one is registered.
const PERCENTAGE_FORMULA_METRIC_IDS = new Set([
  301, // Sync-to-Conversion Rate: SAFE_DIVIDE({56},{55}) * 100 → 32.89
  321, // Conversion Rate Trajectory: → 8.49
]);

describe('Sync Conversion Rate section — scale', () => {
  it('declares metric 301 as percent, not decimal_rate', () => {
    const sync = byTitle('Sync Conversion Rate');
    const kpi = sync.kpis.find((k) => k.metricId === 301);
    expect(kpi).toBeDefined();
    // 301 emits 32.89, already scaled. 'decimal_rate' would render 3289.47%.
    expect(kpi.format).toBe('percent');
  });

  it('never formats a percentage-emitting formula metric as decimal_rate', () => {
    const sync = byTitle('Sync Conversion Rate');
    for (const kpi of sync.kpis) {
      if (!PERCENTAGE_FORMULA_METRIC_IDS.has(kpi.metricId)) continue;
      expect(
        kpi.format,
        `KPI "${kpi.label}" (#${kpi.metricId}) emits a percentage; `
        + `'decimal_rate' would multiply by 100 again`,
      ).not.toBe('decimal_rate');
    }
  });

  it('keeps no percentage-emitting formula metric on a decimal_rate chart', () => {
    const sync = byTitle('Sync Conversion Rate');
    for (const chart of sync.charts) {
      if (chart.valueFormat !== 'decimal_rate') continue;
      for (const m of chart.metrics) {
        expect(
          PERCENTAGE_FORMULA_METRIC_IDS.has(m.id),
          `chart "${chart.label}" series "${m.label}" (#${m.id}) emits a `
          + `percentage but the chart's valueFormat is decimal_rate — it `
          + `would plot ~100x the other series`,
        ).toBe(false);
      }
    }
  });

  it('has every Month Over Month series emit %Y-%m period labels', () => {
    const sync = byTitle('Sync Conversion Rate');
    const mom = sync.charts.find((c) => c.label.endsWith('Month Over Month'));
    expect(mom.metrics).toHaveLength(3);

    for (const m of mom.metrics) {
      if (m.customSql) {
        // A '%Y-%m-%d' label here trips the axisIsWeekly branch in
        // chartDataBuilder.js and zeroes out the monthly pointer series.
        expect(m.customSql, `series "${m.label}"`).toMatch(/FORMAT_DATE\('%Y-%m'/);
        expect(m.customSql, `series "${m.label}"`).not.toMatch(/%Y-%m-%d/);
      } else {
        // Numeric ids resolve to Supabase pointers registered with '%Y-%m'
        // (see scripts/register_sync_conversion_metrics.py).
        expect(typeof m.id).toBe('number');
      }
    }
  });

  it('has every Week Over Week series emit %Y-%m-%d period labels', () => {
    const sync = byTitle('Sync Conversion Rate');
    const wow = sync.charts.find((c) => c.label.endsWith('Week Over Week'));
    for (const m of wow.metrics) {
      expect(m.customSql, `series "${m.label}"`).toMatch(/FORMAT_DATE\('%Y-%m-%d'/);
    }
  });
});
