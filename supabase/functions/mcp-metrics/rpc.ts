/**
 * JSON-RPC dispatcher for MCP messages. Pure logic — no HTTP, no Deno.serve.
 * Extracted so tests can import without triggering the server boot.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TOOLS, TOOLS_BY_NAME, type ToolContext } from './tools.ts';
import { writeAudit } from './audit.ts';
import { capture } from './posthog.ts';

const SERVER_INFO = { name: 'method-metrics', version: '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function rpcError(id: string | number | null | undefined, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function rpcResult(id: string | number | null | undefined, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

export async function handleRpc(msg: JsonRpcRequest, ctx: ToolContext) {
  switch (msg.method) {
    case 'initialize':
      return rpcResult(msg.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });

    case 'tools/list':
      return rpcResult(msg.id, {
        tools: TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: zodToJsonSchema(t.inputSchema, { target: 'jsonSchema7' }),
        })),
      });

    case 'tools/call': {
      const params = msg.params ?? {};
      const name = params.name as string;
      const args = params.arguments ?? {};
      const tool = TOOLS_BY_NAME.get(name);
      if (!tool) return rpcError(msg.id, -32601, `Unknown tool: ${name}`);

      const started = Date.now();
      try {
        const parsed = tool.inputSchema.parse(args);
        const out = await tool.handler(parsed, ctx);
        const latencyMs = Date.now() - started;
        writeAudit({
          tokenId: ctx.tokenId,
          tool: name,
          args,
          success: true,
          latencyMs,
          bytesBilled: out.bytesBilled,
          rowsReturned: out.rowsReturned,
        });
        capture({
          event: 'mcp_tool_called',
          distinctId: ctx.tokenId,
          properties: {
            tool: name,
            latency_ms: latencyMs,
            bytes_billed: out.bytesBilled ?? 0,
            rows_returned: out.rowsReturned ?? 0,
            success: true,
          },
        });
        return rpcResult(msg.id, {
          content: [{ type: 'text', text: JSON.stringify(out.content, null, 2) }],
        });
      } catch (err) {
        console.error(`[tool:${name}] error`, err);
        const latencyMs = Date.now() - started;
        const errorCode = (err as Error).name ?? 'Error';
        writeAudit({
          tokenId: ctx.tokenId,
          tool: name,
          args,
          success: false,
          errorCode,
          latencyMs,
        });
        capture({
          event: 'mcp_tool_errored',
          distinctId: ctx.tokenId,
          properties: { tool: name, error_code: errorCode, latency_ms: latencyMs },
        });
        return rpcError(msg.id, -32603, 'Tool execution failed. See server logs.');
      }
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;

    default:
      return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
