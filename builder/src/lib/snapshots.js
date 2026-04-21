import { SUPABASE_URL, headers } from './supabase.js';
import { hydrateKeys, snapshotFreshness } from './sql/keys.js';

export async function fetchSnapshot(scorecardId) {
  const url = `${SUPABASE_URL}/rest/v1/scorecard_snapshots`
    + `?scorecard_id=eq.${encodeURIComponent(scorecardId)}`
    + `&status=eq.published`
    + `&select=payload,refreshed_at`
    + `&limit=1`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn(`[snapshots] fetch failed: ${res.status}`);
    return null;
  }
  const rows = await res.json();
  if (!rows.length) return null;
  const row = rows[0];
  return {
    dataMap: hydrateKeys(row.payload),
    refreshedAt: row.refreshed_at,
    freshness: snapshotFreshness(row.refreshed_at),
  };
}
