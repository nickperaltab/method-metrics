# Marketing Metrics

**Metric IDs:** #133-150
**Status:** Partially solved (trials, syncs, conversions are live)
**Data source:** BigQuery (Account table), Google Analytics, ad platforms

## Metrics covered

- Trial signups (LIVE — metric #54)
- Syncs (LIVE — metric #55)
- Conversions (LIVE — metric #56)
- CAC (customer acquisition cost)
- Channel attribution breakdown
- Funnel conversion rates (trial → sync → conversion)
- Ad spend by channel
- Website traffic and conversion

## Known blockers

- CAC requires ad spend data not yet in BigQuery
- Google Analytics data not connected
- Attribution model needs validation against Nic's spreadsheets

## Route

Trials, syncs, and conversions follow the revenue-retention pattern (BQ views from Account table). CAC and ad spend metrics need external data sources ingested first.
