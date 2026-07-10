import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** Repo root = two levels up from mcp/metrics/. */
export const repoRoot = path.resolve(pkgDir, "..", "..");
/**
 * Base directory used to resolve model .sql files (getSql) and the default
 * manifest location. Overridable via REPO_ROOT — the deployed HTTP function
 * points this at its self-contained bundle/ copy, since ../../ doesn't exist
 * at runtime there.
 */
export function getRepoRoot() {
    return process.env.REPO_ROOT ? path.resolve(process.env.REPO_ROOT) : repoRoot;
}
export function manifestPath() {
    return process.env.DBT_MANIFEST_PATH
        ? path.resolve(process.env.DBT_MANIFEST_PATH)
        : path.join(getRepoRoot(), "target", "manifest.json");
}
let cache = null;
/**
 * Lazy-load the manifest; re-stat on every call and reload if mtime changed.
 * Throws a clear error if the file is missing.
 */
export function loadManifest() {
    const p = manifestPath();
    let st;
    try {
        st = fs.statSync(p);
    }
    catch {
        throw new Error(`manifest not found at ${p} — run \`dbt parse\` in the repo root`);
    }
    if (!cache || cache.path !== p || cache.mtimeMs !== st.mtimeMs) {
        cache = { path: p, mtimeMs: st.mtimeMs, data: JSON.parse(fs.readFileSync(p, "utf8")) };
    }
    return cache.data;
}
/** Test hook. */
export function _clearManifestCache() {
    cache = null;
}
