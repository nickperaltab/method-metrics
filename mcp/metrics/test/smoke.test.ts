import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { listMetrics } from "../src/projections.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const realManifestPath = path.resolve(here, "..", "..", "..", "target", "manifest.json");

describe.skipIf(!fs.existsSync(realManifestPath))("real manifest smoke", () => {
  it("list_metrics returns at least 15 metrics", () => {
    const manifest = JSON.parse(fs.readFileSync(realManifestPath, "utf8"));
    const metrics = listMetrics(manifest);
    expect(metrics.length).toBeGreaterThanOrEqual(15);
    // Every entry has a model name and the v_metric__ prefix stripped in `name`
    for (const m of metrics) {
      expect(m.model.startsWith("v_metric__")).toBe(true);
      expect(m.name).toBe(m.model.slice("v_metric__".length));
    }
  });
});
