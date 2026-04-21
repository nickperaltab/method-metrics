/**
 * BigQuery client for the Metrics MCP. Reads the SA key from
 * MCP_BQ_SA_KEY (JSON blob) in edge function secrets. Includes the Drive
 * scope so federated Sheets-backed views (method_forecast, looker_inputs)
 * work. Mirrors builder/scripts/refresh-snapshots/bq-client.js.
 */
import { BigQuery } from '@google-cloud/bigquery';

let cached: BigQuery | null = null;

function getClient(): BigQuery {
  if (cached) return cached;
  const keyJson = Deno.env.get('MCP_BQ_SA_KEY');
  if (!keyJson) throw new Error('MCP_BQ_SA_KEY not set');
  let creds: { project_id: string; client_email: string; private_key: string };
  try {
    creds = JSON.parse(keyJson);
  } catch {
    throw new Error('MCP_BQ_SA_KEY is not valid JSON');
  }
  cached = new BigQuery({
    projectId: creds.project_id,
    credentials: creds,
    // Drive scope required for Sheets-federated BQ views
    scopes: [
      'https://www.googleapis.com/auth/bigquery',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return cached;
}

export interface BqQueryResult {
  rows: Record<string, unknown>[];
  bytesBilled: number;
}

/**
 * Execute SQL with a hard byte cap. Returns flattened rows (BQ's
 * `{value: ...}` wrappers unwrapped) + bytesBilled for cost attribution.
 */
export async function runQuery(sql: string, maxBytes = 1_000_000_000): Promise<BqQueryResult> {
  const bq = getClient();
  const [job] = await bq.createQueryJob({
    query: sql,
    useLegacySql: false,
    maximumBytesBilled: String(maxBytes),
    labels: { mcp: 'true' },
  });
  const [rows] = await job.getQueryResults();
  const [metadata] = await job.getMetadata();
  const bytesBilled = Number(metadata?.statistics?.query?.totalBytesBilled ?? 0);
  const plain = rows.map((r: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = v && typeof v === 'object' && 'value' in (v as object)
        ? (v as { value: unknown }).value
        : v;
    }
    return out;
  });
  return { rows: plain, bytesBilled };
}

/**
 * Adapter matching loadScorecardData's `query` contract: `(sql) => {rows}`.
 * We wrap to also capture bytesBilled into a side-channel map so the tool
 * handler can sum total bytes across all queries in a scorecard load.
 */
export function makeQueryAdapter(onBytes: (n: number) => void) {
  return async (sql: string) => {
    const { rows, bytesBilled } = await runQuery(sql);
    onBytes(bytesBilled);
    return { rows };
  };
}
