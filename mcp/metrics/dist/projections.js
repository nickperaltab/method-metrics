import * as fs from "node:fs";
import * as path from "node:path";
import { APPROVED_INTERMEDIATES, INTERMEDIATE_TIER_LABEL } from "./tiers.js";
export const METRIC_PREFIX = "v_metric__";
// ---------- meta / labels extraction ----------
/**
 * Definitions may carry meta at node.meta or node.config.meta.
 * Check both, prefer whichever is non-empty.
 */
export function getMeta(node) {
    const direct = node.meta ?? {};
    const config = node.config?.meta ?? {};
    if (Object.keys(direct).length > 0)
        return direct;
    if (Object.keys(config).length > 0)
        return config;
    return {};
}
export function getLabels(node) {
    return node.config?.labels ?? {};
}
export function firstSentence(text) {
    if (!text)
        return "";
    const oneLine = text.replace(/\s+/g, " ").trim();
    const match = oneLine.match(/^.*?[.!?](?=\s|$)/);
    return (match ? match[0] : oneLine).trim();
}
/** All manifest model nodes whose name starts with v_metric__, as [unique_id, node] pairs sorted by name. */
export function metricNodes(manifest) {
    return Object.entries(manifest.nodes ?? {})
        .filter(([, n]) => typeof n?.name === "string" && n.name.startsWith(METRIC_PREFIX))
        .sort(([, a], [, b]) => a.name.localeCompare(b.name));
}
export function listMetrics(manifest, status) {
    const entries = metricNodes(manifest).map(([, node]) => {
        const labels = getLabels(node);
        return {
            name: node.name.slice(METRIC_PREFIX.length),
            model: node.name,
            metric_id: labels.metric_id ?? "",
            status: labels.status ?? "",
            description: firstSentence(node.description),
        };
    });
    return status ? entries.filter((e) => e.status === status) : entries;
}
/**
 * Allowlisted intermediate model nodes present in the manifest, as
 * [unique_id, node] pairs sorted by name. Only APPROVED_INTERMEDIATES
 * (src/tiers.ts) are eligible — everything else is invisible in listings.
 */
export function intermediateNodes(manifest) {
    const allow = new Set(APPROVED_INTERMEDIATES);
    return Object.entries(manifest.nodes ?? {})
        .filter(([, n]) => (n?.resource_type ?? "model") === "model" &&
        typeof n?.name === "string" &&
        allow.has(n.name))
        .sort(([, a], [, b]) => a.name.localeCompare(b.name));
}
/** Column-level docs (name, description, meta) — for intermediates the columns ARE the definitions. */
export function columnDocs(node) {
    return Object.values(node.columns ?? {}).map((c) => ({
        name: c.name,
        description: c.description ?? "",
        meta: c.meta ?? {},
    }));
}
export function listIntermediates(manifest) {
    const present = intermediateNodes(manifest);
    const presentNames = new Set(present.map(([, n]) => n.name));
    const intermediates = present.map(([, node]) => {
        const grain = getMeta(node).grain;
        const entry = {
            name: node.name,
            tier: INTERMEDIATE_TIER_LABEL,
            description: firstSentence(node.description),
            documented_column_count: columnDocs(node).filter((c) => c.description).length,
        };
        if (typeof grain === "string" && grain)
            entry.grain = grain;
        return entry;
    });
    const missing = APPROVED_INTERMEDIATES.filter((name) => !presentNames.has(name)).sort();
    return { intermediates, missing };
}
// ---------- name resolution ----------
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0)
        return n;
    if (n === 0)
        return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const curr = [i];
        for (let j = 1; j <= n; j++) {
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = curr;
    }
    return prev[n];
}
export class MetricNotFoundError extends Error {
    suggestions;
    constructor(query, suggestions) {
        super(`metric not found: "${query}"` +
            (suggestions.length ? ` — closest matches: ${suggestions.join(", ")}` : ""));
        this.suggestions = suggestions;
    }
}
/**
 * Resolve a metric by exact model name, name without the v_metric__ prefix,
 * metric_id label, or fuzzy match (substring, then edit distance).
 * Throws MetricNotFoundError with the 3 closest names on failure.
 */
export function resolveMetric(manifest, query) {
    const metrics = metricNodes(manifest);
    const q = query.trim().toLowerCase();
    for (const [id, node] of metrics) {
        if (node.name.toLowerCase() === q)
            return { id, node };
    }
    for (const [id, node] of metrics) {
        if (node.name.toLowerCase() === METRIC_PREFIX + q)
            return { id, node };
    }
    for (const [id, node] of metrics) {
        if (getLabels(node).metric_id === query.trim())
            return { id, node };
    }
    // Fuzzy: unique substring match wins outright.
    const substr = metrics.filter(([, n]) => n.name.toLowerCase().includes(q));
    if (substr.length === 1)
        return { id: substr[0][0], node: substr[0][1] };
    // Rank all candidates: substring matches first, then by edit distance on the short name.
    const ranked = metrics
        .map(([, n]) => {
        const short = n.name.slice(METRIC_PREFIX.length).toLowerCase();
        return {
            name: n.name,
            isSubstr: n.name.toLowerCase().includes(q),
            dist: Math.min(levenshtein(q, short), levenshtein(q, n.name.toLowerCase())),
        };
    })
        .sort((a, b) => Number(b.isSubstr) - Number(a.isSubstr) || a.dist - b.dist);
    throw new MetricNotFoundError(query, ranked.slice(0, 3).map((r) => r.name));
}
/**
 * Resolve an allowlisted intermediate by exact name, then fuzzy
 * (unique substring match). Returns null when nothing matches —
 * non-allowlisted models are never resolved here.
 */
export function resolveIntermediate(manifest, query) {
    const intermediates = intermediateNodes(manifest);
    const q = query.trim().toLowerCase();
    for (const [id, node] of intermediates) {
        if (node.name.toLowerCase() === q)
            return { id, node };
    }
    const substr = intermediates.filter(([, n]) => n.name.toLowerCase().includes(q));
    if (substr.length === 1)
        return { id: substr[0][0], node: substr[0][1] };
    return null;
}
/**
 * Tiered resolution: verified metrics first (resolveMetric — exact, metric_id,
 * fuzzy); only if that fails, try the intermediates allowlist. A metric always
 * wins over an intermediate on ambiguity. If neither tier matches, rethrows
 * the MetricNotFoundError (with metric-name suggestions).
 */
export function resolveTiered(manifest, query) {
    try {
        return { ...resolveMetric(manifest, query), tier: "metric" };
    }
    catch (err) {
        const intermediate = resolveIntermediate(manifest, query);
        if (intermediate)
            return { ...intermediate, tier: "intermediate" };
        throw err;
    }
}
// ---------- lineage ----------
function displayName(id, manifest) {
    if (id.startsWith("source.")) {
        // source.<project>.<source_name>.<table> → sources.<source_name>.<table>
        const parts = id.split(".");
        return `sources.${parts.slice(2).join(".")}`;
    }
    return manifest.nodes?.[id]?.name ?? id;
}
/**
 * Walk parent_map recursively from a node down to sources.
 * Returns an indented text tree. Cycle-safe (repeat visits are marked, not expanded).
 */
export function lineageTree(manifest, rootId) {
    const parentMap = manifest.parent_map ?? {};
    const lines = [];
    const walk = (id, depth, seen) => {
        const indent = "  ".repeat(depth);
        const label = displayName(id, manifest);
        if (seen.has(id)) {
            lines.push(`${indent}${label} (cycle — not expanded)`);
            return;
        }
        lines.push(indent + label);
        const nextSeen = new Set(seen).add(id);
        for (const parent of parentMap[id] ?? []) {
            walk(parent, depth + 1, nextSeen);
        }
    };
    walk(rootId, 0, new Set());
    return lines.join("\n");
}
/** Find any model node (not just v_metric__*) by exact name. */
export function findModel(manifest, name) {
    const q = name.trim().toLowerCase();
    for (const [id, node] of Object.entries(manifest.nodes ?? {})) {
        if ((node.resource_type ?? "model") === "model" && node.name?.toLowerCase() === q) {
            return { id, node };
        }
    }
    return null;
}
/**
 * Read a model's SQL from disk via original_file_path (manifest raw_code can be
 * a placeholder — never serve it). Includes compiled SQL if present under
 * target/compiled/method_metrics/<original_file_path>.
 */
export function getSql(manifest, modelName, repoRoot) {
    const found = findModel(manifest, modelName);
    if (!found) {
        throw new Error(`model not found: "${modelName}"`);
    }
    const rel = found.node.original_file_path;
    if (!rel) {
        throw new Error(`model "${modelName}" has no original_file_path in the manifest`);
    }
    const rawPath = path.join(repoRoot, rel);
    let rawSql;
    try {
        rawSql = fs.readFileSync(rawPath, "utf8");
    }
    catch {
        throw new Error(`SQL file not found on disk at ${rawPath}`);
    }
    const result = { model: found.node.name, raw_path: rawPath, raw_sql: rawSql };
    const compiledPath = path.join(repoRoot, "target", "compiled", "method_metrics", rel);
    if (fs.existsSync(compiledPath)) {
        result.compiled_path = compiledPath;
        result.compiled_sql = fs.readFileSync(compiledPath, "utf8");
    }
    return result;
}
