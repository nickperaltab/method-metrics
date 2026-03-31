# Efficiency Metrics

**Metric IDs:** #6-10, #71-75
**Status:** Not yet solved
**Data source:** Derived from other metrics + headcount data

## Metrics covered

- Revenue per employee
- S&M ratio (sales & marketing spend / revenue)
- G&A ratio
- R&D ratio
- LTV:CAC ratio
- Payback period
- Magic number
- Rule of 40

## Known blockers

- Most efficiency metrics are derived — they need the underlying metrics (revenue, headcount, spend) solved first
- Headcount data not yet in BigQuery
- Expense category data not yet in BigQuery

## Route

These are derived metrics. Once the P&L (financial.md) and marketing (marketing.md) metrics are live, efficiency metrics can be computed using the `formula` + `depends_on` pattern in the metric registry.
