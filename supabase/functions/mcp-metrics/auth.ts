/**
 * Bearer-token auth for the Metrics MCP.
 *
 * Tokens live in Supabase `mcp_tokens` (SHA-256 hashed). Two issuance paths:
 *   - self-mint via /mcp-token page (no expiry, no audience)
 *   - OAuth via mcp-oauth function (1-hour expiry, audience-bound, refresh)
 *
 * Both look the same to this code: hash the bearer, look up in mcp_tokens,
 * check revoked_at + expires_at + audience. Touch last_used_at, return id.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface AuthResult {
  ok: boolean;
  tokenId?: string;
  userEmail?: string;
  reason?: string;
}

const RESOURCE_SERVER = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mcp-metrics`;

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

let cachedClient: SupabaseClient | null = null;
function supabase(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

export async function verifyBearer(req: Request): Promise<AuthResult> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, reason: 'missing_bearer' };
  const plaintext = match[1].trim();
  if (!plaintext.startsWith('mcp_')) return { ok: false, reason: 'malformed_token' };

  const hash = await sha256Hex(plaintext);
  const { data, error } = await supabase()
    .from('mcp_tokens')
    .select('id, user_email, revoked_at, expires_at, audience')
    .eq('token_hash', hash)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: 'token_not_found' };
  if (data.revoked_at) return { ok: false, reason: 'token_revoked' };
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'token_expired' };
  }
  // Audience binding (RFC 8707): OAuth-issued tokens carry an audience field.
  // Self-mint tokens have null audience and bypass this check (they predate
  // OAuth and were always issued for this MCP). Reject any token whose
  // audience is set but doesn't match this resource server.
  if (data.audience && data.audience !== RESOURCE_SERVER && data.audience !== RESOURCE_SERVER + '/') {
    return { ok: false, reason: 'audience_mismatch' };
  }

  // Fire-and-forget last_used_at touch; failure here shouldn't block the call.
  supabase().from('mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {});

  return { ok: true, tokenId: data.id, userEmail: data.user_email };
}
