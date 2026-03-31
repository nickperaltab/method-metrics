# Forecast Metrics (RevCogs Model)

**Metric IDs:** #36-47, #113-132
**Status:** Not yet solved
**Data source:** Google Sheets (RevCogs model)

## Metrics covered

- Revenue forecast by month
- COGS forecast
- Headcount forecast
- Projected MRR growth
- Cohort-based revenue projections
- Budget vs actual comparisons

## Known blockers

- RevCogs model lives in Google Sheets — not yet connected to BigQuery
- Model structure changes periodically — need stable schema mapping
- Forecast vs actual comparison requires both forecast data and actuals in BQ

## Route

Not yet established. Will need a Sheets-to-BQ pipeline or manual export process.
