import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { DbtManifest } from "../src/manifest.js";
import {
  MetricNotFoundError,
  columnDocs,
  lineageTree,
  listIntermediates,
  listMetrics,
  resolveTiered,
} from "../src/projections.js";
import {
  APPROVED_INTERMEDIATES,
  INTERMEDIATE_TIER_LABEL,
  INTERMEDIATE_WARNING,
} from "../src/tiers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture: DbtManifest = JSON.parse(
  fs.readFileSync(path.join(here, "fixture-manifest.json"), "utf8"),
);

describe("allowlist (src/tiers.ts)", () => {
  it("contains exactly the 13 approved models", () => {
    expect(APPROVED_INTERMEDIATES).toHaveLength(13);
    expect(APPROVED_INTERMEDIATES).toContain("int_customer_firmographics");
    expect(APPROVED_INTERMEDIATES).toContain("v_channel_arr");
    expect(APPROVED_INTERMEDIATES).toContain("v_partner_scorecard");
    // Pending rename — deliberately not exposed.
    expect(APPROVED_INTERMEDIATES).not.toContain("int_motion_funnel");
  });
});

describe("listIntermediates", () => {
  it("lists only allowlisted models present in the manifest", () => {
    const { intermediates } = listIntermediates(fixture);
    expect(intermediates.map((i) => i.name)).toEqual(["int_customer_firmographics"]);
  });

  it("carries the tier label, grain from meta, one-line description, and documented-column count", () => {
    const { intermediates } = listIntermediates(fixture);
    const firmo = intermediates[0];
    expect(firmo.tier).toBe(INTERMEDIATE_TIER_LABEL);
    expect(firmo.tier).toBe("intermediate — not a verified metric");
    expect(firmo.grain).toBe("customer-level (EntityRecordID)");
    expect(firmo.description).toBe(
      "Firmographic dimension table, entity grain: one row per EntityRecordID.",
    );
    // 3 columns in the fixture, only 2 have descriptions
    expect(firmo.documented_column_count).toBe(2);
  });

  it("omits grain when meta has none", () => {
    const noGrain: DbtManifest = JSON.parse(JSON.stringify(fixture));
    delete (noGrain.nodes["model.method_metrics.int_customer_firmographics"].meta as any).grain;
    const { intermediates } = listIntermediates(noGrain);
    expect(intermediates[0].grain).toBeUndefined();
  });

  it("reports allowlisted models absent from the manifest in `missing`", () => {
    const { intermediates, missing } = listIntermediates(fixture);
    expect(missing).not.toContain("int_customer_firmographics");
    expect(missing).toContain("int_channel_cac");
    expect(missing).toContain("v_partner_scorecard");
    expect(intermediates.length + missing.length).toBe(APPROVED_INTERMEDIATES.length);
  });

  it("never lists non-allowlisted models", () => {
    const { intermediates } = listIntermediates(fixture);
    const names = intermediates.map((i) => i.name);
    expect(names).not.toContain("int_secret_scratch");
    expect(names).not.toContain("int_trials");
  });

  it("sorts entries by name", () => {
    const two: DbtManifest = JSON.parse(JSON.stringify(fixture));
    two.nodes["model.method_metrics.v_partner_scorecard"] = {
      name: "v_partner_scorecard",
      resource_type: "model",
      description: "Partner rollup.",
      meta: {},
      config: { meta: null, labels: null },
    };
    two.nodes["model.method_metrics.int_channel_cac"] = {
      name: "int_channel_cac",
      resource_type: "model",
      description: "CAC per channel.",
      meta: {},
      config: { meta: null, labels: null },
    };
    const { intermediates } = listIntermediates(two);
    expect(intermediates.map((i) => i.name)).toEqual([
      "int_channel_cac",
      "int_customer_firmographics",
      "v_partner_scorecard",
    ]);
  });
});

describe("non-allowlisted invisibility in listings", () => {
  it("list_metrics stays canon-only (v_metric__*)", () => {
    const names = listMetrics(fixture).map((m) => m.model);
    expect(names).toEqual(["v_metric__syncs", "v_metric__trials"]);
    expect(names).not.toContain("int_secret_scratch");
    expect(names).not.toContain("int_customer_firmographics");
  });
});

describe("resolveTiered", () => {
  it("resolves verified metrics with tier 'metric'", () => {
    const r = resolveTiered(fixture, "trials");
    expect(r.tier).toBe("metric");
    expect(r.node.name).toBe("v_metric__trials");
  });

  it("resolves an allowlisted intermediate by exact name", () => {
    const r = resolveTiered(fixture, "int_customer_firmographics");
    expect(r.tier).toBe("intermediate");
    expect(r.node.name).toBe("int_customer_firmographics");
    expect(r.id).toBe("model.method_metrics.int_customer_firmographics");
  });

  it("resolves an allowlisted intermediate fuzzily (unique substring)", () => {
    const r = resolveTiered(fixture, "firmographics");
    expect(r.tier).toBe("intermediate");
    expect(r.node.name).toBe("int_customer_firmographics");
  });

  it("prefers a metric over an intermediate on ambiguity", () => {
    const ambiguous: DbtManifest = JSON.parse(JSON.stringify(fixture));
    ambiguous.nodes["model.method_metrics.v_metric__firmographics"] = {
      name: "v_metric__firmographics",
      resource_type: "model",
      description: "Hypothetical metric that collides with the intermediate.",
      meta: {},
      config: { meta: null, labels: { metric_id: "999", status: "live" } },
    };
    const r = resolveTiered(ambiguous, "firmographics");
    expect(r.tier).toBe("metric");
    expect(r.node.name).toBe("v_metric__firmographics");
  });

  it("does not resolve non-allowlisted models", () => {
    expect(() => resolveTiered(fixture, "int_secret_scratch")).toThrow(MetricNotFoundError);
  });

  it("feeds get_lineage: an allowlisted intermediate walks to sources", () => {
    const { id } = resolveTiered(fixture, "firmographics");
    const tree = lineageTree(fixture, id);
    expect(tree).toBe(["int_customer_firmographics", "  sources.revenue.Account"].join("\n"));
  });

  it("throws MetricNotFoundError with metric suggestions when neither tier matches", () => {
    try {
      resolveTiered(fixture, "zzz_nothing");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MetricNotFoundError);
    }
  });
});

describe("intermediate definition payload pieces (get_metric contract)", () => {
  it("columnDocs returns name, description, meta for every column", () => {
    const node = fixture.nodes["model.method_metrics.int_customer_firmographics"];
    const cols = columnDocs(node);
    expect(cols).toHaveLength(3);
    const dep = cols.find((c) => c.name === "ever_had_dep")!;
    expect(dep.description).toBe(
      "TRUE if the customer ever purchased a Dedicated Engagement Package.",
    );
    expect(dep.meta).toEqual({ source: "TransLineFlattened" });
    const undoc = cols.find((c) => c.name === "undocumented_col")!;
    expect(undoc.description).toBe("");
  });

  it("the warning contract text is fixed", () => {
    expect(INTERMEDIATE_WARNING).toBe(
      "Not one of the 20 verified metrics — analysis-model grain and caveats apply; check column docs before quoting.",
    );
  });
});
