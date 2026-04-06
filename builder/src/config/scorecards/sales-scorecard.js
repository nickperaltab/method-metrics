/**
 * Sales Scorecard — Conversion Rate section
 * Replicates the Looker Sales Scorecard layout.
 */

const VIEWS = {
  v_conversions: { dateCol: 'FirstSaaSInvoiceTxnDate' },
};

// Weekly conversion rate: same formula as metric 357 but weekly bucketed
// Formula: conversions / ((last_month_trials + forecasted_trials) / 2)
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

export default {
  id: 'sales-scorecard',
  title: 'Sales Scorecard',
  views: VIEWS,
  sections: [
    {
      title: 'Conversion Rate',
      layout: 'scorecard-row',
      kpis: [
        { metricId: 56, label: 'Conversion', format: 'number',
          valueSelector: 'current_month', showDelta: true },
        { metricId: 296, label: 'Conversion Trajectory', format: 'number',
          valueSelector: 'current_month' },
        { metricId: 319, label: 'Forecasted Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_month' },
        { metricId: 357, label: 'Conversion Rate', format: 'decimal_rate',
          valueSelector: 'current_or_latest', showDelta: true },
        // 321 formula outputs percentage number (8.49), not decimal — use 'percent'
        { metricId: 321, label: 'Conversion Rate Trajectory', format: 'percent',
          valueSelector: 'current_month' },
        // 322/323: Supabase formulas mix scales (321 is %, 319 is decimal).
        // Override with corrected formulas that convert 319 to % first.
        { metricId: 322, label: 'Forecast vs. Trajectory', format: 'percent',
          valueSelector: 'current_month',
          formulaOverride: '{321} - ({319} * 100)', depsOverride: [321, 319] },
        { metricId: 323, label: 'Forecasted Attainment', format: 'percent',
          valueSelector: 'current_month',
          formulaOverride: 'SAFE_DIVIDE({321}, {319} * 100) * 100', depsOverride: [321, 319] },
      ],
      charts: [
        {
          label: 'Conversion Rate Week Over Week',
          chartType: 'line',
          metrics: [
            { id: 324, label: 'Budgeted Conversion Rate', color: '#a3c771', renderAs: 'referenceLine' },
            { id: 319, label: 'Forecasted Conversion Rate', color: '#e84393', renderAs: 'referenceLine' },
            { id: '__weekly_conv_rate', label: 'Conversion Rate', color: '#2563eb', customSql: WEEKLY_CONVERSION_RATE_SQL },
          ],
          lastNMonths: 2,
          showLabels: true,
        },
        {
          label: 'Conversion Rate Month Over Month',
          chartType: 'bar',
          metrics: [
            { id: 324, label: 'Budgeted Conversion Rate', color: '#1e3a5f' },
            { id: 319, label: 'Forecasted Conversion Rate', color: '#2563eb' },
            { id: 357, label: 'Conversion Rate', color: '#9dc3e6' },
          ],
          lastNMonths: 4,
          showLabels: true,
        },
      ],
    },
  ],
};
