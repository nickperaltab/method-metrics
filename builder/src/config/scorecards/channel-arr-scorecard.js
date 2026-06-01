/**
 * Channel ARR — marketing "Revenue by Channel" replica.
 *
 * DIRECTIONAL run-rate (Custdatlastsaasamount), backed by the fractional
 * multi-touch attribution primitive (revenue.int_attribution_fractional) via
 * revenue.v_channel_arr_display. CAD baked at 1.33. Penny-matched to the Looker
 * "Revenue by Channel" dashboard (May 2026). See docs/metric-definitions.md
 * "Channel ARR". Not accounting-grade; will not tie to RevCogs.
 *
 * Renders via the existing `rawTable` section (sortable / searchable / paged).
 */
export default {
  id: 'channel-arr',
  title: 'Channel ARR',
  status: 'pending',
  group: 'revenue',
  sections: [
    {
      type: 'rawTable',
      title: 'Revenue by Channel',
      description:
        'New-customer ARR by marketing channel, using real multi-touch attribution ' +
        '(each customer’s credit split across the channels that touched them). ' +
        'DIRECTIONAL run-rate (Custdatlastsaasamount); CAD at a fixed 1.33 — not ' +
        'accounting-grade, will not tie to RevCogs. Click a column header to sort; ' +
        'use search to filter by channel or month (e.g. “2026-05”).',
      label: 'Revenue by Channel',
      metricId: 'channel-arr',          // string id → skips the metric machinery
      viewName: 'v_channel_arr_display',
      dateCol: 'month',
      columns: [
        'month', 'channel', 'customers', 'attribution_value',
        'avg_first_invoice', 'saas', 'arpc', 'arr', 'cad_arr', 'cad_arr_3mo',
      ],
      limit: 500,
    },
  ],
};
