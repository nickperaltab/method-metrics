#!/usr/bin/env node
// Reads the committed dbt manifest and writes the app-facing projection.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectManifest } from '../builder/src/lib/dbtProjection.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const manifestPath = resolve(repoRoot, 'target/manifest.json');
const outPath = resolve(repoRoot, 'builder/public/dbt-models.json');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  console.warn(`[dbt-models] no manifest at ${manifestPath} (${e.code}); writing empty projection.`);
  manifest = { nodes: {} };
}
const projection = projectManifest(manifest);

// Post-process: replace compiled_sql with the actual SQL file from disk.
// The manifest's raw_code / compiled_code is often a parse placeholder; the
// committed .sql file is the real source of truth.
for (const model of projection.models) {
  try {
    if (!model.original_file_path) throw new Error('no original_file_path');
    const sqlPath = resolve(repoRoot, model.original_file_path);
    model.compiled_sql = readFileSync(sqlPath, 'utf8');
  } catch {
    // Fall back to whatever projectManifest already set; if it's the sentinel
    // placeholder, treat it as empty.
    if (model.compiled_sql === '--placeholder--') {
      model.compiled_sql = '';
    }
  }
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(projection));
console.log(`[dbt-models] wrote ${projection.models.length} models -> ${outPath}`);
