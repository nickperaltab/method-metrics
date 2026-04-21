/**
 * Snapshot fetch for the MCP. Reads scorecard_snapshots (populated by the
 * nightly cron in builder/scripts/refresh-snapshots/). Service-role client.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  return cached;
}

export type Freshness = 'fresh' | 'stale' | 'expired';

export interface SnapshotFetch {
  payload: Record<string, unknown>;
  refreshedAt: string;
  freshness: Freshness;
}

export function classifyFreshness(refreshedAt: string | null, now = Date.now()): Freshness {
  if (!refreshedAt) return 'expired';
  const ageHours = (now - new Date(refreshedAt).getTime()) / 3_600_000;
  if (ageHours <= 30) return 'fresh';
  if (ageHours <= 48) return 'stale';
  return 'expired';
}

export async function fetchSnapshot(scorecardId: string): Promise<SnapshotFetch | null> {
  const { data, error } = await client()
    .from('scorecard_snapshots')
    .select('payload, refreshed_at')
    .eq('scorecard_id', scorecardId)
    .eq('status', 'published')
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    payload: data.payload as Record<string, unknown>,
    refreshedAt: data.refreshed_at as string,
    freshness: classifyFreshness(data.refreshed_at as string | null),
  };
}
