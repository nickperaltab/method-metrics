{{ config(materialized='view') }}

-- Passthrough to the existing BQ-side `revenue.v_syncs` view.
-- The canonical filter (EventType = 'Sync') and the SELECT projection
-- (SyncDate, SignupDate, CompanyAccount, EventType, attribution columns,
-- AttributionChannel) live in the BQ DDL, not here. This file exists so
-- dbt parse can attach the semantic_model defined in v_syncs.yml to a
-- real model.
--
-- Source-of-truth for v_syncs: revenue.Funnel WHERE EventType = 'Sync'.
-- One row per sync event (NOT one per account). SyncDate is the event-time.

select * from `project-for-method-dw.revenue.v_syncs`
