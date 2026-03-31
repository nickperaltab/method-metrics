# Method Metrics

Shared metric tracker and BI dashboard for Method CRM. Tracks 242+ business metrics across revenue, marketing, financial, and operational families.

## What's here

- **Unified React app** (`builder/`) — AI-powered chart builder, dashboards, metric registry, and dimensions management. Deployed to Vercel.
- **Metric tracker** (`tracker.html`) — Legacy metric registry (being replaced by the React app). Deployed to GitHub Pages.
- **Knowledge base** (`knowledge/`) — Schema docs, metric definitions, route files, and verified SQL queries accumulated from solving metrics.
- **Supabase migrations** (`supabase/`) — Database schema for the metric catalog, dashboards, charts, users, and dimensions.

## Architecture

- **BigQuery** — Source of truth for metric SQL. ~24 views in the `revenue` dataset.
- **Supabase** — Metric registry/catalog, dashboard storage, user management, approved dimensions.
- **Claude Haiku** — AI chart builder. Takes natural language prompts and returns chart configurations. Does not write SQL.
- **ECharts** — Chart rendering in the browser.

## Getting started

```bash
# Run the chart builder locally
cd builder && npm install && npm run dev

# Run Playwright tests
npm test
```

## Docs

- [`CLAUDE.md`](CLAUDE.md) — Technical reference for AI sessions and contributors
- [`docs/ai-chart-builder-architecture.md`](docs/ai-chart-builder-architecture.md) — Detailed chart builder architecture
- [`docs/baseline-qa.md`](docs/baseline-qa.md) — QA baseline: what works, what's broken, test coverage
- [`knowledge/`](knowledge/) — Schema, glossary, routes, and verified queries
