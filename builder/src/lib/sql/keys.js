export function hydrateKeys(payload) {
  const map = new Map();
  if (!payload || typeof payload !== 'object') return map;
  for (const [k, v] of Object.entries(payload)) {
    if (/^\d+$/.test(k)) map.set(Number(k), v);
    else map.set(k, v);
  }
  return map;
}

export function snapshotFreshness(refreshedAt, now = Date.now()) {
  if (!refreshedAt) return 'expired';
  const ageHours = (now - new Date(refreshedAt).getTime()) / 3600000;
  if (ageHours <= 30) return 'fresh';
  if (ageHours <= 48) return 'stale';
  return 'expired';
}
