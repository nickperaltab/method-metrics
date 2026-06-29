# BigQuery Map

**What's in `project-for-method-dw`, where to look, and what to tell Claude to query.**

This is the warehouse's table of contents. The point: when you (or Claude) need data, you should know which dataset holds it, whether it's trustworthy, and what doesn't exist yet — without guessing.

The inventory at the bottom is **auto-generated** from BigQuery itself, so it can't drift. Re-run it any time:

```
python3 scripts/build_bigquery_map.py
```

The guidance up top is hand-written. Keep it current as you learn things.

---

## Where do I look? (the decision table)

| I want… | Go to | Notes |
|---|---|---|
| A canonical metric value ("what was MRR in May?") | `revenue_metrics.v_metric__*` | The 20 verified, dbt-managed views. Quote freely. |
| To slice a metric by channel / segment / vertical | `revenue.int_*` intermediates | Row-level grain. Have descriptions. |
| Raw revenue source data | `revenue.Account`, `revenue.TransLineFlattened`, `revenue.Funnel` | Verify before quoting. |
| Product / usage events ("how many first syncs?") | `net.*` | Segment event firehose. One table per event. Undocumented — see gotchas. |
| Onboarding / NPS / guide events | `javascript.*` | Appcues stream. One table per event. |
| Account industry / vertical / operating model | `v7_classification.v_classified_accounts_full` | L1/L2/L3 industry + business description, joined to `revenue.Account`. |
| Call transcripts | `customer_signals.conversations` / `call_summaries` | Zoom calls only (no email yet). ⚠️ Currently **100% unmatched** to accounts. New & small. |
| AI-feature usage or cost | `ai.assistant_execution`, `ai.spend_daily`, … | Fully documented. **Partition filter required** (see gotchas). |
| Company + account profiles (health, rep, flags) | `net.users` | ~12.9K accounts in daily snapshots (708K rows ≠ distinct profiles). Grain not yet pinned down. |
| Email-marketing contacts | `active_campaign.users` | ActiveCampaign export. |

---

## The trust rule

**A view or table you can trust has a `description`.** That's the signal.

- Has a description → documented on purpose, reviewed. Safe to quote.
- No description → ad-hoc, historical, or a work-in-progress. Verify before quoting externally.

The inventory below shows a "Documented" count per dataset. Low coverage means tread carefully.

`revenue_metrics` and `ai` are the gold standard (table- and column-level docs). `customer_signals`, `net`, `javascript`, and `active_campaign` currently have **zero** descriptions — usable, but unverified.

**What's verified vs. inferred in this doc:** dataset names, table counts, doc coverage, and freshness are pulled straight from BigQuery — trust them. The *purpose* of each undocumented dataset (`net`, `javascript`, `customer_signals`, `active_campaign`) is **inferred from table shape, not confirmed by an owner** — treat those one-liners as a starting hypothesis until the pipeline owner confirms or a BQ `description` gets added.

---

## What to tell Claude

Phrase requests by pointing at the right dataset:

- *"Query `revenue_metrics` for the canonical value of …"* — for any official metric number.
- *"Slice using the `revenue.int_*` intermediates …"* — for breakdowns by dimension.
- *"Pull product events from the `net` dataset — ignore any table name with `sleep`/`waitfor`/`select_` in it."*
- *"Get the account's industry from `v7_classification.v_classified_accounts_full`."*
- *"For AI usage, query `ai.assistant_execution` and remember it needs a `WHERE EventTimestamp` partition filter."*

---

## Gotchas

- **`net` has polluted event names.** Dozens of tables like `sso_button_clicked..._pg_sleep_15` and `..._waitfor_delay_0_0_15` are SQL-injection probe payloads that got captured as Segment event names. Ignore them. (Worth telling someone they exist.)
- **`ai.*` tables require a partition filter.** Queries against `ai.assistant_execution` (and siblings) must include a `WHERE EventTimestamp >= …` clause or they error. Join key: `AccountRecordID` → `revenue.Account.RecordID`.
- **`test_import` is scratch.** Ignore it.
- **`net.users` grain is not 1-row-per-profile.** 708K rows but only ~12.9K distinct `group_id` (accounts) — it's daily snapshots, Sept 2025→now. Dedup to the latest snapshot per account before counting. Grain not yet confirmed with an owner.
- **Every `net` / `javascript` event table has a `_view` twin.** The `_view` is the deduped/typed read layer; prefer it.

---

## Data that lives OUTSIDE BigQuery

So nobody hunts in BQ for data that isn't there:

| Data | Lives in | Reach it via |
|---|---|---|
| Customer health scores (7-yr history) | MSSQL `CustomerMethodAccountHealthScore` | `mssql-prod-*` MCP. Join `CompanyAccountRef` = BQ `Account.RecordID`. |
| Product analytics dashboards | Amplitude | Amplitude MCP. (Raw events also land in BQ `net`.) |
| Metric registry / catalog (the app's "menu") | Supabase `metrics` table | Supabase REST API. |
| Methodology & verified-query notes | This repo (`knowledge/`, `docs/`) | Read the files. |

---

<!-- AUTOGEN:START -->

## Dataset inventory

*Auto-generated by `scripts/build_bigquery_map.py` on 2026-06-29. Do not edit below this line by hand — re-run the script.*

| Dataset | What it is | Tables | Documented | Last change |
|---|---|---|---|---|
| **`active_campaign`** | *(inferred)* ActiveCampaign (email-marketing) contact/user export. | 2 | 0/2 | 2026-06-10 |
| **`ai`** | Method's AI-feature usage & cost telemetry (assistant executions, LLM iterations, daily spend). | 9 | 7/9 | 2026-06-08 |
| **`customer_signals`** | *(inferred)* Zoom **call transcripts** + summaries (no email yet). As of last check, 100% `link_status = unmatched` — not yet joined to accounts. | 4 | 1/4 | 2026-06-26 |
| **`javascript`** | *(inferred)* Segment **Appcues** stream — onboarding flows, NPS, checklist/guide events (one table per event, plus a `_view`). | 60 | 0/60 | 2026-06-29 |
| **`net`** | *(inferred)* Segment **product event firehose** — one table per in-app event (`account_created`, `first_sync_completed`, `invoice_created`, …) plus a `_view`. `net.users` holds ~12.9K accounts in daily snapshots (708K rows ≠ distinct profiles; grain not yet pinned down). | 644 | 0/644 | 2026-06-29 |
| **`revenue`** | Raw sources, intermediates, deprecated aliases, and Justin's hand-written revenue/MRR views. Mixed trust — verify before quoting. | 87 | 48/87 | 2026-06-29 |
| **`revenue_dbt_test__audit`** | *(undocumented — purpose unverified)* | 8 | 0/8 | 2026-06-24 |
| **`revenue_metrics`** | Method's verified, dbt-managed metric catalog (v_metric__*). Materialized from the dbt project at github.com/nickperaltab/method-metrics. Every view here has a consumer-facing description and labels (status, metric_id, type). Sister to the 'revenue' dataset which holds raw sources, intermediates, and unverified analytical views. | 20 | 20/20 | 2026-06-04 |
| **`revenue_validation`** | Phase-1 Net SaaS validation staging dataset (dbt staging target) | 6 | 3/6 | 2026-06-04 |
| **`test_import`** | Scratch / test tables. Ignore. | 4 | 0/4 | 2026-04-21 |
| **`v7_classification`** | V7 industry classification — current state + audit history. Source of truth is Method's CustomerIndustryClassification table; this is the analytics-side mirror, synced nightly via sync_method_to_bq.py. | 12 | 3/12 | 2026-06-28 |

"Documented" = how many tables carry a BigQuery `description` (the trust signal). Low coverage = verify before quoting.

### `active_campaign`

*(inferred)* ActiveCampaign (email-marketing) contact/user export.

| Table | Type | Rows | Documented? | Description |
|---|---|---|---|---|
| `users` | table | 4 | — |  |
| `users_view` | view | 0 | — |  |

### `ai`

Method's AI-feature usage & cost telemetry (assistant executions, LLM iterations, daily spend).

| Table | Type | Rows | Documented? | Description |
|---|---|---|---|---|
| `account_usage_daily` | view | 0 | ✅ | Daily AI usage per account, with action-type counters and current-state account enrichment. Filter on Day. Re-aggregate to monthly by DATE_TRUNC(Day, MONTH). Source: ai.assistant_execution_costs. |
| `app_costs_daily` | view | 0 | ✅ | Daily AI spend per app. Aggregates all action types that target the app (build, screen, action-set, tables/fields). Filter on Day. AppGUID is never NULL in this view. Source: ai.assistant_execution_costs. |
| `assistant_execution` | table | 408 | ✅ | One row per assistant execution (one HTTP request to a public AI endpoint). |
| `assistant_execution_costs` | view | 0 | — |  |
| `llm_iteration` | table | 7K | ✅ | One row per LLM iteration. Joined to assistant_execution via RunID. |
| `llm_iteration_costs` | view | 0 | — |  |
| `model_pricing` | table | 5 | ✅ | SCD2 pricing dim — historically-correct cost math via time-range JOIN. |
| `screen_costs_daily` | view | 0 | ✅ | Daily AI spend per screen, restricted to create_screen / iterate_screen actions. Use AppGUID as a secondary key when a screen name appears in multiple apps. Filter on Day. Source: ai.assistant_execution_costs. |
| `spend_daily` | view | 0 | ✅ | Daily AI spend rolled up by action / actor / account-status / entry-point. Filter on Day for partition pushdown. Re-aggregate by DATE_TRUNC(Day, WEEK | MONTH) for weekly/monthly cuts. Source: ai.assistant_execution_costs. |

### `customer_signals`

*(inferred)* Zoom **call transcripts** + summaries (no email yet). As of last check, 100% `link_status = unmatched` — not yet joined to accounts.

| Table | Type | Rows | Documented? | Description |
|---|---|---|---|---|
| `call_summaries` | table | 25 | — |  |
| `conversations` | table | 8K | — |  |
| `conversations_staging` | table | 83 | — |  |
| `v_conversations` | view | 0 | ✅ | Customer call transcripts (Zoom, via Alocet) joined to revenue.Account, one row per call. link_status: matched=billable account, matched_lead=lead/contact entity (account_* null), unmatched=no CRM record. account_is_active is the churn flag (FALSE=churned); account_cancellation_date sentinel 0001-01-01 nulled out. Raw source: customer_signals.conversations. |

### `javascript`

*(inferred)* Segment **Appcues** stream — onboarding flows, NPS, checklist/guide events (one table per event, plus a `_view`).

- **30** event tables (each also has a `_view`).
- **0** are polluted SQL-injection-probe names (e.g. `sso_button_clicked..._pg_sleep_15`) — **ignore them**.
- **30** look like real product events.

<details><summary>Real event tables (click to expand)</summary>

- `checklist_completed_appcues` (23 rows)
- `checklist_dismissed_appcues` (19 rows)
- `checklist_item_completed_appcues` (2K rows)
- `checklist_item_started_appcues` (1K rows)
- `checklist_shown_appcues` (7K rows)
- `experience_started_appcues` (25K rows)
- `flow_completed_appcues` (4K rows)
- `flow_skipped_appcues` (6K rows)
- `flow_started_appcues` (11K rows)
- `from_method_app_appcues` (4 rows)
- `icon_seen_appcues` (20K rows)
- `identifies` (2.6M rows)
- `next_send_estimate_task_appcues` (49 rows)
- `next_task_followup_activity_appcues` (14 rows)
- `nps_ask_me_later_selected_at_appcues` (3K rows)
- `nps_clicked_update_nps_score_appcues` (13 rows)
- `nps_feedback_appcues` (181 rows)
- `nps_score_appcues` (398 rows)
- `nps_survey_started_appcues` (18K rows)
- `onboarding_complete_a_appcues` (3 rows)
- `onboarding_complete_b_appcues` (1 rows)
- `pages` (27.5M rows)
- `step_completed_appcues` (6K rows)
- `step_interacted_appcues` (7K rows)
- `step_interaction_appcues` (314 rows)
- `step_seen_appcues` (9K rows)
- `step_skipped_appcues` (6K rows)
- `step_started_appcues` (14K rows)
- `tracks` (139K rows)
- `users` (88K rows)

</details>

### `net`

*(inferred)* Segment **product event firehose** — one table per in-app event (`account_created`, `first_sync_completed`, `invoice_created`, …) plus a `_view`. `net.users` holds ~12.9K accounts in daily snapshots (708K rows ≠ distinct profiles; grain not yet pinned down).

- **322** event tables (each also has a `_view`).
- **38** are polluted SQL-injection-probe names (e.g. `sso_button_clicked..._pg_sleep_15`) — **ignore them**.
- **284** look like real product events.

<details><summary>Real event tables (click to expand)</summary>

- `accept_invite_clicked` (3K rows)
- `account_cancelled` (3K rows)
- `account_created` (2K rows)
- `account_marketing_email_suspension_updated` (138 rows)
- `account_on_hold` (2K rows)
- `account_on_hold_removed` (636 rows)
- `account_reinstated` (31 rows)
- `account_subscribed` (305 rows)
- `account_subscription_charge` (14K rows)
- `accounting_admin_authorize_sync` (242 rows)
- `accounting_sync_status_updated` (2K rows)
- `accounts` (86K rows)
- `action_generated_report` (1.9M rows)
- `action_processed_payment` (259K rows)
- `activity_created` (1.7M rows)
- `activity_deleted` (148K rows)
- `activity_updated` (4.8M rows)
- `admin_enabled_2fa` (23 rows)
- `aliases` (3K rows)
- `app_added` (6K rows)
- `app_created` (561 rows)
- `app_permisions_updated` (2K rows)
- `app_permissions_updated` (3K rows)
- `app_published` (133 rows)
- `app_removed` (4K rows)
- `app_routine_created` (1K rows)
- `app_routine_revision_created` (3K rows)
- `app_routine_revision_published` (3K rows)
- `app_routine_revision_updated` (24K rows)
- `app_routine_scheduled` (453 rows)
- `app_routine_tested` (3K rows)
- `app_routine_updated` (980 rows)
- `app_value_state_interaction` (47K rows)
- `attachment_widget_file_uploaded` (4 rows)
- `audit_trail_columns_selected` (1K rows)
- `audit_trail_exported` (212 rows)
- `audit_trail_searched` (14K rows)
- `authenticated_domain_added` (293 rows)
- `authenticated_domain_deleted` (102 rows)
- `bill_created` (38K rows)
- `bill_deleted` (2K rows)
- `bill_updated` (125K rows)
- `bulk_tags_modal_opened` (1 rows)
- `campaign_created` (2K rows)
- `campaign_deleted` (2 rows)
- `campaign_updated` (14K rows)
- `cases_created` (14K rows)
- `cases_deleted` (674 rows)
- `cases_updated` (99K rows)
- `chart_runtime_action` (74K rows)
- `clicked_mi_url_link` (562K rows)
- `clicked_pink_header_subscribe_link` (1K rows)
- `clicked_red_subscribe_button_in_subscription_page` (184 rows)
- `clicked_request_button` (90 rows)
- `clicked_subscribe_now_portal_link` (18 rows)
- `conditional_action` (78K rows)
- `conflicts_dropdown_used` (1K rows)
- `conflicts_export_clicked` (59 rows)
- `contact_created` (929 rows)
- `contact_not_found` (5K rows)
- `contacts_created` (44K rows)
- `contacts_deleted` (4K rows)
- `contacts_searched` (13K rows)
- `contacts_updated` (805K rows)
- `control_value_changed` (348 rows)
- `created_field` (11K rows)
- `created_table` (1K rows)
- `customer_created` (201K rows)
- `customer_deleted` (1K rows)
- `customer_updated` (763K rows)
- `dashboard_page_interaction` (794K rows)
- `dashboard_page_loaded` (1.9M rows)
- `designer_action` (178K rows)
- `discover_hub_interaction` (144 rows)
- `download_sync_engine_from_on_boarding_page` (3 rows)
- `edited_table` (50 rows)
- `email_preferences_paid_tier_disabled` (1 rows)
- `email_preferences_paid_tier_enabled` (13 rows)
- `email_preferences_send_via_method_disabled` (215 rows)
- `email_preferences_send_via_method_enabled` (35 rows)
- `email_sender_added` (142 rows)
- `email_sender_deleted` (23 rows)
- `email_sender_disabled` (4 rows)
- `email_sender_edited` (58 rows)
- `email_sender_enabled` (3 rows)
- `email_sender_privated` (8 rows)
- `email_sender_shared` (46 rows)
- `email_sender_verified` (537 rows)
- `emailtemplate_created` (2K rows)
- `emailtemplate_deleted` (5 rows)
- `emailtemplate_updated` (11K rows)
- `employee_created` (11 rows)
- `employee_deleted` (2 rows)
- `employee_updated` (525 rows)
- `entity_created` (38 rows)
- `entity_deleted` (11K rows)
- `entity_detail_viewed` (420 rows)
- `entity_grid_viewed` (485 rows)
- `entity_updated` (440K rows)
- `entity_user_list_viewed` (133 rows)
- `error_message` (2K rows)
- `estimate_created` (268K rows)
- `estimate_deleted` (25K rows)
- `estimate_updated` (3.1M rows)
- `export_abandoned` (1K rows)
- `export_accessed` (12K rows)
- `export_completed` (14K rows)
- `export_table_selected` (14K rows)
- `first_sync_attempted` (698 rows)
- `first_sync_completed` (490 rows)
- `first_sync_failed` (136 rows)
- `global_add_clicked_new` (37K rows)
- `global_add_opened` (45K rows)
- `global_help_panel_opened` (16K rows)
- `global_search_clicked_recent_record` (64K rows)
- `global_search_clicked_result_record` (363K rows)
- `global_search_lookup` (978K rows)
- `global_search_opened` (522K rows)
- `gmail_add_on_list_view_changed` (118 rows)
- `gmail_add_on_list_viewed` (860 rows)
- `gmail_add_on_portal_link_generated` (6 rows)
- `gmail_add_on_record_created` (11K rows)
- `gmail_add_on_record_viewed` (2K rows)
- `gmail_add_on_search_searched` (2K rows)
- `gmail_add_on_universal_link_clicked` (122 rows)
- `go_to_screen` (77 rows)
- `grid_searched` (73 rows)
- `groups` (545K rows)
- `help_center_opened` (7K rows)
- `help_chat_opened` (6K rows)
- `home_page_v2_interaction` (147K rows)
- `hp7i_m` (1 rows)
- `identifies` (8.5M rows)
- `impersonation_panel_clicked_record` (4K rows)
- `impersonation_panel_lookup` (4K rows)
- `import_abandoned` (1K rows)
- `import_accessed` (6K rows)
- `import_completed` (4K rows)
- `import_mass_assigned` (130 rows)
- `import_new_field_created` (243 rows)
- `import_table_selected` (6K rows)
- `inventory_location_created` (21 rows)
- `inventory_location_updated` (7 rows)
- `inventory_part_item_created` (17K rows)
- `inventory_purchase_order_created` (52 rows)
- `inventory_sales_order_created` (86 rows)
- `invoice_created` (378K rows)
- `invoice_deleted` (26K rows)
- `invoice_updated` (2.1M rows)
- `invpurchaseorderfulfilmentline_created` (6 rows)
- `invpurchaseorderfulfilmentline_updated` (1 rows)
- `invsalesorderfulfilmentline_created` (29 rows)
- `item_created` (12 rows)
- `item_deleted` (51 rows)
- `item_updated` (115K rows)
- `iteminventory_created` (190 rows)
- `iteminventory_deleted` (1K rows)
- `iteminventory_updated` (82K rows)
- `itemnoninventory_created` (157 rows)
- `itemnoninventory_deleted` (239 rows)
- `itemnoninventory_updated` (19K rows)
- `itemservice_created` (13 rows)
- `itemservice_deleted` (110 rows)
- `itemservice_updated` (7K rows)
- `lead_converted` (99K rows)
- `leadforms_created` (797 rows)
- `leadforms_deleted` (60 rows)
- `leadforms_updated` (633K rows)
- `left_menu_item_clicked` (15K rows)
- `mail_chimp_right_panel` (51 rows)
- `method_pay_application_submitted` (21 rows)
- `method_pay_gateway_connected` (9 rows)
- `method_pay_onboarding_in_progress` (17 rows)
- `method_pay_onboarding_started` (24 rows)
- `multi_entity_enabled` (32 rows)
- `non_inventory_part_item_created` (11K rows)
- `notification_created` (41K rows)
- `notification_event` (119K rows)
- `notification_sent` (47K rows)
- `oauth_disconnected` (14 rows)
- `onboard_page_interaction` (20K rows)
- `onboarding_survey_submitted` (2K rows)
- `one_time_sign_up_code_submitted` (61 rows)
- `opportunity_created` (82K rows)
- `opportunity_deleted` (5K rows)
- `opportunity_updated` (774K rows)
- `orv6_s` (1 rows)
- `othername_created` (4 rows)
- `pack_added` (12K rows)
- `pack_removed` (1K rows)
- `page_loaded` (37.9M rows)
- `panel_opened` (481K rows)
- `pop_up_dialog_opened` (56K rows)
- `portal_contact_us_link_clicked` (19 rows)
- `portal_login_screen_loaded` (217K rows)
- `portal_sign_in_code_applied` (51K rows)
- `portal_sign_in_code_requested` (40K rows)
- `portal_user_checking_requested` (41K rows)
- `proposal_created` (2K rows)
- `proposal_deleted` (173 rows)
- `proposal_updated` (38K rows)
- `purchase_order_fulfillment_undone` (24 rows)
- `purchase_order_fully_received` (40 rows)
- `purchase_order_partially_received` (37 rows)
- `purchaseorder_created` (54K rows)
- `purchaseorder_deleted` (3K rows)
- `purchaseorder_updated` (486K rows)
- `purchaseorderline_created` (75K rows)
- `purchaseorderline_deleted` (11K rows)
- `purchaseorderline_updated` (224K rows)
- `quick_books_preferences_action` (1 rows)
- `quick_books_sync_connected` (93 rows)
- `quick_books_sync_disconnected` (130 rows)
- `quick_books_sync_downloaded_engine` (246 rows)
- `quick_books_sync_first_sync_attempted` (781 rows)
- `quick_books_sync_first_sync_completed` (671 rows)
- `quick_books_sync_first_sync_failed` (27 rows)
- `quick_books_sync_invite_email_sent` (42 rows)
- `quick_books_sync_manual_changes_only_sync` (144 rows)
- `quick_books_sync_manual_full_sync` (24 rows)
- `quick_invite_user_panel_opened` (773 rows)
- `receivepayment_created` (133K rows)
- `receivepayment_deleted` (6K rows)
- `receivepayment_updated` (218K rows)
- `recurrence_opened` (7K rows)
- `rooms` (1 rows)
- `runtime_button_clicked` (15.9M rows)
- `runtime_interaction` (11.5M rows)
- `sales_order_fulfillment_undone` (42 rows)
- `sales_order_fully_shipped` (103 rows)
- `sales_order_partially_shipped` (34 rows)
- `salesorder_created` (137K rows)
- `salesorder_deleted` (9K rows)
- `salesorder_updated` (1.3M rows)
- `salesorderline_created` (217K rows)
- `salesorderline_deleted` (77K rows)
- `salesorderline_updated` (461K rows)
- `salesreceipt_created` (49K rows)
- `salesreceipt_deleted` (4K rows)
- `salesreceipt_updated` (203K rows)
- `screen_created` (2K rows)
- `screen_security_updated` (306 rows)
- `screen_upgrade_completed` (7 rows)
- `send_sync_engine_email_instructions` (42 rows)
- `service_part_item_created` (2K rows)
- `shuttle_form_launched` (20 rows)
- `shuttle_payments_gateway_connected` (165 rows)
- `shuttle_payments_gateway_disconnected` (22 rows)
- `sign_up_form_interaction` (6K rows)
- `sign_up_page_loaded` (19K rows)
- `signature_component_signed` (72K rows)
- `signin_page_loaded` (251 rows)
- `sms_preferences_paid_tier_enabled` (17 rows)
- `sms_preferences_send_via_method_enabled` (6 rows)
- `sso_button_clicked` (28K rows)
- `sso_button_clicked_2527_2522` (5 rows)
- `stock_adjustment_created` (20 rows)
- `sub_entity_created` (31 rows)
- `sub_entity_updated` (83 rows)
- `sync_results_accessed` (1 rows)
- `sync_widget_clicked` (16K rows)
- `system_page_loaded` (754K rows)
- `system_settings_updated` (3K rows)
- `tab_opened` (6.6M rows)
- `tracks` (102.9M rows)
- `user_accepted_invite` (2K rows)
- `user_activated` (141 rows)
- `user_created` (10K rows)
- `user_deactivated` (1K rows)
- `user_enabled_2fa` (170 rows)
- `user_invited` (2K rows)
- `user_logged_in_with_2fa` (7K rows)
- `user_role_updated` (514 rows)
- `users` (1.0M rows)
- `vendor_created` (2K rows)
- `vendor_updated` (3K rows)
- `verification_code_form_interaction` (588 rows)
- `verification_code_successfully_verified` (122 rows)
- `verification_email_interaction` (2 rows)
- `version_action` (66K rows)
- `version_banner_clicked` (21K rows)
- `wcuh_y` (1 rows)
- `ztfus` (1 rows)
- `zyt_wo` (1 rows)

</details>

### `revenue`

Raw sources, intermediates, deprecated aliases, and Justin's hand-written revenue/MRR views. Mixed trust — verify before quoting.

| Table | Type | Rows | Documented? | Description |
|---|---|---|---|---|
| `252580casesTEMP` | table | 149 | — |  |
| `Account` | table | 146K | — |  |
| `Activity` | table | 626K | — |  |
| `Cases` | table | 17K | — |  |
| `Entity` | table | 202K | — |  |
| `Funnel` | view | 0 | — |  |
| `Item` | table | 477 | — |  |
| `TimeTracking` | table | 0 | — |  |
| `Trans` | table | 292K | — |  |
| `TransLineFlattened` | view | 0 | — |  |
| `demo_bookings` | table | 0 | — |  |
| `fx_rates` | table | 50 | — |  |
| `int_annual_mrr_movement_decomposed` | table | 166K | ✅ | Annual-cohort sibling of int_mrr_movement_decomposed: per (month, entity) change comparing the customer's book at month M vs M-12, split into app_mrr / seat_mrr / price_mrr via the same price–volume–mix decomposition, plus a movement_kind label (downgrade / expansion / cancellation / new / flat). Validated 2026-06-04: identity holds within $0.01 across all rows (scripts/parity_annual_decomposition_identity.py); reconciles to v_metric__annual_downgrades / expansions / cancellations at $0.00 across all overlapping periods (scripts/parity_annual_decomposition_vs_metrics.py).
 |
| `int_attribution_fractional` | view | 0 | ✅ | PRIMITIVE — real multi-touch (fractional) channel attribution. One row per
(account × channel) with the fractional attribution weight; each account's
weights sum to exactly 1.0 across channels (one customer's credit spread
across the channels that touched them). Distinct from the single-touch
`AttributionChannel` dimension (which collapses each account to one channel
and buckets the rest as 'Unknown'). Carries signup/first-invoice dates,
run-rate plan amount (Custdatlastsaasamount), first-invoice net SaaS, and
US/non-US region, so any fractional \"X by channel\" measure is
SUM(<measure> * attribution_weight) GROUP BY channel. Excludes test accounts
and internal Method Integration partner rows.
 |
| `int_cancellations` | view | 0 | ✅ | One row per Method account that canceled. Account-grain — accounts with a real CancellationDate. Includes AgeBucket (0-6mo / 6-12mo / 12-24mo / 24mo+) and LicenseTier (1 / 2-5 / 6-15 / 16+) for cohort analysis. Excludes test accounts and internal Method Integration partner rows. The intermediate that backs the Churn (#59) metric. |
| `int_conversions` | view | 0 | ✅ | One row per Method account that converted from trial to paying. Account-grain — accounts with FirstSaaSInvoiceTxnDate set. Excludes test accounts (IsConversionException) and internal Method Integration partner rows. Carries attribution, vertical, country, signup dates, and conversion timestamps. The intermediate that backs the Conversions (#56) metric. |
| `int_customer_annual_mrr` | table | 166K | — |  |
| `int_customer_mrr` | table | 177K | ✅ | Per-customer per-month MRR with movement classification. Migrated from the
orphaned BQ view 2026-06-03 (see knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql).
Parity-verified via scripts/parity_int_customer_mrr.py (MRR math bit-identical to legacy).
Methodology: CEO-confirmed symmetric Prepay-Expiry exclusion (2026-04-28).
Movements are PARALLEL columns (NewMRR/Expansions/Downgrades/Cancellations), not a single movement_kind.
 |
| `int_customer_mrr_lines` | table | 1.2M | ✅ | Monthly line composition per customer-entity (month, entity, item) with qty (seats proxy), saas, and an is_discount flag. Mirrors int_customer_mrr's raw monthly book but keeps line detail. Validated 2026-06-03: rolls up bit-exact to int_customer_mrr's customer-month SaaS total (scripts/parity_customer_mrr_lines.py).
 |
| `int_customer_proserv` | view | 0 | ✅ | Professional-services / customization signal, entity grain. One row per customer that bought project hours (any PS-grouped billing line with positive gross). ps_gross = total PSBeforeDiscount; first_ps_date = earliest such line. Project-hours magnitude (delivered time) is NOT here — revenue.TimeTracking is empty in BQ. Directional input to the motion funnel.
 |
| `int_customer_retention_triangle` | table | 30K | ✅ | Customer retention CUBE, customer grain (EntityRecordID). One row per (cohort_month, tenure_k, l1, segment, country, channel). Frontend sums the filtered slice and derives four views: Customers vs MRR, each From-start (active/start) or Previous-month (active/prior). Dims frozen at cohort start; l1 is current V7 classification (Multi-client or Unclassified bucket where no label exists). No in-model n_start threshold; apply at display time. Monthly cohorts; signup gate Trial >= 2021-06-01; right-censored at the latest complete month. Sources: int_customer_mrr + v7_classification.v_entity_primary_label.
 |
| `int_customer_segments` | view | 0 | ✅ | One row per (customer × month) with segment classification (Solo / Small Team / Team by user count; Team AI Plus tier if customer has DEP). Thin wrapper over int_customers — same customer-grain, fewer columns. Used by segment-based scorecards in the chart builder. |
| `int_customer_survival` | table | 97 | ✅ | Cohort survival by first-pay vintage, entity grain. One row per (vintage, tenure_k). Logo survival = n_alive / n_start (count-weighted). GRR = retained_mrr / base_mrr (dollar-weighted, expansion capped). The two differ; \"still paying\" describes only the logo line. Anchor = each entity's first paying month; signup gate Trial >= 2021-06-01; cells with n_start < 30 dropped; right-censored at the latest complete month. Parity: VINTAGE_SQL + §18 verification-queries.md (2026-06).
 |
| `int_customers` | table | 105K | — |  |
| `int_motion_funnel` | table | 47K | ✅ | Per-customer motion + lifecycle funnel, entity grain — one row per trialer. Spine (trial/sync/convert) + talked-to-us fork (demo or free consulting, attended, pre-convert) + customization + DEP/prepay/industry lenses + a 1/3/6/12-month retention curve (numerator retained_Kmo, denominator eligible_Kmo). Directional: motion is only trustworthy for 2024+ cohorts (motion_trackable). Status directional; lives in revenue, not revenue_metrics.
 |
| `int_mrr_movement_decomposed` | table | 180K | ✅ | Per (month, entity) month-over-month MRR change split into app_mrr / seat_mrr / price_mrr via a price–volume–mix decomposition, plus a movement_kind label (downgrade / expansion / cancellation / new / flat). Buckets sum to the net change. Validated 2026-06-03: reconciles to int_customer_mrr movement totals at $0.00 across 96 (month, kind) pairs (scripts/parity_mrr_decomposition_vs_customer_mrr.py).
 |
| `int_partner_accounts` | table | 5K | ✅ | One row per (Partner, CompanyAccount) — the accounts a referring partner brought in. Partner = raw revenue.Account.Partner string (no normalization in v1). IsActive is a lifecycle flag (FirstSaaSInvoiceTxnDate set AND no CancellationDate), matching the partner CRM \"Active?\" view (SBS: 47/47). MRR and Licenses are point-in-time billing for the latest complete month; they are 0 for accounts that did not bill that month — including hard-hold accounts that are still lifecycle-active. Excludes the internal \"Method Integration\" partner and m11/m18 test accounts. Account is deduped to one row per CompanyAccount. See spec docs/superpowers/specs/2026-06-25-partner-referral-views-design.md.
 |
| `int_presale_touches` | view | 0 | ✅ | Pre-sale human-touch signals per customer (entity grain), from the Activity table. Demo and free-consulting booked/attended states + first attended dates. attended_any drives the funnel's talked-to-us fork. Date is DueDateStart; tracking effectively starts 2024 (older cohorts read as untouched).
 |
| `int_syncs` | view | 0 | ✅ | One row per sync milestone event from Method's funnel pipeline.
Event-grain — ~91% of accounts have exactly 1 sync event; ~9% have 2+
from re-syncs after disconnect/reconnect. Carries EntityRecordID,
CompanyAccount, SyncDate, SignupDate, and attribution columns. Source:
revenue.Funnel filtered to EventType = 'Sync'. The intermediate that
backs the Syncs (#55) metric.
 |
| `int_trials` | view | 0 | ✅ | One row per Method account that began a trial. Account-grain — a customer
with 2 trial accounts contributes 2 rows. Excludes test accounts
(IsConversionException), internal Method Integration partner rows, and
the '0001-01-01' sentinel date. Carries CompanyAccount, AttributionChannel,
signup country/vertical/sync type, and per-attribution-touch (Att_*)
columns. The intermediate that backs the Trials (#54) metric.
 |
| `looker_inputs` | table | 0 | — |  |
| `method_forecast` | table | 0 | — |  |
| `v_accounts` | view | 0 | — |  |
| `v_bom_customers` | view | 0 | — |  |
| `v_cancellations` | view | 0 | ✅ | DEPRECATED ALIAS — renamed to int_cancellations (Phase 1.5, 2026-05-14). This view is a thin passthrough; query int_cancellations directly. Will be dropped in a future round once usage in INFORMATION_SCHEMA.JOBS shows zero hits. |
| `v_cancellations_mrr` | view | 0 | — |  |
| `v_channel_arr` | view | 0 | ✅ | DIRECTIONAL run-rate, NOT accounting-grade. New-customer ARR by marketing
channel, one row per (attribution channel x first-invoice month). Replicates
the marketing Looker \"Revenue by Channel\" dashboard. \"SaaS\" is each new
customer's current monthly plan rate (Custdatlastsaasamount) allocated to its
attribution channel — a run-rate snapshot, NOT invoiced revenue, so it does
not tie to QuickBooks/RevCogs (that uses SaaSAmount). Use for directional
ARR-by-channel storytelling only; the canonical run-rate is int_customer_mrr.
FX is applied by the consumer: emits the pre-FX US / non-US SaaS split so
CAD ARR = ((saas_us_portion*rate + saas_nonus_portion)/attribution_value)*12.
Excludes test accounts, internal Method Integration partner rows, and the
current incomplete month.
 |
| `v_channel_arr_display` | view | 0 | ✅ | DIRECTIONAL presentation view for the Channel ARR scorecard — final display
columns per (channel × first-invoice month) computed from v_channel_arr (on
the int_attribution_fractional real-multi-touch primitive). \"SaaS\" is the
run-rate (Custdatlastsaasamount) allocated by fractional attribution — NOT
invoiced revenue, does not tie to RevCogs. CAD ARR baked at a fixed 1.33.
Penny-matched to the Looker \"Revenue by Channel\" dashboard (May 2026).
 |
| `v_channel_scorecard` | view | 0 | — |  |
| `v_conversions` | view | 0 | ✅ | DEPRECATED ALIAS — renamed to int_conversions (Phase 1.5, 2026-05-14). This view is a thin passthrough; query int_conversions directly. Will be dropped in a future round once usage in INFORMATION_SCHEMA.JOBS shows zero hits. |
| `v_customer_annual_mrr` | view | 0 | ✅ | DEPRECATED ALIAS — renamed to int_customer_annual_mrr (Phase 1.5, 2026-05-14). This view is a thin passthrough; query int_customer_annual_mrr directly. Will be dropped in a future round once usage in INFORMATION_SCHEMA.JOBS shows zero hits. |
| `v_customer_mrr` | view | 0 | ✅ | DEPRECATED ALIAS — renamed to int_customer_mrr (Phase 1.5, 2026-05-14). This view is a thin passthrough; query int_customer_mrr directly. Will be dropped in a future round once usage in INFORMATION_SCHEMA.JOBS shows zero hits. |
| `v_customer_segments` | view | 0 | ✅ | DEPRECATED ALIAS — renamed to int_customer_segments (Phase 1.5, 2026-05-14). This view is a thin passthrough; query int_customer_segments directly. Will be dropped in a future round once usage in INFORMATION_SCHEMA.JOBS shows zero hits. |
| `v_customers` | view | 0 | ✅ | DEPRECATED ALIAS — renamed to int_customers (Phase 1.5, 2026-05-14). This view is a thin passthrough; query int_customers directly. Will be dropped in a future round once usage in INFORMATION_SCHEMA.JOBS shows zero hits. |
| `v_downgrades_mrr` | view | 0 | — |  |
| `v_expansions_mrr` | view | 0 | — |  |
| `v_metric__annual_cancellations_mrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__annual_cancellations_mrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__annual_downgrades_mrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__annual_downgrades_mrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__annual_expansions_mrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__annual_expansions_mrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__annual_grr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__annual_grr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__annual_nrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__annual_nrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__annual_start_mrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__annual_start_mrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__churn` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__churn`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__conversions` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__conversions`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__customers` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__customers`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__monthly_cancellations_mrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__monthly_cancellations_mrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__monthly_downgrades_mrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__monthly_downgrades_mrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__monthly_expansions_mrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__monthly_expansions_mrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__monthly_grr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__monthly_grr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__monthly_nrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__monthly_nrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__monthly_start_mrr` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__monthly_start_mrr`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__sync_rate` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__sync_rate`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__sync_to_conversion_rate` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__sync_to_conversion_rate`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__syncs` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__syncs`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__trial_to_conversion_rate` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__trial_to_conversion_rate`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_metric__trials` | view | 0 | ✅ | DEPRECATED LOCATION — verified metrics now live in the revenue_metrics dataset. This view is a thin alias over `revenue_metrics.v_metric__trials`. Update any saved query to point at revenue_metrics. Will be dropped once usage shows zero hits. |
| `v_motion_funnel` | view | 0 | ✅ | Motion + lifecycle acquisition funnel, aggregated to (signup_month, motion). Counts only: trials → synced → demo booked/attended → converted → customized → retained at 1/3/6/12 months (each with an eligibility denominator for maturity). The talked-to-us fork is only valid for 2024+ cohorts. Directional — inputs (Activity, V7) are partial; not a verified metric.
 |
| `v_new_dep_revenue` | view | 0 | — |  |
| `v_new_mrr` | view | 0 | — |  |
| `v_new_net_saas` | view | 0 | — |  |
| `v_other_in_mrr` | view | 0 | — |  |
| `v_other_out_mrr` | view | 0 | — |  |
| `v_partner_scorecard` | view | 0 | ✅ | One row per partner: roll-up of int_partner_accounts. AccountsReferred is all-time; ActiveAccounts is a lifecycle count (not cancelled); TotalLicenses and TotalMRR are actual billing for the latest complete month. Active count and TotalMRR intentionally do not reconcile (hard-hold accounts are active but bill $0). Raw partner strings in v1, so a partner with name variants can appear as more than one row (3 partners affected; see spec follow-ups).
 |
| `v_saas_mrr` | view | 0 | — |  |
| `v_scorecard_mtd` | view | 0 | — |  |
| `v_syncs` | view | 0 | ✅ | DEPRECATED ALIAS — renamed to int_syncs (Phase 1.5, 2026-05-14). This view is a thin passthrough; query int_syncs directly. Will be dropped in a future round once usage in INFORMATION_SCHEMA.JOBS shows zero hits. |
| `v_syncs_forecast_channel` | view | 0 | — |  |
| `v_syncs_trajectory_channel` | view | 0 | — |  |
| `v_total_dep_revenue` | view | 0 | — |  |
| `v_total_net_saas` | view | 0 | — |  |
| `v_trials` | view | 0 | ✅ | DEPRECATED ALIAS — renamed to int_trials (Phase 1.5, 2026-05-14). This view is a thin passthrough; query int_trials directly. Will be dropped in a future round once usage in INFORMATION_SCHEMA.JOBS shows zero hits. |
| `v_trials_by_channel` | view | 0 | — |  |
| `v_trials_by_country` | view | 0 | — |  |
| `v_trials_by_industry` | view | 0 | — |  |
| `v_trials_by_sync_type` | view | 0 | — |  |
| `v_trials_forecast_channel` | view | 0 | — |  |
| `v_trials_trajectory_channel` | view | 0 | — |  |

### `revenue_dbt_test__audit`

*(undocumented — purpose unverified)*

| Table | Type | Rows | Documented? | Description |
|---|---|---|---|---|
| `accepted_values_int_customer_r_d1e47123b4877aeff1c3a6280aebef7e` | table | 0 | — |  |
| `assert_retention_triangle_invariants` | table | 0 | — |  |
| `assert_retention_triangle_unique` | table | 0 | — |  |
| `not_null_int_customer_retention_triangle_cohort_month` | table | 0 | — |  |
| `not_null_int_customer_retention_triangle_mrr_start` | table | 0 | — |  |
| `not_null_int_customer_retention_triangle_n_active` | table | 0 | — |  |
| `not_null_int_customer_retention_triangle_n_start` | table | 0 | — |  |
| `not_null_int_customer_retention_triangle_tenure_k` | table | 0 | — |  |

### `revenue_metrics`

Method's verified, dbt-managed metric catalog (v_metric__*). Materialized from the dbt project at github.com/nickperaltab/method-metrics. Every view here has a consumer-facing description and labels (status, metric_id, type). Sister to the 'revenue' dataset which holds raw sources, intermediates, and unverified analytical views.

> BigQuery dataset description: Method's verified, dbt-managed metric catalog (v_metric__*). Materialized from the dbt project at github.com/nickperaltab/method-metrics. Every view here has a consumer-facing description and labels (status, metric_id, type). Sister to the 'revenue' dataset which holds raw sources, intermediates, and unverified analytical views.

| Table | Type | Rows | Documented? | Description |
|---|---|---|---|---|
| `v_metric__annual_cancellations_mrr` | view | 0 | ✅ | Total MRR lost from customer cancellations measured at annual cohort
grain, in dollars summed across all customers. Pre-FX — currencies
(USD, CAD, UK) at face value, not USD-converted. Excludes internal
Method accounts. Uses CEO-confirmed Prepay Expiry methodology.
Foundation for annual GRR (#388).
 |
| `v_metric__annual_downgrades_mrr` | view | 0 | ✅ | Total MRR lost from existing-customer downgrades at annual cohort
grain (customers paying less than the prior year but not canceling),
in dollars summed across all customers. Any non-zero year-over-year
MRR drop for an existing customer counts; there is no minimum
threshold. Pre-FX — currencies (USD, CAD, UK) at face value, not
USD-converted. Excludes internal Method accounts. Inherits the
v_customer_annual_mrr Prepay Expiry methodology.
 |
| `v_metric__annual_expansions_mrr` | view | 0 | ✅ | Total MRR gained from existing-customer expansions at annual cohort
grain (customers paying more than the prior year), in dollars summed
across all customers. Any non-zero year-over-year MRR increase for
an existing customer counts; there is no minimum threshold. Pre-FX —
currencies (USD, CAD, UK) at face value, not USD-converted. Existing
customers only — net-new customer revenue is tracked separately.
Foundation for annual NRR (#389).
 |
| `v_metric__annual_grr` | view | 0 | ✅ | Annual Gross Revenue Retention — fraction of last year's MRR retained
this year-end cohort, excluding expansion. Formula: (Annual StartMRR
- Annual Cancellations - Annual Downgrades) / Annual StartMRR.
Pre-FX. Typical values 76-78%. Lower than monthly GRR because more
churn accumulates over 12 months. Uses CEO-confirmed methodology;
reconcile against board deck before external use.
 |
| `v_metric__annual_nrr` | view | 0 | ✅ | Annual Net Revenue Retention — fraction of last year's MRR retained
this year-end cohort INCLUDING expansion from existing customers.
Formula: (Annual StartMRR - Annual Cancellations - Annual Downgrades
+ Annual Expansions) / Annual StartMRR. Pre-FX. Typical values
88-90%. Lower than monthly NRR because more churn accumulates over
12 months. Uses CEO-confirmed methodology; reconcile against board
deck before external use.
 |
| `v_metric__annual_start_mrr` | view | 0 | ✅ | Total MRR at the start of each annual cohort, summed across all
customers. Pre-FX — currencies (USD, CAD, UK) at face value, not
USD-converted. Excludes internal Method accounts. Uses CEO-confirmed
methodology that excludes one-time Prepay Expiry write-offs.
Foundation for annual GRR / NRR (#388 / #389). Annual cohort
reported monthly (trailing comparison).
 |
| `v_metric__churn` | view | 0 | ✅ | Monthly count of Method customers that canceled, grouped by cancellation
month. Customer-grain — uses COUNT(DISTINCT CompanyAccount), so a
customer with multiple canceling accounts in the same month counts
ONCE. Excludes test accounts and internal Method Integration partner
rows. This is a count of customers, not dollar churn — see Monthly
Cancellations ($) (#379) for MRR lost.
 |
| `v_metric__conversions` | view | 0 | ✅ | Monthly count of Method accounts that converted from trial to paying
(i.e., received their first SaaS invoice). Account-grain — a customer
with 2 accounts that both converted contributes 2 conversions, by
design. Excludes test accounts and internal Method Integration
partner rows. Foundation for Conversion Rate metrics (#301, #302).
 |
| `v_metric__customers` | view | 0 | ✅ | Monthly count of unique active Method customers — companies with
revenue activity in the month. Customer-grain — a company with
multiple Method accounts counts ONCE per month (unlike Trials,
which counts each account separately). Current month is incomplete;
partial values until month-end.
 |
| `v_metric__monthly_cancellations_mrr` | view | 0 | ✅ | Total MRR lost from customer cancellations each month, in dollars
summed across all customers. Pre-FX — currencies (USD, CAD, UK) at
face value, not USD-converted. Excludes internal Method accounts.
Uses CEO-confirmed methodology that excludes one-time Prepay Expiry
write-offs from both StartMRR and Cancellations. Foundation for
monthly GRR.
 |
| `v_metric__monthly_downgrades_mrr` | view | 0 | ✅ | Total MRR lost from customer downgrades each month (existing customers
paying less than the previous month, but not canceling), in dollars
summed across all customers. Pre-FX — currencies (USD, CAD, UK) at
face value, not USD-converted. Excludes internal Method accounts.
Inherits the v_customer_mrr Prepay Expiry methodology.
 |
| `v_metric__monthly_expansions_mrr` | view | 0 | ✅ | Total MRR gained from customer expansions each month (existing
customers paying more than the previous month), in dollars summed
across all customers. Pre-FX — currencies (USD, CAD, UK) at face
value, not USD-converted. Excludes internal Method accounts.
Inherits the v_customer_mrr Prepay Expiry methodology. Foundation
for monthly NRR.
 |
| `v_metric__monthly_grr` | view | 0 | ✅ | Monthly Gross Revenue Retention — fraction of last month's MRR
retained this month, excluding expansion. Formula: (StartMRR -
Cancellations - Downgrades) / StartMRR. Pre-FX. Typical values
95-97%. Uses CEO-confirmed symmetric Prepay Expiry exclusion;
diverges from board-deck monthly GRR by ~4-6bp because the deck
uses asymmetric methodology. For any number heading to the board,
reconcile against the deck first.
 |
| `v_metric__monthly_nrr` | view | 0 | ✅ | Monthly Net Revenue Retention — fraction of last month's MRR retained
this month INCLUDING expansion from existing customers. Formula:
(StartMRR - Cancellations - Downgrades + Expansions) / StartMRR.
Pre-FX. Typical values 97-99% — expansion mostly offsets churn at
Method's scale. Uses CEO-confirmed symmetric Prepay Expiry exclusion.
For board reporting, reconcile against the board deck first
(~4-6bp methodology gap).
 |
| `v_metric__monthly_start_mrr` | view | 0 | ✅ | Total MRR at the start of each month, in dollars summed across all
customers. Pre-FX — currencies (USD, CAD, UK) at face value, not
USD-converted. Excludes internal Method accounts. Uses CEO-confirmed
methodology that excludes one-time Prepay Expiry write-offs from
both StartMRR and Cancellations. Foundation for monthly GRR / NRR.
 |
| `v_metric__sync_rate` | view | 0 | ✅ | Monthly Sync Rate — sync milestone events divided by trial signups
that month, at account-grain. Today's typical range is 50-65%. Not
a clean \"% of customers who synced\" — both numerator and denominator
are account/event counts. For exact \"fraction of unique trial cohort
that synced,\" a different metric would be needed.
 |
| `v_metric__sync_to_conversion_rate` | view | 0 | ✅ | Monthly Sync-to-Conversion Rate — conversions divided by syncs that
month, at account-grain. Measures how well synced accounts progress
to paying customers. Both numerator and denominator are account/event
counts (see Conversions #56 and Syncs #55). Use for funnel-stage
analysis, not as a clean \"% of unique sync cohort that converted.\"
 |
| `v_metric__syncs` | view | 0 | ✅ | Monthly count of Method accounts that hit a sync milestone. Account-grain
— each row in the source represents one CompanyAccount syncing for the
first time. There are no true \"re-syncs\" in the data: when the same
person (EntityRecordID) appears more than once, it's because they
started a new trial under a different CompanyAccount months/years later
— a distinct funnel event that counts separately, by design. Foundation
for Sync Rate (#300).
 |
| `v_metric__trial_to_conversion_rate` | view | 0 | ✅ | Monthly Trial-to-Conversion Rate — conversions divided by trials
that month, at account-grain. Measures how well trial accounts
progress to paying customers. Both numerator and denominator are
account-grain counts (see Conversions #56 and Trials #54). Use for
funnel-stage analysis. Note: the numerator (conversions) and
denominator (trials) for the same month don't share a cohort —
most conversions in a given month come from trials in earlier
months. For cohort-locked conversion rate, a different metric
would be needed.
 |
| `v_metric__trials` | view | 0 | ✅ | Monthly count of Method accounts that began a trial. Account-grain —
a customer with 2 trial accounts contributes 2 trials, by design.
Excludes test accounts, internal Method Integration partner rows,
and the '0001-01-01' sentinel value. For unique-customer counts,
use Customers (#373).
 |

### `revenue_validation`

Phase-1 Net SaaS validation staging dataset (dbt staging target)

> BigQuery dataset description: Phase-1 Net SaaS validation staging dataset (dbt staging target)

| Table | Type | Rows | Documented? | Description |
|---|---|---|---|---|
| `int_annual_mrr_movement_decomposed` | view | 0 | — |  |
| `int_customer_annual_mrr` | table | 166K | — |  |
| `int_customer_mrr` | view | 0 | ✅ | Per-customer per-month MRR with movement classification. Migrated from the
orphaned BQ view 2026-06-03 (see knowledge/verified-queries/int_customer_mrr-pre-migration-ddl.sql).
Parity-verified via scripts/parity_int_customer_mrr.py (MRR math bit-identical to legacy).
Methodology: CEO-confirmed symmetric Prepay-Expiry exclusion (2026-04-28).
Movements are PARALLEL columns (NewMRR/Expansions/Downgrades/Cancellations), not a single movement_kind.
 |
| `int_customer_mrr_lines` | view | 0 | ✅ | DRAFT. Monthly line composition per customer-entity (month, entity, item) with qty (seats proxy), saas, and an is_discount flag. Mirrors int_customer_mrr's monthly book but keeps line detail. Lives in `revenue` (unverified).
 |
| `int_customers` | view | 0 | — |  |
| `int_mrr_movement_decomposed` | view | 0 | ✅ | DRAFT. Per (month, entity) month-over-month MRR change split into app_mrr / seat_mrr / price_mrr via a price–volume–mix decomposition, plus a movement_kind label (downgrade / expansion / cancellation / new / flat). Buckets sum to the net change, so it reconciles to int_customer_mrr movements. NOT validated.
 |

### `test_import`

Scratch / test tables. Ignore.

| Table | Type | Rows | Documented? | Description |
|---|---|---|---|---|
| `classification` | table | 5K | — |  |
| `simple` | table | 3 | — |  |
| `simple_accounts` | table | 2 | — |  |
| `test_acc3` | table | 0 | — |  |

### `v7_classification`

V7 industry classification — current state + audit history. Source of truth is Method's CustomerIndustryClassification table; this is the analytics-side mirror, synced nightly via sync_method_to_bq.py.

> BigQuery dataset description: V7 industry classification — current state + audit history. Source of truth is Method's CustomerIndustryClassification table; this is the analytics-side mirror, synced nightly via sync_method_to_bq.py.

| Table | Type | Rows | Documented? | Description |
|---|---|---|---|---|
| `account_enrichment_attempts` | table | 2K | — |  |
| `account_enrichment_raw` | table | 11K | ✅ | Raw enrichment evidence captured during V7 classification runs. One row per tool call (WebFetch / WebSearch / BBB / Clay). Joinable to v7_classification.account_labels via account_record_id. Useful for: full-text search across customer websites, audit trails ('why did V7 pick this label'), retroactive structured fact extraction, ML training data, cross-team queries about what customers' websites actually say. |
| `account_entity_map` | table | 8K | — |  |
| `account_labels` | table | 8K | ✅ | Current-state V7 classification per Method account. One row per account_record_id, MERGE-updated by sync_method_to_bq.py. |
| `account_level_confidence` | table | 2K | — |  |
| `label_history` | table | 651K | ✅ | Append-only audit log of every V7 classification ever seen in a sync. Partitioned by snapshot_at date for cost-efficient querying. Use this to see how an account's classification changed over time. |
| `operating_model_reason` | table | 2K | — |  |
| `v_classified_accounts_full` | view | 0 | — |  |
| `v_cohort_grid` | view | 0 | — |  |
| `v_entity_primary_label` | view | 0 | — |  |
| `v_review_queue` | view | 0 | — |  |
| `v_vertical_vs_l1` | view | 0 | — |  |

<!-- AUTOGEN:END -->
