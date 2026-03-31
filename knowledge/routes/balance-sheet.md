# Balance Sheet Metrics

**Metric IDs:** #151-155
**Status:** Not yet solved
**Data source:** QuickBooks or Google Sheets export

## Metrics covered

- Cash and cash equivalents
- Accounts receivable
- Total assets
- Total liabilities
- Equity / book value

## Known blockers

- Balance sheet data not yet in BigQuery
- Need to determine source: QuickBooks API vs manual export
- Point-in-time snapshots vs period-end values

## Route

Not yet established. Balance sheet metrics are point-in-time snapshots, so the BQ view pattern will differ from flow metrics (monthly aggregations). Likely need a snapshot table with monthly closing balances.
