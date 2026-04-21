import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co';

export function createSupabaseAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY env var not set');
  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function fetchAllMetrics(supabase) {
  const { data, error } = await supabase.from('metrics').select('*').order('id');
  if (error) throw error;
  return data;
}

export async function beginSnapshot(supabase, scorecardId, configHash) {
  const { data, error } = await supabase
    .from('scorecard_snapshots')
    .insert({ scorecard_id: scorecardId, config_hash: configHash, status: 'building', payload: {} })
    .select('run_id')
    .single();
  if (error) throw error;
  return data.run_id;
}

export async function publishSnapshot(supabase, runId, payload) {
  const { error } = await supabase.rpc('publish_scorecard_snapshot', {
    p_run_id: runId,
    p_payload: payload,
  });
  if (error) throw error;
}

export async function failSnapshot(supabase, runId, errorLog) {
  await supabase
    .from('scorecard_snapshots')
    .update({ status: 'failed', error_log: errorLog })
    .eq('run_id', runId);
}
