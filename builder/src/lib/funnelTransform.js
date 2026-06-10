// builder/src/lib/funnelTransform.js

const STAGE_DEFS = [
  { key: 'trial',     label: 'Trial' },
  { key: 'synced',    label: 'Sync' },
  { key: 'converted', label: 'Converted' },
];

// row = { trials, synced, converted }. Returns ordered stage objects with
// count, pctOfTrials (share of the trial cohort), and dropToNext (1 - next/this).
export function normalizeFunnel(row = {}) {
  const counts = [row.trials || 0, row.synced || 0, row.converted || 0];
  const trials = counts[0];
  return STAGE_DEFS.map((def, i) => {
    const count = counts[i];
    const next = counts[i + 1];
    const dropToNext = i === counts.length - 1
      ? null
      : (count > 0 ? +(1 - next / count).toFixed(4) : 0);
    return {
      ...def,
      count,
      pctOfTrials: trials > 0 ? +(count / trials).toFixed(4) : 0,
      dropToNext,
    };
  });
}

// Cohort is "mature" once `windowDays` have elapsed since the cohort month start.
export function isCohortMature(cohortMonth, today, windowDays = 90) {
  const start = new Date(cohortMonth + 'T00:00:00Z');
  const now = new Date(today + 'T00:00:00Z');
  const elapsedDays = (now - start) / 86400000;
  return elapsedDays >= windowDays;
}
