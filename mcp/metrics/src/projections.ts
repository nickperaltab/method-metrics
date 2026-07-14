import * as fs from "node:fs";
import * as path from "node:path";
import type { DbtColumn, DbtManifest, DbtNode } from "./manifest.js";
import { APPROVED_INTERMEDIATES, INTERMEDIATE_TIER_LABEL } from "./tiers.js";

export const METRIC_PREFIX = "v_metric__";

// ---------- meta / labels extraction ----------

/**
 * Definitions may carry meta at node.meta or node.config.meta.
 * Check both, prefer whichever is non-empty.
 */
export function getMeta(node: DbtNode): Record<string, unknown> {
  const direct = node.meta ?? {};
  const config = node.config?.meta ?? {};
  if (Object.keys(direct).length > 0) return direct;
  if (Object.keys(config).length > 0) return config;
  return {};
}

export function getLabels(node: DbtNode): Record<string, string> {
  return node.config?.labels ?? {};
}

export function firstSentence(text: string | undefined): string {
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  const match = oneLine.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : oneLine).trim();
}

// ---------- metric listing ----------

export interface MetricListEntry {
  name: string;
  model: string;
  metric_id: string;
  status: string;
  description: string;
}

/** All manifest model nodes whose name starts with v_metric__, as [unique_id, node] pairs sorted by name. */
export function metricNodes(manifest: DbtManifest): Array<[string, DbtNode]> {
  return Object.entries(manifest.nodes ?? {})
    .filter(([, n]) => typeof n?.name === "string" && n.name.startsWith(METRIC_PREFIX))
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));
}

export function listMetrics(manifest: DbtManifest, status?: string): MetricListEntry[] {
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

// ---------- intermediates tier ----------

export interface IntermediateListEntry {
  name: string;
  tier: string;
  grain?: string;
  description: string;
  documented_column_count: number;
}

export interface IntermediateList {
  intermediates: IntermediateListEntry[];
  /** Allowlisted models absent from the manifest (not yet parsed) — omitted from `intermediates`. */
  missing: string[];
}

/**
 * Allowlisted intermediate model nodes present in the manifest, as
 * [unique_id, node] pairs sorted by name. Only APPROVED_INTERMEDIATES
 * (src/tiers.ts) are eligible — everything else is invisible in listings.
 */
export function intermediateNodes(manifest: DbtManifest): Array<[string, DbtNode]> {
  const allow = new Set(APPROVED_INTERMEDIATES);
  return Object.entries(manifest.nodes ?? {})
    .filter(
      ([, n]) =>
        (n?.resource_type ?? "model") === "model" &&
        typeof n?.name === "string" &&
        allow.has(n.name),
    )
    .sort(([, a], [, b]) => a.name.localeCompare(b.name));
}

/** Column-level docs (name, description, meta) — for intermediates the columns ARE the definitions. */
export function columnDocs(node: DbtNode): Array<{
  name: string;
  description: string;
  meta: Record<string, unknown>;
}> {
  return Object.values(node.columns ?? {}).map((c: DbtColumn) => ({
    name: c.name,
    description: c.description ?? "",
    meta: c.meta ?? {},
  }));
}

export function listIntermediates(manifest: DbtManifest): IntermediateList {
  const present = intermediateNodes(manifest);
  const presentNames = new Set(present.map(([, n]) => n.name));
  const intermediates = present.map(([, node]) => {
    const grain = getMeta(node).grain;
    const entry: IntermediateListEntry = {
      name: node.name,
      tier: INTERMEDIATE_TIER_LABEL,
      description: firstSentence(node.description),
      documented_column_count: columnDocs(node).filter((c) => c.description).length,
    };
    if (typeof grain === "string" && grain) entry.grain = grain;
    return entry;
  });
  const missing = APPROVED_INTERMEDIATES.filter((name) => !presentNames.has(name)).sort();
  return { intermediates, missing };
}

// ---------- name resolution ----------

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = curr;
  }
  return prev[n];
}

export interface Resolution {
  id: string;
  node: DbtNode;
}

export class MetricNotFoundError extends Error {
  suggestions: string[];
  constructor(query: string, suggestions: string[]) {
    super(
      `metric not found: "${query}"` +
        (suggestions.length ? ` — closest matches: ${suggestions.join(", ")}` : ""),
    );
    this.suggestions = suggestions;
  }
}

/**
 * Resolve a metric by exact model name, name without the v_metric__ prefix,
 * metric_id label, or fuzzy match (substring, then edit distance).
 * Throws MetricNotFoundError with the 3 closest names on failure.
 */
export function resolveMetric(manifest: DbtManifest, query: string): Resolution {
  const metrics = metricNodes(manifest);
  const q = query.trim().toLowerCase();

  for (const [id, node] of metrics) {
    if (node.name.toLowerCase() === q) return { id, node };
  }
  for (const [id, node] of metrics) {
    if (node.name.toLowerCase() === METRIC_PREFIX + q) return { id, node };
  }
  for (const [id, node] of metrics) {
    if (getLabels(node).metric_id === query.trim()) return { id, node };
  }

  // Fuzzy: unique substring match wins outright.
  const substr = metrics.filter(([, n]) => n.name.toLowerCase().includes(q));
  if (substr.length === 1) return { id: substr[0][0], node: substr[0][1] };

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

export type TieredResolution = Resolution & { tier: "metric" | "intermediate" };

/**
 * Resolve an allowlisted intermediate by exact name, then fuzzy
 * (unique substring match). Returns null when nothing matches —
 * non-allowlisted models are never resolved here.
 */
export function resolveIntermediate(manifest: DbtManifest, query: string): Resolution | null {
  const intermediates = intermediateNodes(manifest);
  const q = query.trim().toLowerCase();

  for (const [id, node] of intermediates) {
    if (node.name.toLowerCase() === q) return { id, node };
  }
  const substr = intermediates.filter(([, n]) => n.name.toLowerCase().includes(q));
  if (substr.length === 1) return { id: substr[0][0], node: substr[0][1] };
  return null;
}

/**
 * Tiered resolution: verified metrics first (resolveMetric — exact, metric_id,
 * fuzzy); only if that fails, try the intermediates allowlist. A metric always
 * wins over an intermediate on ambiguity. If neither tier matches, rethrows
 * the MetricNotFoundError (with metric-name suggestions).
 */
export function resolveTiered(manifest: DbtManifest, query: string): TieredResolution {
  try {
    return { ...resolveMetric(manifest, query), tier: "metric" };
  } catch (err) {
    const intermediate = resolveIntermediate(manifest, query);
    if (intermediate) return { ...intermediate, tier: "intermediate" };
    throw err;
  }
}

// ---------- lineage ----------

function displayName(id: string, manifest: DbtManifest): string {
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
export function lineageTree(manifest: DbtManifest, rootId: string): string {
  const parentMap = manifest.parent_map ?? {};
  const lines: string[] = [];
  const walk = (id: string, depth: number, seen: Set<string>) => {
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

// ---------- SQL ----------

export interface SqlResult {
  model: string;
  raw_path: string;
  raw_sql: string;
  compiled_path?: string;
  compiled_sql?: string;
}

/** Find any model node (not just v_metric__*) by exact name. */
export function findModel(manifest: DbtManifest, name: string): Resolution | null {
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
export function getSql(manifest: DbtManifest, modelName: string, repoRoot: string): SqlResult {
  const found = findModel(manifest, modelName);
  if (!found) {
    throw new Error(`model not found: "${modelName}"`);
  }
  const rel = found.node.original_file_path;
  if (!rel) {
    throw new Error(`model "${modelName}" has no original_file_path in the manifest`);
  }
  const rawPath = path.join(repoRoot, rel);
  let rawSql: string;
  try {
    rawSql = fs.readFileSync(rawPath, "utf8");
  } catch {
    throw new Error(`SQL file not found on disk at ${rawPath}`);
  }
  const result: SqlResult = { model: found.node.name, raw_path: rawPath, raw_sql: rawSql };

  const compiledPath = path.join(repoRoot, "target", "compiled", "method_metrics", rel);
  if (fs.existsSync(compiledPath)) {
    result.compiled_path = compiledPath;
    result.compiled_sql = fs.readFileSync(compiledPath, "utf8");
  }
  return result;
}
