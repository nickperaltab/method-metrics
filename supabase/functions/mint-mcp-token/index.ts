/**
 * mint-mcp-token — self-service MCP bearer token issuer.
 *
 * Flow:
 *   1. Client POSTs { google_access_token } (the BQ OAuth token the builder
 *      app already holds for the signed-in user).
 *   2. We hit Google's userinfo endpoint with it; Google validates + returns
 *      the verified email.
 *   3. Check email against mcp_allowlist.
 *   4. Mint mcp_<256-bit random>; hash SHA-256; insert into mcp_tokens.
 *   5. Return plaintext once. Never stored in plaintext.
 *
 * Why a Google access token (not an ID token)? The app already has one for
 * BQ OAuth — no extra scopes needed. Google's userinfo endpoint is the
 * verifier; if the token is forged/expired, Google rejects.
 *
 * Failure modes are deliberately explicit so the page can show useful errors.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // URL-safe base64, no padding
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `mcp_${b64}`;
}

async function verifyGoogleAccessToken(token: string): Promise<{ email: string } | null> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { email?: string; verified_email?: boolean };
    if (!data.email || data.verified_email === false) return null;
    return { email: data.email.toLowerCase() };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { google_access_token?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!body.google_access_token) return json({ error: 'missing_google_access_token' }, 400);

  const id = await verifyGoogleAccessToken(body.google_access_token);
  if (!id) return json({ error: 'google_token_invalid' }, 401);

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // Allowlist check — accepts either an exact email match
  // (e.g. 'contractor@example.com') OR a domain-only row
  // (e.g. '@method.me' covers all verified addresses on that domain).
  const domain = '@' + id.email.split('@')[1];
  const { data: allowRow } = await sb
    .from('mcp_allowlist')
    .select('id')
    .or(`email.ilike.${id.email},email.eq.${domain}`)
    .maybeSingle();
  if (!allowRow) return json({ error: 'not_allowlisted', email: id.email }, 403);

  // Revoke any existing non-revoked tokens for this user (one live token per user).
  await sb
    .from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_email', id.email)
    .is('revoked_at', null);

  const plaintext = randomToken();
  const hash = await sha256Hex(plaintext);
  const { data: inserted, error: insertErr } = await sb
    .from('mcp_tokens')
    .insert({
      user_email: id.email,
      token_hash: hash,
      note: body.note ?? 'self-service',
    })
    .select('id, created_at')
    .single();
  if (insertErr || !inserted) {
    console.error('[mint-mcp-token] insert failed', insertErr);
    return json({ error: 'mint_failed' }, 500);
  }

  return json({
    token: plaintext,
    token_id: inserted.id,
    email: id.email,
    created_at: inserted.created_at,
  });
});
