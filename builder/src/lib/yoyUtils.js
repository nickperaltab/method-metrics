import { MONTH_NAMES } from './chartUtils';

const MONTH_LOOKUP = MONTH_NAMES.reduce((acc, name, idx) => {
  acc[name.toLowerCase()] = idx;
  acc[name.slice(0, 3).toLowerCase()] = idx;
  return acc;
}, {});

export function getMonthIndices(monthInputs) {
  if (!monthInputs || monthInputs.length === 0) {
    return Array.from({ length: 12 }, (_, i) => i);
  }
  const indices = [];
  for (const raw of monthInputs) {
    if (typeof raw === 'number' && raw >= 1 && raw <= 12) {
      indices.push(raw - 1);
      continue;
    }
    if (typeof raw === 'string') {
      const key = raw.trim().toLowerCase();
      if (MONTH_LOOKUP[key] != null) {
        indices.push(MONTH_LOOKUP[key]);
        continue;
      }
      const abbrev = key.slice(0, 3);
      if (MONTH_LOOKUP[abbrev] != null) {
        indices.push(MONTH_LOOKUP[abbrev]);
      }
    }
  }
  if (indices.length === 0) {
    return Array.from({ length: 12 }, (_, i) => i);
  }
  return indices;
}

export function formatMonthLabels(monthIndices) {
  return monthIndices.map(idx => MONTH_NAMES[idx]);
}

export function sliceSeries(series, monthIndices) {
  return monthIndices.map(idx => Number(series[idx]) || 0);
}

export function computeGrowthSeries(seriesMap, years, monthIndices) {
  if (!years || years.length < 2) return null;
  const sortedYears = [...years].map(String).sort();
  const latest = sortedYears[sortedYears.length - 1];
  const prior = sortedYears[sortedYears.length - 2];
  const latestSeries = seriesMap[latest] || [];
  const priorSeries = seriesMap[prior] || [];
  const data = monthIndices.map(idx => {
    const curr = Number(latestSeries[idx]) || 0;
    const prev = Number(priorSeries[idx]) || 0;
    if (prev === 0) return 0;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  });
  return { latest, prior, data };
}
