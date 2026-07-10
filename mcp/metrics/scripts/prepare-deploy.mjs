// Copies everything the deployed HTTP function needs into bundle/, mirroring
// repo-root-relative paths so REPO_ROOT=bundle/ just works:
//   bundle/target/manifest.json
//   bundle/models/**/*.sql
//   bundle/target/compiled/method_metrics/models/**/*.sql  (if present)
// bundle/ is generated, gitignored, and NOT .vercelignored (it must deploy).
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(pkgDir, "..", "..");
const bundleDir = path.join(pkgDir, "bundle");

function copyFile(srcAbs, relToRepoRoot) {
  const dest = path.join(bundleDir, relToRepoRoot);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(srcAbs, dest);
}

function copySqlTree(rootRel) {
  const rootAbs = path.join(repoRoot, rootRel);
  if (!fs.existsSync(rootAbs)) return 0;
  let count = 0;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile() && entry.name.endsWith(".sql")) {
        copyFile(abs, path.relative(repoRoot, abs));
        count++;
      }
    }
  };
  walk(rootAbs);
  return count;
}

fs.rmSync(bundleDir, { recursive: true, force: true });

const manifestSrc = path.join(repoRoot, "target", "manifest.json");
if (!fs.existsSync(manifestSrc)) {
  console.error(`manifest not found at ${manifestSrc} — run 'dbt parse' in the repo root first`);
  process.exit(1);
}
copyFile(manifestSrc, path.join("target", "manifest.json"));

const nModels = copySqlTree("models");
const nCompiled = copySqlTree(path.join("target", "compiled", "method_metrics", "models"));

console.log(
  `bundle/ ready: manifest.json + ${nModels} model .sql + ${nCompiled} compiled .sql`,
);
