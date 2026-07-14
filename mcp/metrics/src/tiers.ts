/**
 * Intermediates tier — approved exposure allowlist.
 *
 * These are customer-attribute / analysis models exposed by the MCP server as a
 * SECOND tier, cleanly separated from the 20 verified metrics (v_metric__*).
 * They are NOT verified metrics: analysis-model grain and caveats apply, and
 * their column docs carry the definitions (e.g. ever_had_dep).
 *
 * Audit/approval: 2026-07-10, approved by Nic — 12 models from the audit, plus
 * v_channel_arr (approved same day; directional run-rate ARR by channel; its
 * plumbing — int_channel_funnel_daily, int_attribution_fractional,
 * v_channel_arr_display — stays internal, reachable via get_lineage/get_sql).
 * Models not on this list and not v_metric__* must not appear in listings
 * (get_sql may still serve any model — unchanged).
 *
 * Note: int_motion_funnel is intentionally absent (pending a rename in flight).
 */
export const APPROVED_INTERMEDIATES: readonly string[] = [
  "int_annual_mrr_movement_decomposed",
  "int_channel_cac",
  "int_customer_firmographics",
  "int_customer_mrr_lines",
  "int_customer_proserv",
  "int_customer_retention_triangle",
  "int_customer_survival",
  "int_marketing_spend",
  "int_mrr_movement_decomposed",
  "int_partner_accounts",
  "int_presale_touches",
  "v_channel_arr",
  "v_partner_scorecard",
];

/** Tier label carried by every intermediate listing entry. */
export const INTERMEDIATE_TIER_LABEL = "intermediate — not a verified metric";

/** Warning carried by every get_metric response that resolves to an intermediate. */
export const INTERMEDIATE_WARNING =
  "Not one of the 20 verified metrics — analysis-model grain and caveats apply; check column docs before quoting.";
