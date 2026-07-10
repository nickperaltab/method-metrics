import { describe, expect, it, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { DbtManifest } from "../src/manifest.js";
import {
  MetricNotFoundError,
  firstSentence,
  getMeta,
  getSql,
  lineageTree,
  listMetrics,
  metricNodes,
  resolveMetric,
} from "../src/projections.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture: DbtManifest = JSON.parse(
  fs.readFileSync(path.join(here, "fixture-manifest.json"), "utf8"),
);

describe("metricNodes / listMetrics", () => {
  it("finds only v_metric__* models, sorted by name", () => {
    const nodes = metricNodes(fixture);
    expect(nodes.map(([, n]) => n.name)).toEqual(["v_metric__syncs", "v_metric__trials"]);
  });

  it("lists name, metric_id, status, first sentence of description", () => {
    const metrics = listMetrics(fixture);
    expect(metrics).toHaveLength(2);
    const trials = metrics.find((m) => m.name === "trials")!;
    expect(trials.model).toBe("v_metric__trials");
    expect(trials.metric_id).toBe("54");
    expect(trials.status).toBe("live");
    expect(trials.description).toBe("Count of new trial signups per month.");
  });

  it("filters by status", () => {
    expect(listMetrics(fixture, "live").map((m) => m.name)).toEqual(["trials"]);
    expect(listMetrics(fixture, "under_review").map((m) => m.name)).toEqual(["syncs"]);
    expect(listMetrics(fixture, "nope")).toEqual([]);
  });
});

describe("firstSentence", () => {
  it("takes the first sentence and collapses whitespace", () => {
    expect(firstSentence("One two.\nThree four.")).toBe("One two.");
    expect(firstSentence("No terminal punctuation here")).toBe("No terminal punctuation here");
    expect(firstSentence(undefined)).toBe("");
  });

  it("does not split on abbreviations without following space", () => {
    expect(firstSentence("Count of events! Second sentence.")).toBe("Count of events!");
  });
});

describe("getMeta — both meta locations", () => {
  it("prefers node.meta when non-empty", () => {
    const node = fixture.nodes["model.method_metrics.v_metric__trials"];
    expect(getMeta(node)).toMatchObject({ grain: "account-level" });
  });

  it("falls back to config.meta when node.meta is empty", () => {
    const node = fixture.nodes["model.method_metrics.v_metric__syncs"];
    expect(getMeta(node)).toMatchObject({ grain: "event-level" });
  });

  it("returns {} when both are empty/null", () => {
    const node = fixture.nodes["model.method_metrics.int_trials"];
    expect(getMeta(node)).toEqual({});
  });
});

describe("resolveMetric", () => {
  it("resolves by exact model name", () => {
    expect(resolveMetric(fixture, "v_metric__trials").node.name).toBe("v_metric__trials");
  });

  it("resolves by name without prefix", () => {
    expect(resolveMetric(fixture, "syncs").node.name).toBe("v_metric__syncs");
  });

  it("resolves by metric_id", () => {
    expect(resolveMetric(fixture, "54").node.name).toBe("v_metric__trials");
  });

  it("resolves a unique substring fuzzily", () => {
    expect(resolveMetric(fixture, "trial").node.name).toBe("v_metric__trials");
  });

  it("is case-insensitive", () => {
    expect(resolveMetric(fixture, "TRIALS").node.name).toBe("v_metric__trials");
  });

  it("throws with closest suggestions for unknown names", () => {
    try {
      resolveMetric(fixture, "trails");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MetricNotFoundError);
      const e = err as MetricNotFoundError;
      expect(e.suggestions.length).toBeGreaterThan(0);
      expect(e.suggestions.length).toBeLessThanOrEqual(3);
      expect(e.suggestions[0]).toBe("v_metric__trials");
      expect(e.message).toContain("v_metric__trials");
    }
  });
});

describe("lineageTree", () => {
  it("walks model → intermediate → source with indentation", () => {
    const tree = lineageTree(fixture, "model.method_metrics.v_metric__trials");
    expect(tree).toBe(
      ["v_metric__trials", "  int_trials", "    sources.revenue.Account"].join("\n"),
    );
  });

  it("is cycle-safe", () => {
    const cyclic: DbtManifest = JSON.parse(JSON.stringify(fixture));
    cyclic.parent_map!["model.method_metrics.int_trials"] = [
      "source.method_metrics.revenue.Account",
      "model.method_metrics.v_metric__trials",
    ];
    const tree = lineageTree(cyclic, "model.method_metrics.v_metric__trials");
    expect(tree).toContain("cycle — not expanded");
    // Terminates and still contains the source
    expect(tree).toContain("sources.revenue.Account");
  });
});

describe("getSql path resolution", () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-metrics-test-"));
    const rel = "models/metrics/v_metric__trials.sql";
    fs.mkdirSync(path.join(tmpRoot, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, rel), "SELECT 1 AS raw_sql\n");
    const compiledRel = path.join("target", "compiled", "method_metrics", rel);
    fs.mkdirSync(path.join(tmpRoot, path.dirname(compiledRel)), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, compiledRel), "SELECT 1 AS compiled_sql\n");
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("reads raw SQL from disk via original_file_path, plus compiled when present", () => {
    const result = getSql(fixture, "v_metric__trials", tmpRoot);
    expect(result.raw_sql).toContain("raw_sql");
    expect(result.raw_sql).not.toContain("placeholder");
    expect(result.compiled_sql).toContain("compiled_sql");
    expect(result.raw_path).toBe(path.join(tmpRoot, "models/metrics/v_metric__trials.sql"));
  });

  it("omits compiled SQL when no compiled file exists", () => {
    // int_trials has no compiled file in the tmp root — but also no raw file, so create one
    const rel = "models/intermediate/int_trials.sql";
    fs.mkdirSync(path.join(tmpRoot, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, rel), "SELECT 2\n");
    const result = getSql(fixture, "int_trials", tmpRoot);
    expect(result.raw_sql).toBe("SELECT 2\n");
    expect(result.compiled_sql).toBeUndefined();
  });

  it("serves intermediates, not just v_metric__* models", () => {
    expect(getSql(fixture, "int_trials", tmpRoot).model).toBe("int_trials");
  });

  it("errors clearly for unknown models", () => {
    expect(() => getSql(fixture, "does_not_exist", tmpRoot)).toThrow(/model not found/);
  });

  it("errors clearly when the .sql file is missing on disk", () => {
    const broken: DbtManifest = JSON.parse(JSON.stringify(fixture));
    broken.nodes["model.method_metrics.v_metric__trials"].original_file_path =
      "models/metrics/missing.sql";
    expect(() => getSql(broken, "v_metric__trials", tmpRoot)).toThrow(/not found on disk/);
  });
});
