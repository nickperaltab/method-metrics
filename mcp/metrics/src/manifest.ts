import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** Minimal shape of the dbt manifest slices this server reads. */
export interface DbtNode {
  name: string;
  resource_type?: string;
  description?: string;
  original_file_path?: string;
  meta?: Record<string, unknown>;
  config?: {
    meta?: Record<string, unknown> | null;
    labels?: Record<string, string> | null;
  } | null;
}

export interface DbtManifest {
  nodes: Record<string, DbtNode>;
  sources?: Record<string, DbtNode>;
  parent_map?: Record<string, string[]>;
}

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Repo root = two levels up from mcp/metrics/. */
export const repoRoot = path.resolve(pkgDir, "..", "..");

/**
 * Base directory used to resolve model .sql files (getSql) and the default
 * manifest location. Overridable via REPO_ROOT — the deployed HTTP function
 * points this at its self-contained bundle/ copy, since ../../ doesn't exist
 * at runtime there.
 */
export function getRepoRoot(): string {
  return process.env.REPO_ROOT ? path.resolve(process.env.REPO_ROOT) : repoRoot;
}

export function manifestPath(): string {
  return process.env.DBT_MANIFEST_PATH
    ? path.resolve(process.env.DBT_MANIFEST_PATH)
    : path.join(getRepoRoot(), "target", "manifest.json");
}

let cache: { path: string; mtimeMs: number; data: DbtManifest } | null = null;

/**
 * Lazy-load the manifest; re-stat on every call and reload if mtime changed.
 * Throws a clear error if the file is missing.
 */
export function loadManifest(): DbtManifest {
  const p = manifestPath();
  let st: fs.Stats;
  try {
    st = fs.statSync(p);
  } catch {
    throw new Error(`manifest not found at ${p} — run \`dbt parse\` in the repo root`);
  }
  if (!cache || cache.path !== p || cache.mtimeMs !== st.mtimeMs) {
    cache = { path: p, mtimeMs: st.mtimeMs, data: JSON.parse(fs.readFileSync(p, "utf8")) };
  }
  return cache.data;
}

/** Test hook. */
export function _clearManifestCache(): void {
  cache = null;
}
