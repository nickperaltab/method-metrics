/**
 * Shared utilities for scorecard components.
 * Single source of truth for value formatting and KPI resolution.
 */

/**
 * Format a numeric value for display based on format type.
 * @param {number|null} value
 * @param {string} format - 'number' | 'percent' | 'decimal_rate' | 'currency' | 'delta'
 * @returns {string}
 */
export function formatValue(value, format) {
  if (value == null || isNaN(value)) return 'No data';

  switch (format) {
    case 'number':
      return Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
    case 'percent':
      return `${Number(value).toFixed(1)}%`;
    case 'decimal_rate':
      // Value is a decimal like 0.176 → display as "17.6%"
      return `${(Number(value) * 100).toFixed(2)}%`;
    case 'currency':
      return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'delta':
      const v = Number(value);
      const sign = v > 0 ? '+' : '';
      return `${sign}${v.toFixed(2)}%`;
    case 'currency_delta': {
      const cv = Number(value);
      const csign = cv > 0 ? '+' : '';
      return `${csign}$${Number(cv.toFixed(2)).toLocaleString()}`;
    }
    default:
      return String(value);
  }
}

/**
 * Resolve a single KPI value from a time-series based on a selector strategy.
 * @param {{ labels: string[], data: number[] } | null} timeSeries
 * @param {string} selector - 'current_month' | 'prior_month' | 'latest'
 * @returns {number|null}
 */
export function resolveKpiValue(timeSeries, selector) {
  if (!timeSeries || !timeSeries.labels || timeSeries.labels.length === 0) return null;

  const { labels, data } = timeSeries;

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  if (selector === 'current_month') {
    const idx = labels.indexOf(currentPeriod);
    return idx >= 0 ? data[idx] : null;
  }

  if (selector === 'current_or_latest') {
    const idx = labels.indexOf(currentPeriod);
    if (idx >= 0) return data[idx];
    // Fall back to latest data point
    return data[data.length - 1] ?? null;
  }

  if (selector === 'prior_month') {
    const now = new Date();
    const prior = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const priorPeriod = `${prior.getFullYear()}-${String(prior.getMonth() + 1).padStart(2, '0')}`;
    const idx = labels.indexOf(priorPeriod);
    return idx >= 0 ? data[idx] : null;
  }

  // 'latest' — last data point
  return data[data.length - 1] ?? null;
}

/**
 * Compute delta percentage between current and prior month.
 * @param {{ labels: string[], data: number[] } | null} timeSeries
 * @returns {{ delta: number, deltaPercent: number } | null}
 */
export function computeDelta(timeSeries) {
  const current = resolveKpiValue(timeSeries, 'current_month');
  const prior = resolveKpiValue(timeSeries, 'prior_month');
  if (current == null || prior == null || prior === 0) return null;
  const delta = current - prior;
  const deltaPercent = (delta / Math.abs(prior)) * 100;
  return { delta, deltaPercent };
}
