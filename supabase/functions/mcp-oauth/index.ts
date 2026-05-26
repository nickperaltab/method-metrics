/**
 * mcp-oauth — OAuth 2.1 authorization server for the Metrics MCP.
 *
 * Acts as a thin OAuth shim that delegates real user identity to Google.
 * Flow:
 *   Claude.ai → /authorize → (we redirect to Google) → user signs in →
 *   Google → /google-callback → (we mint code) → Claude.ai → /token →
 *   Claude.ai gets MCP bearer token (stored in mcp_tokens).
 *
 * Endpoints:
 *   GET  /.well-known/oauth-authorization-server — RFC 8414 discovery
 *   POST /register                                — RFC 7591 dynamic client registration
 *   GET  /authorize                               — start the flow (PKCE + resource)
 *   GET  /google-callback                         — Google sends user back here
 *   POST /token                                   — exchange code → access token (+ refresh)
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (standard)
 *   GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET
 *
 * Why bring our own OAuth instead of using Supabase Auth? The Anthropic MCP
 * spec requires specific endpoint shapes (RFC 8414 metadata, RFC 7591 DCR,
 * RFC 8707 resource indicators) and Supabase Auth doesn't expose these in a
 * way that satisfies a Claude client out of the box. Easier to implement
 * exactly what the spec wants here.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const ISSUER = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mcp-oauth`;
const RESOURCE_SERVER = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mcp-metrics`;
const GOOGLE_CALLBACK_URL = `${ISSUER}/google-callback`;

const ACCESS_TOKEN_TTL_SEC = 60 * 60;            // 1 hour
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
const AUTH_CODE_TTL_SEC = 10 * 60;               // 10 minutes
const PENDING_AUTH_TTL_SEC = 10 * 60;            // 10 minutes

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ── Helpers ──────────────────────────────────────────────────────────────

let cachedSb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (cachedSb) return cachedSb;
  cachedSb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  return cachedSb;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function errorRedirect(redirectUri: string, error: string, description?: string, state?: string): Response {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (description) url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  return Response.redirect(url.toString(), 302);
}

function htmlError(title: string, message: string, status = 400): Response {
  const body = `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:system-ui;max-width:560px;margin:80px auto;color:#374151">
<h1 style="color:#dc2626">${title}</h1>
<p>${message}</p>
</body>`;
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function randomToken(prefix = ''): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${prefix}${b64}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// PKCE S256 verifier check: SHA-256(verifier) base64url == challenge
async function verifyPkce(verifier: string, challenge: string): Promise<boolean> {
  const buf = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return b64 === challenge;
}

function isAllowedRedirect(client: { redirect_uris: string[] }, uri: string): boolean {
  return client.redirect_uris.includes(uri);
}

// Temporary: writes rows to oauth_debug_log so we can see what the function
// is actually doing — Supabase's HTTP access logs don't show console.log.
// Remove once the flow is verified stable.
async function debugLog(step: string, details?: unknown): Promise<void> {
  try {
    await sb().from('oauth_debug_log').insert({
      step,
      details: details === undefined ? null : JSON.parse(JSON.stringify(details)),
    });
  } catch (e) {
    console.error('[debugLog] failed', e);
  }
}

// Allowlist gate. Two separate queries because PostgREST's .or() syntax
// breaks on values containing periods (which both emails and domains have).
async function emailAllowed(email: string): Promise<boolean> {
  const { data: exact } = await sb()
    .from('mcp_allowlist')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (exact) return true;
  const domain = '@' + email.split('@')[1];
  const { data: domainRow } = await sb()
    .from('mcp_allowlist')
    .select('id')
    .eq('email', domain)
    .maybeSingle();
  return !!domainRow;
}

// ── Endpoint: /.well-known/oauth-authorization-server (RFC 8414) ────────

function metadata(): Response {
  return json({
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    registration_endpoint: `${ISSUER}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
    scopes_supported: ['mcp'],
  });
}

// ── Endpoint: POST /register (RFC 7591 Dynamic Client Registration) ─────

async function register(req: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_client_metadata', error_description: 'Body must be JSON' }, 400);
  }
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return json({ error: 'invalid_redirect_uri', error_description: 'redirect_uris is required' }, 400);
  }
  for (const uri of redirectUris) {
    if (typeof uri !== 'string') {
      return json({ error: 'invalid_redirect_uri' }, 400);
    }
    // OAuth 2.1: redirect URIs must be HTTPS or localhost
    const u = new URL(uri);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      return json({
        error: 'invalid_redirect_uri',
        error_description: 'redirect_uri must use https or localhost',
      }, 400);
    }
  }

  const clientId = randomToken('mcp-client-');
  const clientSecret = randomToken('mcp-secret-');
  const { error: insErr } = await sb().from('oauth_clients').insert({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: redirectUris,
    client_name: typeof body.client_name === 'string' ? body.client_name : null,
    scope: typeof body.scope === 'string' ? body.scope : null,
  });
  if (insErr) {
    console.error('[oauth/register] insert failed', insErr);
    return json({ error: 'server_error' }, 500);
  }
  return json({
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: redirectUris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  }, 201);
}

// ── Endpoint: GET /authorize ────────────────────────────────────────────
//
// Validates the client, stores a pending-auth row, redirects to Google.

async function authorize(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const params = url.searchParams;

  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const responseType = params.get('response_type');
  const codeChallenge = params.get('code_challenge');
  const codeChallengeMethod = params.get('code_challenge_method');
  const clientState = params.get('state');
  const resource = params.get('resource');
  const scope = params.get('scope');

  // We can't redirect errors back without a valid client+redirect, so those
  // produce HTML error pages instead.
  if (!clientId) return htmlError('OAuth error', 'Missing client_id parameter.');
  if (!redirectUri) return htmlError('OAuth error', 'Missing redirect_uri parameter.');

  const { data: client } = await sb()
    .from('oauth_clients')
    .select('client_id, redirect_uris')
    .eq('client_id', clientId)
    .maybeSingle();
  if (!client) return htmlError('OAuth error', 'Unknown client_id. Re-register via /register.');
  if (!isAllowedRedirect(client, redirectUri)) {
    return htmlError('OAuth error', 'redirect_uri does not match a registered URI for this client.');
  }

  // From here, errors can be redirected back to the client.
  if (responseType !== 'code') {
    return errorRedirect(redirectUri, 'unsupported_response_type', 'Only response_type=code is supported', clientState ?? undefined);
  }
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    return errorRedirect(redirectUri, 'invalid_request', 'PKCE S256 is required', clientState ?? undefined);
  }
  // Audience validation per RFC 8707 — token must be bound to OUR resource.
  if (resource && resource !== RESOURCE_SERVER && resource !== RESOURCE_SERVER + '/') {
    return errorRedirect(redirectUri, 'invalid_target', `resource must be ${RESOURCE_SERVER}`, clientState ?? undefined);
  }

  // Generate our own state to round-trip through Google.
  const state = randomToken('st-');
  const expiresAt = new Date(Date.now() + PENDING_AUTH_TTL_SEC * 1000).toISOString();
  const { error: insErr } = await sb().from('oauth_pending_authorizations').insert({
    state,
    client_id: clientId,
    redirect_uri: redirectUri,
    client_state: clientState,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    resource: resource ?? RESOURCE_SERVER,
    scope,
    expires_at: expiresAt,
  });
  if (insErr) {
    console.error('[oauth/authorize] insert failed', insErr);
    return errorRedirect(redirectUri, 'server_error', undefined, clientState ?? undefined);
  }

  // Redirect to Google for actual user identity.
  const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleUrl.searchParams.set('client_id', Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!);
  googleUrl.searchParams.set('redirect_uri', GOOGLE_CALLBACK_URL);
  googleUrl.searchParams.set('response_type', 'code');
  googleUrl.searchParams.set('scope', 'openid email profile');
  googleUrl.searchParams.set('state', state);
  googleUrl.searchParams.set('prompt', 'select_account');
  googleUrl.searchParams.set('access_type', 'online');
  return Response.redirect(googleUrl.toString(), 302);
}

// ── Endpoint: GET /google-callback ──────────────────────────────────────
//
// Google sends the user back here after sign-in. We exchange the code for
// the user's email, check the allowlist, then mint our OWN auth code and
// redirect back to the original Claude client.

interface GoogleTokenResponse {
  access_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  email?: string;
  verified_email?: boolean;
}

async function googleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const googleErr = url.searchParams.get('error');
  await debugLog('callback_start', { hasCode: !!code, hasState: !!state, googleErr });

  if (!state) {
    await debugLog('callback_missing_state');
    return htmlError('Sign-in failed', 'Missing state parameter from Google.');
  }

  const { data: pending, error: pendingErr } = await sb()
    .from('oauth_pending_authorizations')
    .select('*')
    .eq('state', state)
    .maybeSingle();
  if (pendingErr) await debugLog('callback_pending_lookup_error', pendingErr);
  if (!pending) {
    await debugLog('callback_no_pending', { state });
    return htmlError('Sign-in failed', 'Authorization request expired or unknown. Start over.');
  }
  await debugLog('callback_pending_found', { client_id: pending.client_id, resource: pending.resource });

  // Pending row consumed regardless of outcome — single use.
  await sb().from('oauth_pending_authorizations').delete().eq('state', state);

  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await debugLog('callback_pending_expired', { expires_at: pending.expires_at });
    return errorRedirect(pending.redirect_uri, 'access_denied', 'Authorization expired', pending.client_state);
  }
  if (googleErr) {
    await debugLog('callback_google_returned_error', { googleErr });
    return errorRedirect(pending.redirect_uri, 'access_denied', `Google error: ${googleErr}`, pending.client_state);
  }
  if (!code) {
    await debugLog('callback_missing_code');
    return errorRedirect(pending.redirect_uri, 'invalid_request', 'Missing code from Google', pending.client_state);
  }

  // Exchange Google's code for an access token, then fetch the user email.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')!,
      redirect_uri: GOOGLE_CALLBACK_URL,
      grant_type: 'authorization_code',
    }),
  });
  const tokenJson = await tokenRes.json() as GoogleTokenResponse;
  if (!tokenRes.ok || !tokenJson.access_token) {
    await debugLog('callback_google_token_failed', { status: tokenRes.status, body: tokenJson });
    return errorRedirect(pending.redirect_uri, 'server_error', tokenJson.error_description ?? 'Google token exchange failed', pending.client_state);
  }
  await debugLog('callback_google_token_ok');

  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const userJson = await userRes.json() as GoogleUserInfo;
  if (!userRes.ok || !userJson.email || userJson.verified_email === false) {
    await debugLog('callback_userinfo_failed', { status: userRes.status, body: userJson });
    return errorRedirect(pending.redirect_uri, 'access_denied', 'Could not verify Google email', pending.client_state);
  }
  const email = userJson.email.toLowerCase();
  await debugLog('callback_got_email', { email });

  if (!(await emailAllowed(email))) {
    await debugLog('callback_email_not_allowlisted', { email });
    return errorRedirect(pending.redirect_uri, 'access_denied', `Email ${email} is not allowlisted for the Metrics MCP. Contact Nic if this is unexpected.`, pending.client_state);
  }

  // Mint our authorization code and redirect back to the Claude client.
  const authCode = randomToken('mcpac_');
  const codeExpires = new Date(Date.now() + AUTH_CODE_TTL_SEC * 1000).toISOString();
  const { error: insErr } = await sb().from('oauth_authorization_codes').insert({
    code: authCode,
    client_id: pending.client_id,
    redirect_uri: pending.redirect_uri,
    user_email: email,
    code_challenge: pending.code_challenge,
    code_challenge_method: pending.code_challenge_method,
    resource: pending.resource,
    scope: pending.scope,
    expires_at: codeExpires,
  });
  if (insErr) {
    await debugLog('callback_code_insert_failed', insErr);
    return errorRedirect(pending.redirect_uri, 'server_error', undefined, pending.client_state);
  }
  await debugLog('callback_code_minted', { redirect_uri: pending.redirect_uri });

  const back = new URL(pending.redirect_uri);
  back.searchParams.set('code', authCode);
  if (pending.client_state) back.searchParams.set('state', pending.client_state);
  return Response.redirect(back.toString(), 302);
}

// ── Endpoint: POST /token ───────────────────────────────────────────────
//
// Two grants supported:
//   authorization_code — redeems the code from /google-callback
//   refresh_token      — rotates a refresh token for a new access token

async function token(req: Request): Promise<Response> {
  const ct = req.headers.get('content-type') ?? '';
  let params: URLSearchParams;
  if (ct.includes('application/x-www-form-urlencoded')) {
    params = new URLSearchParams(await req.text());
  } else if (ct.includes('application/json')) {
    const j = await req.json() as Record<string, string>;
    params = new URLSearchParams(j);
  } else {
    return json({ error: 'invalid_request', error_description: 'Unsupported content-type' }, 400);
  }

  // Client auth: client_secret_basic OR client_secret_post.
  let clientId = params.get('client_id');
  let clientSecret = params.get('client_secret');
  const basic = req.headers.get('authorization');
  if (basic?.startsWith('Basic ')) {
    try {
      const decoded = atob(basic.slice(6));
      const idx = decoded.indexOf(':');
      if (idx > 0) {
        clientId = decoded.slice(0, idx);
        clientSecret = decoded.slice(idx + 1);
      }
    } catch {
      return json({ error: 'invalid_client' }, 401);
    }
  }
  if (!clientId) return json({ error: 'invalid_client', error_description: 'client_id required' }, 401);

  const { data: client } = await sb()
    .from('oauth_clients')
    .select('client_id, client_secret, redirect_uris')
    .eq('client_id', clientId)
    .maybeSingle();
  if (!client) return json({ error: 'invalid_client' }, 401);
  if (client.client_secret && client.client_secret !== clientSecret) {
    return json({ error: 'invalid_client' }, 401);
  }

  const grantType = params.get('grant_type');

  if (grantType === 'authorization_code') {
    const code = params.get('code');
    const redirectUri = params.get('redirect_uri');
    const codeVerifier = params.get('code_verifier');
    const resource = params.get('resource');
    if (!code || !redirectUri || !codeVerifier) {
      return json({ error: 'invalid_request', error_description: 'code, redirect_uri, code_verifier required' }, 400);
    }
    const { data: row } = await sb()
      .from('oauth_authorization_codes')
      .select('*')
      .eq('code', code)
      .maybeSingle();
    if (!row) return json({ error: 'invalid_grant' }, 400);
    if (row.consumed_at) return json({ error: 'invalid_grant', error_description: 'code already used' }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'invalid_grant', error_description: 'code expired' }, 400);
    if (row.client_id !== clientId) return json({ error: 'invalid_grant' }, 400);
    if (row.redirect_uri !== redirectUri) return json({ error: 'invalid_grant' }, 400);
    if (resource && resource !== row.resource && resource !== RESOURCE_SERVER) {
      return json({ error: 'invalid_target' }, 400);
    }
    if (!(await verifyPkce(codeVerifier, row.code_challenge))) {
      return json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
    }
    await sb().from('oauth_authorization_codes').update({ consumed_at: new Date().toISOString() }).eq('code', code);

    return await issueTokens({
      userEmail: row.user_email,
      clientId,
      audience: row.resource ?? RESOURCE_SERVER,
      note: 'oauth-issued',
    });
  }

  if (grantType === 'refresh_token') {
    const refreshToken = params.get('refresh_token');
    if (!refreshToken) return json({ error: 'invalid_request', error_description: 'refresh_token required' }, 400);
    const refreshHash = await sha256Hex(refreshToken);
    const { data: existing } = await sb()
      .from('mcp_tokens')
      .select('id, user_email, client_id, audience, refresh_expires_at, revoked_at')
      .eq('refresh_token_hash', refreshHash)
      .maybeSingle();
    if (!existing) return json({ error: 'invalid_grant' }, 400);
    if (existing.revoked_at) return json({ error: 'invalid_grant', error_description: 'refresh token revoked' }, 400);
    if (existing.client_id !== clientId) return json({ error: 'invalid_grant' }, 400);
    if (existing.refresh_expires_at && new Date(existing.refresh_expires_at).getTime() < Date.now()) {
      return json({ error: 'invalid_grant', error_description: 'refresh token expired' }, 400);
    }

    // Rotate: revoke the old token row entirely, issue a fresh access+refresh pair.
    await sb().from('mcp_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', existing.id);
    return await issueTokens({
      userEmail: existing.user_email,
      clientId,
      audience: existing.audience ?? RESOURCE_SERVER,
      note: 'oauth-refreshed',
    });
  }

  return json({ error: 'unsupported_grant_type' }, 400);
}

// Shared issuance: writes one row to mcp_tokens with both access + refresh
// hashes, returns the OAuth token response.
async function issueTokens(opts: {
  userEmail: string;
  clientId: string;
  audience: string;
  note: string;
}): Promise<Response> {
  const accessToken = randomToken('mcp_');
  const refreshToken = randomToken('mcpr_');
  const accessHash = await sha256Hex(accessToken);
  const refreshHash = await sha256Hex(refreshToken);
  const now = new Date();
  const accessExpires = new Date(now.getTime() + ACCESS_TOKEN_TTL_SEC * 1000).toISOString();
  const refreshExpires = new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000).toISOString();

  const { error: insErr } = await sb().from('mcp_tokens').insert({
    user_email: opts.userEmail,
    token_hash: accessHash,
    client_id: opts.clientId,
    audience: opts.audience,
    expires_at: accessExpires,
    refresh_token_hash: refreshHash,
    refresh_expires_at: refreshExpires,
    note: opts.note,
  });
  if (insErr) {
    console.error('[oauth/issueTokens] insert failed', insErr);
    return json({ error: 'server_error' }, 500);
  }
  return json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SEC,
    refresh_token: refreshToken,
    scope: 'mcp',
  });
}

// ── Router ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  const url = new URL(req.url);
  // Supabase routes by function slug, so the runtime sees /mcp-oauth/<route>;
  // strip the slug prefix to get just the route.
  const path = url.pathname.replace(/^\/mcp-oauth/, '') || '/';

  try {
    // Both RFC 8414 (oauth-authorization-server) and OIDC discovery
    // (openid-configuration) return the same metadata here. Some MCP clients
    // (including claude.ai) probe the OIDC path first, so serving both avoids
    // a 404 that aborts the whole connect flow.
    if (req.method === 'GET' && (
      path === '/.well-known/oauth-authorization-server' ||
      path === '/.well-known/openid-configuration'
    )) return metadata();
    if (req.method === 'POST' && path === '/register') return await register(req);
    if (req.method === 'GET' && path === '/authorize') return await authorize(req);
    if (req.method === 'GET' && path === '/google-callback') return await googleCallback(req);
    if (req.method === 'POST' && path === '/token') return await token(req);
    return json({ error: 'not_found', path }, 404);
  } catch (e) {
    console.error('[mcp-oauth] unhandled', e);
    return json({ error: 'server_error' }, 500);
  }
});
