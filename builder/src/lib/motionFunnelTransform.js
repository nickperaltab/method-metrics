// builder/src/lib/motionFunnelTransform.js
// Pure rate math for the Motion + Lifecycle funnel. No I/O.

export const RETENTION_HORIZONS = [1, 3, 6, 12];

const STAGE_DEFS = [
  { key: 'trial',      label: 'Trial' },
  { key: 'synced',     label: 'Sync' },
  { key: 'converted',  label: 'Converted' },
  { key: 'customized', label: 'Customized' },
];

const num = (v) => Number(v) || 0;
const r4 = (x) => +x.toFixed(4);

function stagesFor(row) {
  const counts = [num(row.trials), num(row.synced), num(row.converted), num(row.customized)];
  const trials = counts[0];
  return STAGE_DEFS.map((def, i) => {
    const count = counts[i];
    const next = counts[i + 1];
    const dropToNext = i === counts.length - 1 ? null : (count > 0 ? r4(1 - next / count) : 0);
    return { ...def, count, pctOfTrials: trials > 0 ? r4(count / trials) : 0, dropToNext };
  });
}

function pathFor(row) {
  const booked = num(row.demo_booked);
  const showRate = booked > 0 ? r4(num(row.demo_attended) / booked) : null;
  const retention = RETENTION_HORIZONS.map((k) => {
    const elig = num(row[`eligible_${k}mo`]);
    const ret = num(row[`retained_${k}mo`]);
    return { k, mature: elig > 0, rate: elig > 0 ? r4(ret / elig) : null };
  });
  return { stages: stagesFor(row), showRate, retention };
}

// rows: [{motion, ...counts}]. Returns { talked, self_serve }, each a path object.
export function toMotionFunnel(rows = []) {
  const empty = { trials: 0, synced: 0, converted: 0, customized: 0, demo_booked: 0, demo_attended: 0 };
  const byMotion = Object.fromEntries(rows.map((r) => [r.motion, r]));
  return {
    talked: pathFor(byMotion.talked || empty),
    self_serve: pathFor(byMotion.self_serve || empty),
  };
}
