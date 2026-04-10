---
name: onboard
description: Fast orientation for new collaborators. Covers what data Method has in BigQuery, what terms to know, how the system fits together, what's solved vs blocked, and where to find everything.
---

# Method Metrics Onboarding

You are onboarding a new collaborator (human or AI session) to the Method Metrics project. Give them the lay of the land so they can start contributing immediately.

## What This Project Is

A shared metric tracker and dashboard for Method CRM. It tracks ~65 active business metrics across marketing funnel, sales, revenue, retention, and forecasts.

**Architecture (3 layers):**

```
BigQuery (source of truth for data)
  -> Supabase (metric registry — names, formulas, IDs, status)
    -> Frontend (vanilla HTML tracker + React chart builder)
```

- **BigQuery** has ~8 views + 2 key tables in `project-for-method-dw.revenue.*`. Views are primitives (v_trials, v_syncs, v_conversions, v_cancellations) and revenue aggregations (v_new_net_saas, v_total_net_saas, etc.). The `TransLineFlattened` table has raw revenue transaction data for retention metrics. The `method_forecast` table has daily budget/forecast numbers.
- **Supabase** stores the metric catalog: ID, name, formula, BQ view mapping, status, dependencies. The AI chart builder reads this catalog to know what metrics exist.
- **Frontend** is two things: `tracker.html` (vanilla HTML/JS metric tracker) and `builder/` (React app with AI-powered chart builder deployed to GitHub Pages).

No build step for the tracker. The chart builder uses Vite: `cd builder && npm run build`.

## What Data We Have (and Don't Have)

### In BigQuery Now (queryable)

| Domain | What's There | Key Tables/Views |
|--------|-------------|-----------------|
| Marketing Funnel | Trial signups, syncs, conversions, cancellations | `v_trials`, `v_syncs`, `v_conversions`, `v_cancellations` |
| Revenue (new) | New customer SaaS revenue, new DEP revenue | `v_new_net_saas`, `v_new_dep_revenue` |
| Revenue (total) | Total net SaaS, total DEP revenue | `v_total_net_saas`, `v_total_dep_revenue` |
| Revenue (raw) | Every transaction line item since Dec 2021 | `TransLineFlattened` |
| Retention | NRR, GRR, MRR, cancellation $, expansion $, downgrades | Computed from `TransLineFlattened` (13 verified queries) |
| Forecasts | Daily budget + forecast for trials, syncs, churn, revenue, NRR | `method_forecast` |
| Accounts | Master account data (signup dates, partner, conversion exceptions) | `Account` |

### NOT in BigQuery (blocked)

| Domain | Why It's Blocked | Metric Count |
|--------|-----------------|--------------|
| P&L (profit & loss) | Lives in Accountant's Google Sheets, not ingested | 23 |
| RevCogs forecast model | Google Sheets, not connected | 20 |
| Marketing attribution (CAC) | Needs CampaignCookie from Alocet | 10 |
| Marketing KPI tracker | Google Sheets, not connected | 8 |
| Balance sheet | Accountant's Google Sheets | 5 |
| FX rates | Need Bank of Canada / OFX API | 4 |
| Headcount | Accountant's Google Sheets | 3 |

Of 155 metrics in the full catalog, ~49 are derivable from existing BQ data and ~102 need new data sources ingested.

## Metric Families

| Family | Status | Route File |
|--------|--------|------------|
| revenue-retention | Solved, 13 verified queries match spreadsheet to the penny | `knowledge/routes/revenue-retention.md` |
| marketing | Partially solved — trials, syncs, conversions are live; CAC/attribution blocked | `knowledge/routes/marketing.md` |
| forecast | Budget/forecast numbers are in BQ via `method_forecast` table; RevCogs model not connected | `knowledge/routes/forecast.md` |
| financial | Blocked — needs P&L ingestion | `knowledge/routes/financial.md` |
| balance-sheet | Blocked — needs Accountant's Sheets | `knowledge/routes/balance-sheet.md` |
| efficiency | Blocked — cross-family, needs P&L + headcount + revenue | `knowledge/routes/efficiency.md` |

## Key Terms

| Term | Meaning |
|------|---------|
| **SaaSAmount** | The aggregate revenue field in BQ. Includes all SaaS components. Use `SUM(SaaSAmount)` for total revenue — no filtering needed. |
| **EntityRecordID** | Stable numeric ID per billing entity. Use for **joining** across time periods (never changes). |
| **CompanyAccount** | Customer name. Use for **classification** level (matches Excel). But names change, so never join by this across periods. |
| **NRR** | Net Revenue Retention. (Start - Cancel - Downgrade + Expansion) / Start. |
| **GRR** | Gross Revenue Retention. (Start - Cancel - Downgrade) / Start. Always <= NRR. |
| **DEP** | Dedicated Enhancement Plan. Recurring monthly maintenance revenue. |
| **Trajectory** | Current month's actual prorated to full month. |
| **Pre-FX** | Revenue before foreign exchange conversion (all currencies at face value). |
| **Primitive metric** | Queries BQ directly (has a `view_name`). |
| **Derived metric** | Computed from other metrics via formula (has `depends_on` + `formula`). |

Read `knowledge/glossary.md` for the complete terminology reference.

## Knowledge Files

| File | What's In It | When To Read |
|------|-------------|--------------|
| `CLAUDE.md` | Project principles, architecture, deploy instructions | Always (loaded automatically) |
| `knowledge/schema.md` | BQ field reference for TransLineFlattened | Before writing SQL |
| `knowledge/account-mapping.md` | Paying entity whitelist + SQL pattern | Before counting paying logos or filtering entities |
| `knowledge/glossary.md` | Full terminology reference | When unfamiliar terms appear |
| `knowledge/metrics-catalog.md` | Business definitions for all 155 metrics, family assignments, dependencies | When looking up metric definitions |
| `knowledge/routes/revenue-retention.md` | How to solve retention metrics, verified results, anti-patterns | Before working on NRR/GRR/MRR/churn metrics |
| `knowledge/routes/marketing.md` | Marketing metric status and route | Before working on funnel metrics |
| `knowledge/routes/forecast.md` | Forecast metric status and blockers | Before working on budget/forecast metrics |
| `knowledge/verified-queries/*.sql` | 13 SQL files verified to exact-match against Excel | As reference SQL for retention queries |

## Skills Available

| Skill | When To Use |
|-------|------------|
| `/bq-query` | Writing BigQuery SQL. Loads schema rules, view reference, CTE patterns, anti-patterns. |
| `/metric-lookup` | Finding a metric ID, formula, dependencies, or which scorecard uses it. |
| `/metric-solver` | Verifying a metric against a source of truth (spreadsheet, dashboard, etc.). |
| `/onboard` | This skill. Orienting a new collaborator. |

## Collaborators

- **Nic** (nickperaltab) — funnel/marketing metrics, dashboard pages
- **Justin** (jporter-png) — revenue model, financial metrics, verification

## Common First Tasks

1. **"What does metric X measure?"** — Use `/metric-lookup` to find the metric ID, then check `knowledge/metrics-catalog.md` for the business definition.
2. **"Write a query for Y"** — Use `/bq-query` for the schema rules and CTE patterns, then check `knowledge/verified-queries/` for reference SQL.
3. **"Why doesn't this number match?"** — Use `/metric-solver` to systematically debug the gap.
4. **"Add a new metric to a scorecard"** — Check `/metric-lookup` for the metric ID, then edit the scorecard config in `builder/src/config/scorecards/`.
