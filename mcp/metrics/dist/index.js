import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadManifest, repoRoot } from "./manifest.js";
import { getLabels, getMeta, getSql, lineageTree, listMetrics, resolveMetric, } from "./projections.js";
const server = new McpServer({
    name: "method-metrics",
    version: "0.1.0",
});
function ok(text) {
    return { content: [{ type: "text", text }] };
}
function fail(err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
server.registerTool("list_metrics", {
    title: "List metrics",
    description: "List every verified dbt metric model (v_metric__*) with its metric_id, status label, and a one-line description. Optionally filter by status (e.g. 'live'). Read-only; served from the dbt manifest.",
    inputSchema: {
        status: z
            .string()
            .optional()
            .describe("Optional status label filter, e.g. 'live' or 'under_review'"),
    },
}, async ({ status }) => {
    try {
        const metrics = listMetrics(loadManifest(), status);
        return ok(JSON.stringify({ count: metrics.length, metrics }, null, 2));
    }
    catch (err) {
        return fail(err);
    }
});
server.registerTool("get_metric", {
    title: "Get metric definition",
    description: "Get the full definition of one metric: description, meta block (grain, filters, methodology source, parity, caveats), labels, and model path. Accepts the model name (with or without the v_metric__ prefix), the metric_id, or a fuzzy name. Read-only.",
    inputSchema: {
        metric: z
            .string()
            .describe("Metric name (e.g. 'trials' or 'v_metric__trials') or metric_id (e.g. '54')"),
    },
}, async ({ metric }) => {
    try {
        const { node } = resolveMetric(loadManifest(), metric);
        return ok(JSON.stringify({
            model: node.name,
            path: node.original_file_path ?? "",
            description: node.description ?? "",
            meta: getMeta(node),
            labels: getLabels(node),
        }, null, 2));
    }
    catch (err) {
        return fail(err);
    }
});
server.registerTool("get_lineage", {
    title: "Get metric lineage",
    description: "Walk a metric's upstream dependency chain (via the dbt manifest parent_map) from the metric model through intermediates down to raw sources. Returns an indented text tree. Accepts model name, short name, or metric_id. Read-only.",
    inputSchema: {
        metric: z.string().describe("Metric name or metric_id"),
    },
}, async ({ metric }) => {
    try {
        const manifest = loadManifest();
        const { id } = resolveMetric(manifest, metric);
        return ok(lineageTree(manifest, id));
    }
    catch (err) {
        return fail(err);
    }
});
server.registerTool("get_sql", {
    title: "Get model SQL",
    description: "Get a dbt model's SQL, read from the .sql file on disk (manifest raw_code is not trusted — it can be a placeholder). Works for any model, including intermediates (int_*), not just v_metric__* views. Includes the compiled SQL from target/compiled/ when present, labeled separately. Read-only.",
    inputSchema: {
        model: z.string().describe("Exact model name, e.g. 'v_metric__trials' or 'int_customer_mrr'"),
    },
}, async ({ model }) => {
    try {
        const result = getSql(loadManifest(), model, repoRoot);
        let text = `-- RAW SQL (${result.raw_path})\n\n${result.raw_sql}`;
        if (result.compiled_sql) {
            text += `\n\n-- COMPILED SQL (${result.compiled_path})\n\n${result.compiled_sql}`;
        }
        return ok(text);
    }
    catch (err) {
        return fail(err);
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
