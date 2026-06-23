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
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(projection));
console.log(`[dbt-models] wrote ${projection.models.length} models -> ${outPath}`);
