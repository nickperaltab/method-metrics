#!/usr/bin/env node
import { SCORECARDS } from '../src/config/scorecards/index.js';
import { loadScorecardData } from '../src/lib/sql/load.js';
import { createBqClient, makeQuery } from './refresh-snapshots/bq-client.js';
import { createSupabaseAdminClient, fetchAllMetrics } from './refresh-snapshots/supabase.js';

const ONLY = process.env.ONLY_SCORECARD || 'marketing-scorecard';

const supabase = createSupabaseAdminClient();
const bq = createBqClient();
const query = makeQuery(bq);
const metrics = await fetchAllMetrics(supabase);
const config = SCORECARDS[ONLY];

const { data: snap, error } = await supabase
  .from('scorecard_snapshots')
  .select('payload,published_at')
  .eq('scorecard_id', ONLY)
  .eq('status', 'published')
  .single();
if (error || !snap) { console.error('No published snapshot:', error); process.exit(1); }

console.log(`Snapshot published at ${snap.published_at}`);

const { dataMap: live } = await loadScorecardData({ config, metrics, query });
const livePayload = Object.fromEntries([...live.entries()].map(([k, v]) => [String(k), v]));

const allKeys = [...new Set([...Object.keys(snap.payload), ...Object.keys(livePayload)])].sort();
let drift = 0;
for (const k of allKeys) {
  const a = JSON.stringify(snap.payload[k]);
  const b = JSON.stringify(livePayload[k]);
  if (a !== b) {
    drift++;
    console.log(`DRIFT ${k}:`);
    console.log(`  snap: ${a?.slice(0, 160)}`);
    console.log(`  live: ${b?.slice(0, 160)}`);
  }
}
console.log(`\n${drift}/${allKeys.length} keys differ`);
