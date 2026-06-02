/**
 * Channel ARR — marketing "Revenue by Channel" replica.
 *
 * Backed by the registered Channel ARR metric family (#390-399) on the
 * real multi-touch attribution primitive (revenue.int_attribution_fractional).
 * DIRECTIONAL run-rate (Custdatlastsaasamount); penny-matched to the Looker
 * "Revenue by Channel" dashboard (May 2026). See docs/metric-definitions.md
 * "Channel ARR". Not accounting-grade; will not tie to RevCogs.
 *
 * Renders via the `channelTable` section: dimension rows × metric columns,
 * month + USD→CAD filters, grand total, sortable headers, and per-cell
 * drill-down to the MetricInspector (formula + dependency chain + SQL).
 */
export default {
  id: 'channel-arr',
  title: 'Channel ARR',
  status: 'pending',
  group: 'revenue',
  hideGrain: true,
  hideDateFilter: true,  // table has its own month picker — the range filter is redundant
  sections: [
    {
      type: 'channelTable',
      title: 'Revenue by Channel',
      dimension: 'channel',
      lastNMonths: 25,
      // base metrics fetched grouped by channel; derived columns computed in-table
      baseMetrics: [390, 391, 392, 393, 394, 395],
      columns: [
        { key: 'customers',       label: 'Unique Customers', metricId: 394, format: 'number'  },
        { key: 'attribution',     label: 'AttributionValue', metricId: 393, format: 'number2' },
        { key: 'avgFirstInvoice', label: 'Avg First Invoice', metricId: 396, format: 'currency' },
        { key: 'saas',            label: 'SaaS',             metricId: 390, format: 'currency' },
        { key: 'arpc',            label: 'ARPC',             metricId: 397, format: 'currency' },
        { key: 'arr',             label: 'ARR',              metricId: 398, format: 'currency' },
        { key: 'cadArr',          label: 'CAD ARR',          metricId: 399, format: 'currency' },
      ],
    },
  ],
};
