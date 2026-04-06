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

const WEEKLY_CONVERSION_RATE_SQL = `
WITH weekly_conversions AS (
  SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate, WEEK(MONDAY)) AS week,
    COUNT(*) AS conversions
  FROM \`project-for-method-dw.revenue.v_conversions\`
  WHERE FirstSaaSInvoiceTxnDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
  GROUP BY 1
),
monthly_trials AS (
  SELECT DATE_TRUNC(SignupDate, MONTH) AS month, COUNT(*) AS trials
  FROM \`project-for-method-dw.revenue.v_trials\` GROUP BY 1
),
trials_with_lag AS (
  SELECT month, LAG(trials) OVER (ORDER BY month) AS last_month_trials FROM monthly_trials
),
forecasted AS (
  SELECT DATE_TRUNC(forecast_date, MONTH) AS month,
    ROUND(SUM(forecast_value), 0) AS forecasted_trials
  FROM \`project-for-method-dw.revenue.v_trials_forecast_channel\`
  WHERE forecast_date IS NOT NULL GROUP BY 1
)
SELECT FORMAT_DATE('%Y-%m-%d', w.week) AS period,
  ROUND(SAFE_DIVIDE(w.conversions,
    (t.last_month_trials + f.forecasted_trials) / 2), 4) AS value
FROM weekly_conversions w
JOIN trials_with_lag t ON DATE_TRUNC(w.week, MONTH) = t.month
JOIN forecasted f ON DATE_TRUNC(w.week, MONTH) = f.month
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

const WEEKLY_CHURN_RATE_SQL = `
WITH weekly_churns AS (
  SELECT DATE_TRUNC(CancellationDate, WEEK(MONDAY)) AS week,
    COUNT(DISTINCT CompanyAccount) AS churn_count
  FROM \`project-for-method-dw.revenue.v_cancellations\`
  WHERE CancellationDate >= DATE_SUB(CURRENT_DATE(), INTERVAL 3 MONTH)
    AND CancellationDate <= CURRENT_DATE()
  GROUP BY 1
),
bom AS (
  SELECT DATE_TRUNC(TxnDate, MONTH) AS m,
    COUNT(DISTINCT CompanyAccount) AS bom_count
  FROM \`project-for-method-dw.revenue.v_bom_customers\`
  GROUP BY 1
),
convs AS (
  SELECT DATE_TRUNC(FirstSaaSInvoiceTxnDate, MONTH) AS m,
    COUNT(*) AS conv_count
  FROM \`project-for-method-dw.revenue.v_conversions\`
  GROUP BY 1
)
SELECT FORMAT_DATE('%Y-%m-%d', w.week) AS period,
  ROUND(w.churn_count * 100.0 / NULLIF(b.bom_count + COALESCE(v.conv_count, 0), 0), 2) AS value
FROM weekly_churns w
JOIN bom b ON DATE_TRUNC(w.week, MONTH) = b.m
LEFT JOIN convs v ON DATE_TRUNC(w.week, MONTH) = v.m
ORDER BY 1
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

// ── Dashboard Config ─────────────────────────────────────────

export default {
  id: 'sales-scorecard',
  title: 'Sales Scorecard',
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
        { metricId: 321, label: 'Conversion Rate Trajectory', format: 'percent',
          valueSelector: 'current_or_latest' },
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
          chartType: 'line', valueFormat: 'decimal_rate',
          metrics: [
            { id: 324, label: 'Budgeted Conversion Rate', color: '#a3c771', renderAs: 'referenceLine' },
            { id: 319, label: 'Forecasted Conversion Rate', color: '#e84393', renderAs: 'referenceLine' },
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
        { metricId: 338, label: 'Net SaaS Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 339, label: 'Forecast vs. Trajectory', format: 'currency',
          valueSelector: 'current_or_latest' },
        { metricId: 340, label: 'Forecasted Attainment', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'New Net SaaS Week Over Week',
          chartType: 'line', valueFormat: 'currency',
          metrics: [
            { id: 325, label: 'Budgeted New Net SaaS', color: '#a3c771', renderAs: 'referenceLine' },
            { id: 289, label: 'Forecasted New Net SaaS', color: '#e84393', renderAs: 'referenceLine' },
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
          chartType: 'line', valueFormat: 'currency',
          metrics: [
            { id: 282, label: 'Budgeted New DEP Revenue', color: '#a3c771', renderAs: 'referenceLine' },
            { id: 290, label: 'Forecasted New DEP Revenue', color: '#e84393', renderAs: 'referenceLine' },
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
        { metricId: 59, label: 'Churn', format: 'number',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 341, label: 'Churn Trajectory', format: 'number',
          valueSelector: 'current_or_latest' },
        { metricId: 342, label: 'Forecasted Churn Rate %', format: 'percent',
          valueSelector: 'current_or_latest' },
        { metricId: 344, label: 'Churn Rate', format: 'percent',
          valueSelector: 'current_or_latest', showDelta: true },
        { metricId: 345, label: 'Churn Rate % Trajectory', format: 'percent',
          valueSelector: 'current_or_latest' },
      ],
      charts: [
        {
          label: 'Churn Rate Week Over Week',
          chartType: 'line', valueFormat: 'percent',
          metrics: [
            { id: 343, label: 'Budgeted Churn Rate', color: '#a3c771', renderAs: 'referenceLine' },
            { id: 342, label: 'Forecasted Churn Rate', color: '#e84393', renderAs: 'referenceLine' },
            { id: '__weekly_churn_rate', label: 'Churn Rate', color: '#2563eb', customSql: WEEKLY_CHURN_RATE_SQL },
          ],
          lastNMonths: 2, showLabels: true,
        },
        {
          label: 'Churn Rate Month Over Month',
          chartType: 'bar', valueFormat: 'percent',
          metrics: [
            { id: 343, label: 'Budgeted Churn Rate', color: '#1e3a5f' },
            { id: 342, label: 'Forecasted Churn Rate', color: '#2563eb' },
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
          chartType: 'line', valueFormat: 'currency',
          metrics: [
            { id: 283, label: 'Budgeted Total Net SaaS', color: '#a3c771', renderAs: 'referenceLine' },
            { id: 291, label: 'Forecasted Total Net SaaS', color: '#e84393', renderAs: 'referenceLine' },
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
          chartType: 'line', valueFormat: 'currency',
          metrics: [
            { id: 284, label: 'Budgeted Total DEP Revenue', color: '#a3c771', renderAs: 'referenceLine' },
            { id: 292, label: 'Forecasted Total DEP Revenue', color: '#e84393', renderAs: 'referenceLine' },
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
