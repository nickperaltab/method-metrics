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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });

  const auth = await verifyBearer(req);
  if (!auth.ok) return jsonResponse({ error: 'unauthorized', reason: auth.reason }, 401);

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
