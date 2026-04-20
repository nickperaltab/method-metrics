# Method Metrics — Progress Update

**Status: Yellow (In Progress)**
**April 2026 · Nic Peralta**

---

**TL;DR:** We're building a centralized metric registry that replaces scattered spreadsheets and Looker dependencies with a single, auditable source of truth — plus an AI-powered chart builder that lets anyone on the team explore data without waiting on a report request. The foundation is built; we're now in the verification and rollout phase.

---

## The Problem (Now)

Today, metrics live in different spreadsheets, Looker dashboards, or someone's head. There's no formal approval process for how a metric gets defined — someone creates a number, decisions get made on it, and those decisions get doubted because nobody really agreed on the definition in the first place. But there's no official alternative, so the cycle continues.

Looker compounds this. It's difficult to use, restrictive in the wrong ways, and finding what a metric actually means requires drilling three layers deep into SQL connections. We can't control what Looker adds or removes, and iterating on dashboards is slow. Every new report or dashboard change funnels through a single person, creating a bottleneck that doesn't scale.

The result: bad metrics lead to bad decisions, and a lack of trust in the numbers erodes confidence across the org.

## What Changes (Tomorrow)

We've built a metric registry and semantic layer that directly addresses each of these problems:

**Every metric is defined, QA'd, and auditable.** Each metric in the registry has a clear definition, has been verified against our Excel source of truth (cell-for-cell match), and anyone can inspect both the plain-English description and the SQL behind it. 155 metrics are cataloged across 6 families: Revenue, Retention, P&L, Forecast, Marketing, and Efficiency.

**We own the code — and iterate at the speed of AI.** No Looker dependency. We control the entire stack (Supabase free tier + BigQuery we already pay for + GitHub Pages). New dashboards go from description to deployed in minutes, not days.

**Definitions are in plain English.** No more drilling through SQL. Every metric's logic is readable by anyone on the team — business definitions, not black boxes.

**Anyone can build — just ask.** The AI chart builder lets the whole team create charts and explore data — but only from verified metrics. Flexible in what you can build, restricted in what it can access. It can't write SQL from scratch or invent definitions.

**If you can build with it, you can trust it.** Only verified, approved metrics are available in the system. No more doubtful numbers. If it's queryable, it's been checked.

## What This Unlocks

Speed, quality, and trust. Specifically: the metric registry becomes the knowledge layer that any future tool — AI agents, Slack bots, email reports, client-facing dashboards — can pull from. One verified source powering everything.

## Where We Are

| Milestone | Status |
|---|---|
| 155 metrics cataloged across 6 families | Done |
| 13 verified queries (cell-for-cell match vs. Excel) | Done |
| 7 metrics semantic-layer approved and live | Done |
| AI chart builder (14 chart types, YoY, filters) | Alpha |
| Metric approval walkthrough with stakeholders | In Progress |
| Rebuild critical Looker dashboards on new platform | Up Next |
| Release chart builder to leadership | Up Next |
| Expand coverage (49 derivable now, 102 pending ingestion) | Pending |

## Build vs. Buy Context

This replaces tooling that would cost $50K–$150K+/year off the shelf (Looker averages ~$150K/yr, Tableau runs $15K–$30K+ for a small team, Sigma Computing $17K–$130K+). Our incremental cost is ~$0 — Supabase free tier, BigQuery we already pay for, GitHub Pages.

---

*Work in progress. Questions or feedback → Nic Peralta*
