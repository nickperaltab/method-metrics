import { describe, it, expect } from 'vitest';
import { buildChannelTrajectorySql, shapeChannelTrajectory } from '../../src/lib/channelTrajectorySql.js';

describe('channelTrajectory', () => {
  it('builds SQL against the dbt view', () => {
    const sql = buildChannelTrajectorySql();
    expect(sql).toMatch(/int_channel_funnel_trajectory/);
  });

  it('groups by metric, sorts by trajectory desc, appends Total for counts', () => {
    const rows = [
      { metric: 'syncs', channel: 'PPC', mtd_actual: 14.5, trajectory: 56, prior_month_full: 61, last_year_full: 69.8, yoy_pct: -0.198, mom_pct: -0.082 },
      { metric: 'syncs', channel: 'SEO', mtd_actual: 20, trajectory: 80, prior_month_full: 70, last_year_full: 90, yoy_pct: -0.111, mom_pct: 0.143 },
      { metric: 'trials', channel: 'PPC', mtd_actual: 37.5, trajectory: 150, prior_month_full: 160, last_year_full: 165, yoy_pct: -0.091, mom_pct: -0.062 },
      { metric: 'sync_rate', channel: 'PPC', mtd_actual: 0.38, trajectory: 0.37, prior_month_full: 0.38, last_year_full: 0.42, yoy_pct: -0.119, mom_pct: -0.026 },
    ];
    const out = shapeChannelTrajectory(rows);
    expect(out.syncs[0].channel).toBe('SEO');       // 80 > 56
    expect(out.syncs.at(-1).channel).toBe('Total');  // total appended
    expect(out.syncs.at(-1).trajectory).toBeCloseTo(136); // 80 + 56
    expect(out.trials[0].channel).toBe('PPC');
    // sync_rate total is trials-weighted (blended rate), not a plain sum, and
    // carries a computed YoY/MoM %Δ off that blended rate (matches Looker).
    const rateTotal = out.sync_rate.at(-1);
    expect(rateTotal.channel).toBe('Total');
    // blended trajectory rate = sum(syncs.traj)/sum(trials.traj) = (56+80)/150
    expect(rateTotal.trajectory).toBeCloseTo(136 / 150);
    expect(typeof rateTotal.yoyPct).toBe('number');
    expect(typeof rateTotal.momPct).toBe('number');
  });

  it('drops channel rows that are fully null across all value fields', () => {
    const rows = [
      { metric: 'syncs', channel: 'PPC', mtd_actual: 14.5, trajectory: 56, prior_month_full: 61, last_year_full: 69.8, yoy_pct: -0.198, mom_pct: -0.082 },
      { metric: 'syncs', channel: 'Seminar', mtd_actual: null, trajectory: null, prior_month_full: null, last_year_full: null, yoy_pct: null, mom_pct: null },
    ];
    const out = shapeChannelTrajectory(rows);
    expect(out.syncs.find((r) => r.channel === 'Seminar')).toBeUndefined();
    expect(out.syncs.find((r) => r.channel === 'PPC')).toBeDefined();
  });

  it('keeps a channel row with partial data (only historical values, no current month)', () => {
    const rows = [
      { metric: 'syncs', channel: 'PPC', mtd_actual: 14.5, trajectory: 56, prior_month_full: 61, last_year_full: 69.8, yoy_pct: -0.198, mom_pct: -0.082 },
      { metric: 'syncs', channel: 'Legacy', mtd_actual: null, trajectory: null, prior_month_full: 10, last_year_full: 12, yoy_pct: null, mom_pct: null },
    ];
    const out = shapeChannelTrajectory(rows);
    expect(out.syncs.find((r) => r.channel === 'Legacy')).toBeDefined();
  });

  it('coerces BigQuery STRING values to numbers (regression: no string concatenation in totals)', () => {
    // BigQuery's REST API returns every value as a string, regardless of the
    // underlying column type. Feed string-valued rows through the real shape
    // function to guard against string concatenation bugs like "80" + "56".
    const rows = [
      { metric: 'syncs', channel: 'SEO', trajectory: '80', last_year_full: '90', prior_month_full: '70', mtd_actual: '20', yoy_pct: '-0.111', mom_pct: '0.143' },
      { metric: 'syncs', channel: 'PPC', trajectory: '56', last_year_full: '69.8', prior_month_full: '61', mtd_actual: '14.5', yoy_pct: '-0.198', mom_pct: '-0.082' },
    ];
    const out = shapeChannelTrajectory(rows);
    const total = out.syncs.at(-1);
    expect(total.channel).toBe('Total');
    expect(typeof total.trajectory).toBe('number');
    expect(total.trajectory).toBe(136); // 80 + 56, not "8056" or "80" + "56"

    const seo = out.syncs.find((r) => r.channel === 'SEO');
    expect(typeof seo.trajectory).toBe('number');
    expect(seo.trajectory).toBe(80);
  });
});
