# Financial Metrics (P&L)

**Metric IDs:** #11-35
**Status:** Not yet solved
**Data source:** Google Sheets (P&L export), possibly QuickBooks API

## Metrics covered

- Revenue line items (SaaS revenue, services, other)
- COGS breakdown
- Gross margin
- Operating expenses by category
- EBITDA
- Net income

## Known blockers

- P&L data not yet ingested into BigQuery
- Need to determine whether to pull from Google Sheets or accounting system directly
- Monthly close timing — data may lag by 2-3 weeks

## Route

Not yet established. Once data is ingested, the pattern will likely follow the revenue-retention model: create BQ views, verify against Excel, graduate.
