/**
 * Local smoke tests for the JSON-RPC dispatcher. No network needed — exercises
 * the protocol wiring with the health_check tool (which reads nothing external).
 *
 * Run:
 *   cd supabase/functions/mcp-metrics
 *   deno test --allow-env tests/
 */
import { assert, assertEquals, assertExists } from 'jsr:@std/assert';
import { handleRpc } from '../rpc.ts';
import { DASHBOARDS, getDashboardRow } from '../catalog.ts';
import { classifyFreshness } from '../snapshots.ts';

const CTX = { tokenId: 'test-token', userEmail: 'test@example.com' };

Deno.test('initialize responds with protocolVersion and serverInfo', async () => {
  const res = await handleRpc(
    { jsonrpc: '2.0', id: 1, method: 'initialize' },
    CTX,
  );
  assertExists(res);
  assertEquals((res as { result: { serverInfo: { name: string } } }).result.serverInfo.name, 'method-metrics');
});

Deno.test('tools/list returns all registered tools with JSON schemas', async () => {
  const res = await handleRpc(
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    CTX,
  ) as { result: { tools: Array<{ name: string; inputSchema: object }> } };
  const names = res.result.tools.map(t => t.name);
  assert(names.includes('health_check'), 'health_check missing');
  assert(names.includes('list_metrics'), 'list_metrics missing');
  assert(names.includes('get_metric'), 'get_metric missing');
  assert(names.includes('query_metric'), 'query_metric missing');
  assert(names.includes('list_dashboards'), 'list_dashboards missing');
  assert(names.includes('get_dashboard'), 'get_dashboard missing');
  // Every tool must have a real schema, not the placeholder
  for (const t of res.result.tools) {
    assertExists(t.inputSchema);
  }
});

Deno.test('tools/call health_check returns ok + user', async () => {
  const res = await handleRpc(
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'health_check', arguments: {} } },
    CTX,
  ) as { result: { content: Array<{ text: string }> } };
  const payload = JSON.parse(res.result.content[0].text);
  assertEquals(payload.ok, true);
  assertEquals(payload.user, 'test@example.com');
});

Deno.test('tools/call unknown tool returns -32601', async () => {
  const res = await handleRpc(
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nonsense', arguments: {} } },
    CTX,
  ) as { error: { code: number } };
  assertEquals(res.error.code, -32601);
});

Deno.test('unknown method returns -32601', async () => {
  const res = await handleRpc(
    { jsonrpc: '2.0', id: 5, method: 'wat' },
    CTX,
  ) as { error: { code: number } };
  assertEquals(res.error.code, -32601);
});

Deno.test('notifications return null (no response)', async () => {
  const res = await handleRpc(
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    CTX,
  );
  assertEquals(res, null);
});

Deno.test('list_dashboards filters by group', async () => {
  const res = await handleRpc(
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'list_dashboards', arguments: { group: 'plan' } } },
    CTX,
  ) as { result: { content: Array<{ text: string }> } };
  const payload = JSON.parse(res.result.content[0].text);
  assert(payload.count > 0);
  for (const d of payload.dashboards) assertEquals(d.group, 'plan');
});

Deno.test('getDashboardRow resolves known ids', () => {
  assertExists(getDashboardRow('marketing-scorecard'));
  assertEquals(getDashboardRow('marketing-scorecard')?.title, 'Marketing Scorecard');
  assertEquals(getDashboardRow('does-not-exist'), null);
});

Deno.test('DASHBOARDS catalog is non-empty and well-formed', () => {
  assert(DASHBOARDS.length > 0);
  for (const d of DASHBOARDS) {
    assert(d.id.length > 0);
    assert(d.title.length > 0);
    assert(d.description.length > 0);
  }
});

Deno.test('classifyFreshness buckets', () => {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();
  assertEquals(classifyFreshness(hoursAgo(1), now), 'fresh');
  assertEquals(classifyFreshness(hoursAgo(29), now), 'fresh');
  assertEquals(classifyFreshness(hoursAgo(31), now), 'stale');
  assertEquals(classifyFreshness(hoursAgo(47), now), 'stale');
  assertEquals(classifyFreshness(hoursAgo(49), now), 'expired');
  assertEquals(classifyFreshness(null, now), 'expired');
});
