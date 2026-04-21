import { BigQuery } from '@google-cloud/bigquery';

export function createBqClient() {
  const keyJson = process.env.GCP_SA_KEY;
  if (!keyJson) throw new Error('GCP_SA_KEY env var not set');
  let creds;
  try { creds = JSON.parse(keyJson); }
  catch { throw new Error('GCP_SA_KEY is not valid JSON'); }
  return new BigQuery({ projectId: creds.project_id, credentials: creds });
}

/**
 * Adapter to match the { rows } contract that loadScorecardData expects.
 */
export function makeQuery(bq) {
  return async (sql) => {
    const [rows] = await bq.query({ query: sql, useLegacySql: false });
    const plain = rows.map(r => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        out[k] = (v && typeof v === 'object' && 'value' in v) ? v.value : v;
      }
      return out;
    });
    return { rows: plain };
  };
}
