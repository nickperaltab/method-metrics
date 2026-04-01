import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/bigquery', () => ({
  fetchGroupedData: vi.fn(),
  fetchChartData: vi.fn(),
  fetchAggregatedData: vi.fn(),
}));

vi.mock('../../src/lib/schemaCache', () => ({
  default: {
    v_trials: [
      { name: 'SignupDate', type: 'DATE' },
      { name: 'CompanyAccount', type: 'STRING' },
      { name: 'AttributionChannel', type: 'STRING' },
    ],
  },
}));

import { fetchChartDatasets } from '../../src/lib/chartDataBuilder.js';
import { fetchGroupedData, fetchChartData } from '../../src/lib/bigquery.js';

const metric54 = { id: 54, name: 'Trials', view_name: 'v_trials', metric_type: 'primitive' };

const baseDataConfig = {
  xField: 'SignupDate',
  yFields: ['COUNT'],
  timeBucket: 'month',
  lastNMonths: 12,
  channelFilter: null,
  groupByDimension: null,
  endDateRule: null,
};

describe('fetchChartDatasets — grouped path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns one dataset per seriesMap entry', async () => {
    fetchGroupedData.mockResolvedValue({
      labels: ['2025-01', '2025-02'],
      seriesMap: { SEO: [100, 120], PPC: [80, 90] },
      sql: 'SELECT ...',
    });

    const result = await fetchChartDatasets({
      metricIds: [54],
      metrics: [metric54],
      dataConfig: { ...baseDataConfig, groupByDimension: 'AttributionChannel' },
    });

    expect(result).not.toBeNull();
    expect(result.empty).toBeFalsy();
    expect(result.datasets).toHaveLength(2);
    expect(result.datasets.map(d => d.label)).toContain('SEO');
    expect(result.datasets.map(d => d.label)).toContain('PPC');
    expect(fetchGroupedData).toHaveBeenCalledOnce();
    expect(fetchChartData).not.toHaveBeenCalled();
  });

  it('falls back to fetchChartData when fetchGroupedData throws (regression: "No data loaded")', async () => {
    fetchGroupedData.mockRejectedValue(new Error('Invalid xField: null'));
    fetchChartData.mockResolvedValue({
      labels: ['2025-01', '2025-02'],
      data: [100, 120],
      sql: 'SELECT ...',
    });

    const result = await fetchChartDatasets({
      metricIds: [54],
      metrics: [metric54],
      dataConfig: { ...baseDataConfig, groupByDimension: 'AttributionChannel' },
    });

    expect(result).not.toBeNull();
    expect(result.empty).toBeFalsy();
    expect(result.datasets).toHaveLength(1);
    expect(fetchChartData).toHaveBeenCalledOnce();
  });

  it('returns empty when seriesMap is empty and fallback also returns nothing', async () => {
    fetchGroupedData.mockResolvedValue({ labels: [], seriesMap: {}, sql: 'SELECT ...' });
    fetchChartData.mockRejectedValue(new Error('no data'));

    const result = await fetchChartDatasets({
      metricIds: [54],
      metrics: [metric54],
      dataConfig: { ...baseDataConfig, groupByDimension: 'AttributionChannel' },
    });

    expect(result).not.toBeNull();
    expect(result.empty).toBe(true);
    expect(result.datasets).toHaveLength(0);
  });

  it('uses fetchChartData (not grouped) when groupByDimension is null', async () => {
    fetchChartData.mockResolvedValue({
      labels: ['2025-01', '2025-02'],
      data: [100, 120],
      sql: 'SELECT ...',
    });

    await fetchChartDatasets({
      metricIds: [54],
      metrics: [metric54],
      dataConfig: { ...baseDataConfig, groupByDimension: null },
    });

    expect(fetchGroupedData).not.toHaveBeenCalled();
    expect(fetchChartData).toHaveBeenCalledOnce();
  });
});
