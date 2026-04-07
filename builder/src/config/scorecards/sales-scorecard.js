/**
 * Sales Scorecard — all 7 sections
 * Replicates the Looker Sales Scorecard layout.
 */

const VIEWS = {
  v_conversions: { dateCol: 'FirstSaaSInvoiceTxnDate' },
  v_new_net_saas: { dateCol: 'TxnDate' },
  v_new_dep_revenue: { dateCol: 'TxnDate' },
  v_cancellations: { dateCol: 'CancellationDate' },
  v_total_net_saas: { dateCol: 'TxnDate' },
  v_total_dep_revenue: { dateCol: 'TxnDate' },
};

// ── Custom Weekly SQL Queries ────────────────────────────────

// Weekly conversion rate matching Looker: SUM(Conversion) / ((SUM(Last Month Trials) + SUM(Forecasted Trials)) / 2)
// "Last Month Trials" = each trial's SignupDate shifted +1 month, then grouped by ISOWEEK
const WEEKLY_CONVERSION_RATE_SQL = `
WITH lagged_trials AS (
  SELECT DATE_ADD(SignupDate, INTERVAL 1 MONTH) AS shifted_date
  FROM \`project-for-method-dw.revenue.Account\`
  WHERE IsConversionException = FALSE AND Partner != 'Method Integration'
    AND SignupDate != DATE('0001-01-01')
),
weekly_lagged AS (
  SELECT DATE_TRUNC(shifted_date, WEEK(MONDAY)) AS week, COUNT(*) AS last_month_trials
  FROM lagged_trials WHERE shifted_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
  GROUP BY 1
),
conversions AS (
  SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate, WEEK(MONDAY)) AS week, COUNT(*) AS conversions
  FROM \`project-for-method-dw.revenue.Account\`
  WHERE IsConversionException = FALSE AND Partner != 'Method Integration'
    AND FirstSaaSInvoiceTxnDate != DATE('0001-01-01')
    AND FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
  GROUP BY 1
),
forecast AS (
  SELECT DATE_TRUNC(Date, WEEK(MONDAY)) AS week, SUM(Forecasted_Trials) AS forecasted_trials
  FROM \`project-for-method-dw.revenue.method_forecast\`
  WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE()
  GROUP BY 1
)
SELECT FORMAT_DATE('%Y-%m-%d', c.week) AS period,
  ROUND(SAFE_DIVIDE(c.conversions, (t.last_month_trials + f.forecasted_trials) / 2.0) * 100, 2) AS value
FROM conversions c
LEFT JOIN weekly_lagged t ON c.week = t.week
LEFT JOIN forecast f ON c.week = f.week
ORDER BY 1
`;

const WEEKLY_NEW_NET_SAAS_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(TxnDate, WEEK(MONDAY))) AS period,
  ROUND(SUM(SaaSAmount), 2) AS value
FROM \`project-for-method-dw.revenue.v_new_net_saas\`
WHERE TxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY 1 ORDER BY 1
`;

const WEEKLY_NEW_DEP_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(TxnDate, WEEK(MONDAY))) AS period,
  ROUND(SUM(SaaSAmount), 2) AS value
FROM \`project-for-method-dw.revenue.v_new_dep_revenue\`
WHERE is_new_dep = TRUE AND TxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY 1 ORDER BY 1
`;

// Weekly churn count (not rate) — matches Looker "Churn Count Week Over Week"
const WEEKLY_CHURN_COUNT_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(CancellationDate, WEEK(MONDAY))) AS period,
  COUNT(DISTINCT CompanyAccount) AS value
FROM \`project-for-method-dw.revenue.v_cancellations\`
WHERE CancellationDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
  AND CancellationDate <= CURRENT_DATE()
GROUP BY 1 ORDER BY 1
`;

const WEEKLY_TOTAL_NET_SAAS_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(TxnDate, WEEK(MONDAY))) AS period,
  ROUND(SUM(SaaSAmount + SaaSExpense), 2) AS value
FROM \`project-for-method-dw.revenue.v_total_net_saas\`
WHERE TxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY 1 ORDER BY 1
`;

const WEEKLY_TOTAL_DEP_SQL = `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(TxnDate, WEEK(MONDAY))) AS period,
  ROUND(SUM(SaaSAmount), 2) AS value
FROM \`project-for-method-dw.revenue.v_total_dep_revenue\`
WHERE TxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
GROUP BY 1 ORDER BY 1
`;

// ── Weekly Budget/Forecast from method_forecast daily table ──

const FORECAST_WEEKLY = (column) => `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(Date, WEEK(MONDAY))) AS period,
  ROUND(SUM(${column}), 2) AS value
FROM \`project-for-method-dw.revenue.method_forecast\`
WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE()
GROUP BY 1 ORDER BY 1
`;

const FORECAST_WEEKLY_CAST = (column) => `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(Date, WEEK(MONDAY))) AS period,
  ROUND(SUM(SAFE_CAST(${column} AS FLOAT64)), 2) AS value
FROM \`project-for-method-dw.revenue.method_forecast\`
WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE()
GROUP BY 1 ORDER BY 1
`;

const FORECAST_WEEKLY_MAX = (column) => `
SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(Date, WEEK(MONDAY))) AS period,
  ROUND(MAX(${column}), 4) AS value
FROM \`project-for-method-dw.revenue.method_forecast\`
WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE()
GROUP BY 1 ORDER BY 1
`;

// ── Dashboard Config ─────────────────────────────────────────

export default {
  id: 'sales-scorecard',
  title: 'Sales Scorecard',
  status: 'pending',
  views: VIEWS,
  sections: [
    // ── 1. Conversion Rate ───────────────────────────────────
    {
      title: 'Conversion Rate',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 56, label: 'Conversion', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 296, label: 'Conversion Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 319, label: 'Forecasted Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_or_latest' },
        { metricId: 357, label: 'Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_or_latest', showDelta: true },
        // 321 formula outputs percentage number (8.49), not decimal — use 'percent'
        { metricId: 321, label: 'Conversion Rate Trajectory', format: 'percent',
          valueSelector: 'current_or_latest' },
        // 322/323: Supabase formulas mix scales (321 is %, 319 is decimal).
        // Override with corrected formulas that convert 319 to % first.
        { metricId: 322, label: 'Forecast vs. Trajectory', format: 'percent',
          valueSelector: 'current_or_latest',
          formulaOverride: '{321} - ({319} * 100)', depsOverride: [321, 319] },
        { metricId: 323, label: 'Forecasted Attainment', format: 'percent',
          valueSelector: 'current_or_latest',
          formulaOverride: 'SAFE_DIVIDE({321}, {319} * 100) * 100', depsOverride: [321, 319] },
      ],
      charts: [
        {
          label: 'Conversion Rate Week Over Week',
          chartType: 'line', valueFormat: 'percent',
          metrics: [
            { id: '__wk_budget_convrate', label: 'Budgeted Conversion Rate', color: '#a3c771', customSql: `SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(Date, WEEK(MONDAY))) AS period, ROUND(MAX(Budgeted_Conversion_Rate) * 100, 2) AS value FROM \`project-for-method-dw.revenue.method_forecast\` WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE() GROUP BY 1 ORDER BY 1` },
            { id: '__wk_forecast_convrate', label: 'Forecasted Conversion Rate', color: '#e84393', customSql: `SELECT FORMAT_DATE('%Y-%m-%d', DATE_TRUNC(Date, WEEK(MONDAY))) AS period, ROUND(MAX(Forecasted_Conversion_Rate) * 100, 2) AS value FROM \`project-for-method-dw.revenue.method_forecast\` WHERE Date >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH) AND Date <= CURRENT_DATE() GROUP BY 1 ORDER BY 1` },
            { id: '__weekly_conv_rate', label: 'Conversion Rate', color: '#2563eb', customSql: WEEKLY_CONVERSION_RATE_SQL },
          ],
          lastNMonths: 2, showLabels: true,
        },
        {
          label: 'Conversion Rate Month Over Month',
          chartType: 'bar', valueFormat: 'decimal_rate',
          metrics: [
            { id: 324, label: 'Budgeted Conversion Rate', color: '#1e3a5f' },
            { id: 319, label: 'Forecasted Conversion Rate', color: '#2563eb' },
            { id: 357, label: 'Conversion Rate', color: '#9dc3e6' },
          ],
          lastNMonths: 4, showLabels: true,
        },
      ],
    },

    // ── 2. New Net SaaS ──────────────────────────────────────
    {
      title: 'New Net SaaS',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 289, label: 'Forecasted New Net SaaS', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 365, label: 'Total New Net SaaS Revenue', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 326, label: 'New Net SaaS Revenue Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        // 327/328 are New Net SaaS level (326 vs 289), not total Net SaaS (338/339/340)
        { metricId: 327, label: 'Forecast vs. Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 328, label: 'Forecasted Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'New Net SaaS Week Over Week',
          chartType: 'bar', valueFormat: 'currency',
          metrics: [
            { id: '__wk_budget_nns', label: 'Budgeted New Net SaaS', color: '#a3c771', chartType: 'line', customSql: FORECAST_WEEKLY('Budgeted_New_Net_SaaS') },
            { id: '__wk_forecast_nns', label: 'Forecasted New Net SaaS', color: '#e84393', chartType: 'line', customSql: FORECAST_WEEKLY('Forecasted_New_Net_SaaS') },
            { id: '__weekly_new_net_saas', label: 'Total New Net SaaS', color: '#2563eb', customSql: WEEKLY_NEW_NET_SAAS_SQL },
          ],
          lastNMonths: 2, showLabels: true,
        },
        {
          label: 'New Net SaaS Month Over Month',
          chartType: 'bar', valueFormat: 'currency',
          metrics: [
            { id: 325, label: 'Budgeted New Net SaaS', color: '#1e3a5f' },
            { id: 289, label: 'Forecasted New Net SaaS', color: '#2563eb' },
            { id: 365, label: 'Total New Net SaaS', color: '#9dc3e6' },
          ],
          lastNMonths: 4, showLabels: true,
        },
      ],
    },

    // ── 3. New DEP Revenue ───────────────────────────────────
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

    // ── 4. Churn Rate ────────────────────────────────────────
    {
      title: 'Churn Rate',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 274, label: 'Forecasted Churn', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 59, label: 'Churn', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 297, label: 'Churn Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 342, label: 'Forecasted Churn Rate %', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 345, label: 'Churn Rate % Trajectory', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Churn Count Week Over Week',
          chartType: 'bar', valueFormat: 'number',
          metrics: [
            { id: '__wk_budget_churn', label: 'Budgeted Churn', color: '#a3c771', chartType: 'line', customSql: FORECAST_WEEKLY('Budgeted_Churn') },
            { id: '__wk_forecast_churn', label: 'Forecasted Churn', color: '#e84393', chartType: 'line', customSql: FORECAST_WEEKLY('Forecasted_Churn') },
            { id: '__weekly_churn_count', label: 'Churned Accounts', color: '#2563eb', customSql: WEEKLY_CHURN_COUNT_SQL },
          ],
          lastNMonths: 2, showLabels: true,
        },
        {
          label: 'Churn Rate Month Over Month',
          chartType: 'bar', valueFormat: 'percent',
          metrics: [
            { id: 343, label: 'Budgeted Churn Rate %', color: '#1e3a5f' },
            { id: 342, label: 'Forecasted Churn Rate %', color: '#2563eb' },
            { id: 344, label: 'Churn Rate', color: '#9dc3e6' },
          ],
          lastNMonths: 4, showLabels: true,
        },
      ],
    },

    // ── 5. Total Net SaaS ────────────────────────────────────
    {
      title: 'Total Net SaaS',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 291, label: 'Forecasted Total Net SaaS', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 337, label: 'Total Net SaaS', format: 'currency',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 338, label: 'Net SaaS Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 339, label: 'Forecast vs. Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 340, label: 'Forecasted Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Total Net SaaS Week Over Week',
          chartType: 'bar', valueFormat: 'currency',
          metrics: [
            { id: '__wk_budget_tns', label: 'Budgeted Total Net SaaS', color: '#a3c771', chartType: 'line', customSql: FORECAST_WEEKLY('Budgeted_Total_Net_SaaS') },
            { id: '__wk_forecast_tns', label: 'Forecasted Total Net SaaS', color: '#e84393', chartType: 'line', customSql: FORECAST_WEEKLY('Forecasted_Total_Net_SaaS') },
            { id: '__weekly_total_net_saas', label: 'Total Net SaaS', color: '#2563eb', customSql: WEEKLY_TOTAL_NET_SAAS_SQL },
          ],
          lastNMonths: 2, showLabels: true,
        },
        {
          label: 'Total Net SaaS Month Over Month',
          chartType: 'bar', valueFormat: 'currency',
          metrics: [
            { id: 283, label: 'Budgeted Total Net SaaS', color: '#1e3a5f' },
            { id: 291, label: 'Forecasted Total Net SaaS', color: '#2563eb' },
            { id: 337, label: 'Total Net SaaS', color: '#9dc3e6' },
          ],
          lastNMonths: 4, showLabels: true,
        },
      ],
    },

    // ── 6. Total DEP Revenue ─────────────────────────────────
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

    // ── 7. NRR ───────────────────────────────────────────────
    {
      title: 'NRR',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 346, label: 'NRR', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 347, label: 'Forecasted NRR', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 348, label: 'Budgeted NRR', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: "Current Month's Average 1 Year NRR by Week",
          chartType: 'line', valueFormat: 'percent',
          metrics: [
            { id: 348, label: 'Budgeted NRR', color: '#a3c771', renderAs: 'referenceLine' },
            { id: 347, label: 'Forecasted NRR', color: '#e84393', renderAs: 'referenceLine' },
            { id: 346, label: 'NRR', color: '#2563eb' },
          ],
          lastNMonths: 2, showLabels: true,
        },
        {
          label: '1 Year NRR by Month',
          chartType: 'bar', valueFormat: 'percent',
          metrics: [
            { id: 348, label: 'Budgeted NRR', color: '#1e3a5f' },
            { id: 347, label: 'Forecasted NRR', color: '#2563eb' },
            { id: 346, label: 'NRR', color: '#9dc3e6' },
          ],
          lastNMonths: 4, showLabels: true,
        },
      ],
    },
  ],
};
