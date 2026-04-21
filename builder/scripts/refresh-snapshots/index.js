#!/usr/bin/env node
import crypto from 'node:crypto';
import { SCORECARDS } from '../../src/config/scorecards/index.js';
import { loadScorecardData } from '../../src/lib/sql/load.js';
import { createBqClient, makeQuery } from './bq-client.js';
import {
  createSupabaseAdminClient,
  fetchAllMetrics,
  beginSnapshot,
  publishSnapshot,
  failSnapshot,
} from './supabase.js';

const ONLY_ID = process.env.ONLY_SCORECARD || 'marketing-scorecard';
const POPULATED_THRESHOLD = 0.8;

function hashConfig(config) {
  return crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);
}

function dataMapToPayload(map) {
  const out = {};
  for (const [k, v] of map) out[String(k)] = v;
  return out;
}

async function refreshOne(scorecardId, supabase, query, metrics) {
  const config = SCORECARDS[scorecardId];
  if (!config) throw new Error(`Scorecard "${scorecardId}" not found`);

  console.log(`[refresh] Starting ${scorecardId}`);
  const runId = await beginSnapshot(supabase, scorecardId, hashConfig(config));
  console.log(`[refresh] run_id=${runId}`);

  try {
    const t0 = Date.now();
    const { dataMap, errors, plan } = await loadScorecardData({ config, metrics, query });
    const elapsed = Date.now() - t0;

    const populated = [...dataMap.values()].filter(v => v != null).length;
    const total = plan.expectedKeys.length;
    console.log(`[refresh] ${populated}/${total} keys populated in ${elapsed}ms (${errors.length} errors)`);
    if (errors.length > 0) {
      console.warn('[refresh] Query errors:');
      for (const e of errors) console.warn(`  ${e.data_key}: ${e.message}`);
    }
    const missingKeys = plan.expectedKeys.filter(k => {
      const actualKey = /^\d+$/.test(k) ? Number(k) : k;
      const v = dataMap.get(actualKey);
      return v == null;
    });
    if (missingKeys.length > 0) {
      console.warn('[refresh] Null keys:', missingKeys.slice(0, 20).join(', '));
    }

    if (populated === 0) {
      throw new Error('All queries returned null — refusing to publish empty snapshot');
    }

    const populatedRatio = populated / total;
    if (populatedRatio < POPULATED_THRESHOLD) {
      throw new Error(
        `Only ${populated}/${total} keys populated (${Math.round(populatedRatio * 100)}%) — below ${Math.round(POPULATED_THRESHOLD * 100)}% threshold. Refusing to publish.`
      );
    }

    const payload = dataMapToPayload(dataMap);
    await publishSnapshot(supabase, runId, payload);
    console.log(`[refresh] Published ${scorecardId}`);

    if (errors.length > 0) console.warn('[refresh] Non-fatal errors:', errors);
    return { ok: true, scorecardId, populated, total, errors };
  } catch (e) {
    console.error(`[refresh] FAILED ${scorecardId}:`, e.message);
    await failSnapshot(supabase, runId, { message: e.message, stack: e.stack });
    return { ok: false, scorecardId, error: e.message };
  }
}

async function main() {
  const supabase = createSupabaseAdminClient();
  const bq = createBqClient();
  const query = makeQuery(bq);
  const metrics = await fetchAllMetrics(supabase);
  console.log(`[refresh] Fetched ${metrics.length} metrics`);

  const ids = ONLY_ID === 'ALL' ? Object.keys(SCORECARDS) : [ONLY_ID];
  console.log(`[refresh] Targets: ${ids.join(', ')}`);

  const results = [];
  for (const id of ids) {
    results.push(await refreshOne(id, supabase, query, metrics));
  }

  console.log('[refresh] Summary:', JSON.stringify(results, null, 2));
  if (results.some(r => !r.ok)) process.exit(1);
}

main().catch(e => {
  console.error('[refresh] Fatal:', e);
  process.exit(1);
});
