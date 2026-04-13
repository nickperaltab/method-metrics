/**
 * DEP Revenue Scorecard — New DEP + Total DEP
 * Duplicated from Sales Scorecard sections 3 & 6.
 */

const VIEWS = {
  v_new_dep_revenue: { dateCol: 'TxnDate' },
  v_total_dep_revenue: { dateCol: 'TxnDate' },
};

const WEEKLY_NEW_DEP_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(TxnDate, WEEK(MONDAY))) AS period,
  ROUND(SUM(SaaSAmount), 2) AS value
FROM \`project-for-method-dw.revenue.v_new_dep_revenue\`
WHERE is_new_dep = TRUE AND TxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY 1 ORDER BY 1
`;

const WEEKLY_TOTAL_DEP_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(TxnDate, WEEK(MONDAY))) AS period,
  ROUND(SUM(SaaSAmount), 2) AS value
FROM \`project-for-method-dw.revenue.v_total_dep_revenue\`
WHERE TxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY 1 ORDER BY 1
`;

const FORECAST_WEEKLY_CAST = (column) => `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(Date, WEEK(MONDAY))) AS period,
  ROUND(SUM(SAFE_CAST(${column} AS FLOAT64)), 2) AS value
FROM \`project-for-method-dw.revenue.method_forecast\`
WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE()
GROUP BY 1 ORDER BY 1
`;

const FORECAST_WEEKLY = (column) => `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(Date, WEEK(MONDAY))) AS period,
  ROUND(SUM(${column}), 2) AS value
FROM \`project-for-method-dw.revenue.method_forecast\`
WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE()
GROUP BY 1 ORDER BY 1
`;

export default {
  id: 'dep-revenue',
  title: 'DEP Revenue',
  group: 'revenue',
  status: 'pending',
  views: VIEWS,
  sections: [
    // ── 1. New DEP Revenue ──────────────────────────────────
    {
      title: 'New DEP Revenue',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 290, label: 'Forecasted New DEP Revenue', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 329, label: 'Total New DEP Net SaaS', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 330, label: 'New DEP Revenue Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 331, label: 'Forecast vs. Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 332, label: 'Forecasted Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'New DEP Revenue Week Over Week',
          chartType: 'bar', valueFormat: 'currency',
          metrics: [
            { id: '__wk_budget_dep', label: 'Budgeted New DEP Revenue', color: '#a3c771', chartType: 'line', customSql: FORECAST_WEEKLY_CAST('Budgeted_New_DEP_Revenue') },
            { id: '__wk_forecast_dep', label: 'Forecasted New DEP Revenue', color: '#e84393', chartType: 'line', customSql: FORECAST_WEEKLY_CAST('Forecasted_New_DEP_Revenue') },
            { id: '__weekly_new_dep', label: 'Total New DEP Net SaaS', color: '#2563eb', customSql: WEEKLY_NEW_DEP_SQL },
          ],
          lastNMonths: 2, showLabels: true,
        },
        {
          label: 'New DEP Revenue Month Over Month',
          chartType: 'bar', valueFormat: 'currency',
          metrics: [
            { id: 282, label: 'Budgeted New DEP Revenue', color: '#1e3a5f' },
            { id: 290, label: 'Forecasted New DEP Revenue', color: '#2563eb' },
            { id: 329, label: 'Total New DEP Net SaaS', color: '#9dc3e6' },
          ],
          lastNMonths: 4, showLabels: true,
        },
      ],
    },

    // ── 2. Total DEP Revenue ────────────────────────────────
    {
      title: 'Total DEP Revenue',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 292, label: 'Forecasted Total DEP Revenue', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 333, label: 'Total DEP Net SaaS', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 334, label: 'Total DEP Net SaaS Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 335, label: 'Forecast vs. Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 336, label: 'Forecasted Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Total DEP Revenue Week Over Week',
          chartType: 'bar', valueFormat: 'currency',
          metrics: [
            { id: '__wk_budget_tdep', label: 'Budgeted Total DEP Revenue', color: '#a3c771', chartType: 'line', customSql: FORECAST_WEEKLY('Budgeted_Total_DEP_Revenue') },
            { id: '__wk_forecast_tdep', label: 'Forecasted Total DEP Revenue', color: '#e84393', chartType: 'line', customSql: FORECAST_WEEKLY('Forecasted_Total_DEP_Revenue') },
            { id: '__weekly_total_dep', label: 'Total DEP Net SaaS', color: '#2563eb', customSql: WEEKLY_TOTAL_DEP_SQL },
          ],
          lastNMonths: 2, showLabels: true,
        },
        {
          label: 'Total DEP Revenue Month Over Month',
          chartType: 'bar', valueFormat: 'currency',
          metrics: [
            { id: 284, label: 'Budgeted Total DEP Revenue', color: '#1e3a5f' },
            { id: 292, label: 'Forecasted Total DEP Revenue', color: '#2563eb' },
            { id: 333, label: 'Total DEP Net SaaS', color: '#9dc3e6' },
          ],
          lastNMonths: 4, showLabels: true,
        },
      ],
    },
  ],
};
