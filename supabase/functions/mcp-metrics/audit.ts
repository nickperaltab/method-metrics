/**
 * Every MCP tool call writes one row to `mcp_audit`. Called from the tool
 * dispatcher in index.ts. Fire-and-forget — a failed insert must not block
 * the tool response.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
function supabase(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

export interface AuditEntry {
  tokenId?: string;
  tool: string;
  args?: unknown;
  success: boolean;
  errorCode?: string;
  latencyMs: number;
  bytesBilled?: number;
  rowsReturned?: number;
}

export function writeAudit(entry: AuditEntry): void {
  const sb = supabase();
  if (!sb) return; // Supabase env unset (test/dev) — no-op.
  sb.from('mcp_audit').insert({
    token_id: entry.tokenId ?? null,
    tool: entry.tool,
    args: entry.args ?? null,
    success: entry.success,
    error_code: entry.errorCode ?? null,
    latency_ms: entry.latencyMs,
    bytes_billed: entry.bytesBilled ?? null,
    rows_returned: entry.rowsReturned ?? null,
  }).then(({ error }: { error: unknown }) => {
    if (error) console.error('[mcp_audit] insert failed', error);
  });
}
