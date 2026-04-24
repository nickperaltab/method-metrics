/**
 * Metrics MCP — remote MCP server over HTTP for Claude Desktop.
 *
 * Transport: JSON-RPC over HTTP POST. Stateless — each request carries its own
 * bearer token and is handled independently. Suits serverless.
 *
 * Flow per request:
 *   1. verifyBearer → tokenId + userEmail (or 401)
 *   2. parse JSON-RPC message from body
 *   3. dispatch via handleRpc (in rpc.ts)
 *   4. return JSON-RPC response
 *
 * Error sanitization: raw errors never reach the client. See rpc.ts.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { verifyBearer } from './auth.ts';
import { handleRpc, type JsonRpcRequest } from './rpc.ts';
import type { ToolContext } from './tools.ts';

const RESOURCE_SERVER = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mcp-metrics`;
const AUTH_SERVER = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mcp-oauth`;
const RESOURCE_METADATA_URL = `${RESOURCE_SERVER}/.well-known/oauth-protected-resource`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'WWW-Authenticate',
};

function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json', ...extraHeaders },
  });
}

// RFC 9728 Protected Resource Metadata. MCP clients fetch this to discover
// which OAuth authorization server protects this resource.
function resourceMetadata(): Response {
  return jsonResponse({
    resource: RESOURCE_SERVER,
    authorization_servers: [AUTH_SERVER],
    bearer_methods_supported: ['header'],
    scopes_supported: ['mcp'],
  });
}

// Per RFC 9728 §5.1, the WWW-Authenticate header on a 401 must point clients
// at the resource metadata document so they can discover the auth server.
function unauthorized(reason?: string): Response {
  const wwwAuth = `Bearer realm="${RESOURCE_SERVER}", resource_metadata="${RESOURCE_METADATA_URL}"`;
  return jsonResponse({ error: 'unauthorized', reason }, 401, { 'WWW-Authenticate': wwwAuth });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const url = new URL(req.url);
  // Supabase routes by function slug; runtime sees /mcp-metrics/<route>.
  const path = url.pathname.replace(/^\/mcp-metrics/, '') || '/';

  // Public discovery endpoint — no auth required (per RFC 9728).
  if (req.method === 'GET' && path === '/.well-known/oauth-protected-resource') {
    return resourceMetadata();
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  const auth = await verifyBearer(req);
  if (!auth.ok) return unauthorized(auth.reason);

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400);
  }

  const ctx: ToolContext = { tokenId: auth.tokenId!, userEmail: auth.userEmail! };
  const messages = Array.isArray(body) ? body : [body];
  const responses = (await Promise.all(messages.map(m => handleRpc(m, ctx)))).filter(r => r !== null);
  return jsonResponse(Array.isArray(body) ? responses : responses[0]);
});
