# Revenue Operations Intelligence

**Owner:** Nic Peralta (RevOps Manager)
**Last updated:** April 2026
**Status:** Draft

---

## Overview

My role is to give Method's teams the operational infrastructure to make faster, better decisions — starting with trusted data. The metric registry is the first building block: a system where every number has a clear definition, a documented quality level, and a verification status. But this foundation also enables what comes next — automated workflows, AI-powered tools, and self-serve access that removes bottlenecks across the org.

Today, data requests flow through one person, definitions live in people's heads, and the quality of any given number is unknown. This changes that. Tomorrow, every metric has a documented definition, a confidence level, and a verification status — and anyone can access them.

---

## The Problem (Now)

Today, metrics live in different spreadsheets, Looker dashboards, or someone's head. There's no formal approval process for how a metric gets defined — someone creates a number, decisions get made on it, and those decisions get doubted because nobody really agreed on the definition in the first place. But there's no official alternative, so the cycle continues.

Looker was meant to be the solution but it's difficult to use, restrictive in the wrong ways, and finding what a metric actually means requires drilling three layers deep into SQL connections. We can't control what Looker adds or removes, and iterating on dashboards is slow. Every new report or dashboard change funnels through a single person, creating a bottleneck that doesn't scale.

**Metric quality varies wildly, but everything looks equally trustworthy.** The healthscore is overcomplicated and biased negatively — it needs rework. "Annual sales" is actually last month's invoices (not even necessarily paid) multiplied by 12. But in a dashboard, these look just as confident as metrics that have been cell-for-cell verified against the source of truth. There's no way to know what you can trust.

Meanwhile, the team is getting more access to Claude and BigQuery. That's good — but without verified definitions, people get confident wrong answers. Marketing has already started querying BQ directly without guardrails.

The result: bad metrics lead to bad decisions, and a lack of trust in the numbers erodes confidence across the org.

**What we've heard:**

- **Michelle:** "Labels are confusing" in Looker
- **Nelson:** "I just need an automated export — all I do is copy and paste" (needs it for board reporting)
- **Sarah:** Wants more dashboards, has been waiting
- **Marketing:** Generating reports manually, now accessing BQ to run their own analysis without verified definitions
- **Everyone:** Retention is the company's #1 priority, and we can't answer "why are people churning" because the data to answer that question (activities, transcripts, healthscore, usage) is scattered across the CRM and not in BQ

---

## What Changes (Tomorrow)

We've built a metric registry and semantic layer that directly addresses each of these problems.

**Every metric is defined, QA'd, and auditable.** Each metric in the registry has a clear definition, has been verified against our Excel source of truth (cell-for-cell match), and anyone can inspect both the plain-English description and the SQL behind it. 155 metrics are cataloged across 6 families: Revenue, Retention, P&L, Forecast, Marketing, and Efficiency.

**Every metric has a documented quality level.** This is the thing no BI tool does. Every metric in the registry carries a verification level and a freshness contract — so you know not just what the number is, but how much you should trust it and how current it is.

| Level | What it means | Available via skill? | Example |
|---|---|---|---|
| **Verified** | Cell-for-cell match against source of truth. Fully vetted. | Yes | MRR, Net Revenue Retention |
| **Defined** | Clear definition and SQL, not yet verified against source of truth. Usable with awareness. | Yes, with caveat | Trial conversion rate |
| **Draft** | Rough definition, needs work. Not ready for consumption. | No — refused by the system | Healthscore (overcomplicated, biased negatively) |
| **Queued** | Not yet defined. On the list. | No | Marketing attribution metrics |

Each metric also carries freshness metadata: how often it updates and when it last ran. A metric can be cell-for-cell verified and still misleading if the underlying data is stale. This prevents that.

**We own the code — and iterate at the speed of AI.** No Looker dependency. We control the entire stack (Supabase free tier + BigQuery we already pay for + GitHub Pages). New dashboards go from description to deployed in minutes, not days.

**Definitions are in plain English.** No more drilling through SQL. Every metric's logic is readable by anyone on the team — business definitions, not black boxes.

**Anyone can explore — just ask.** Shared Claude skills give every team member access to verified metrics through natural language. Ask "what's our churn rate definition?" or "pull trials by channel for Q1" and get answers from the registry. The skill only serves Defined and above — Draft and Queued metrics are refused entirely. No invented definitions. No arbitrary SQL.

**If you can build with it, you can trust it.** Only verified, approved metrics are available in the system. No more doubtful numbers. If it's queryable, it's been checked.

---

## The System

### 1. Metric Registry (Foundation)

The source of truth for every metric at Method. Each metric record includes:

- Name and plain-English definition
- Formula / SQL — inspectable by anyone
- Owner — who is responsible for this metric's accuracy
- Verification level — Verified, Defined, Draft, or Queued
- Freshness contract — how often it updates, when it last ran
- Dependencies — what other metrics or data sources it depends on
- Quality notes — known limitations, caveats (e.g., "Annual sales = last month's invoices × 12. Invoices may not yet be paid.")

### 2. Shared Claude Skills (Access Layer)

The registry is only useful if people can access it. Shared Claude skills give every team member access to verified definitions through natural language — without needing BQ access, Looker, or Nic.

**Guardrails:** The skill only serves metrics at Defined level or above. Draft and Queued metrics are refused entirely. This prevents half-baked numbers from ending up in board decks with a disclaimer nobody reads.

**Demand signal loop:** Every question asked through the skill is a signal. If someone asks "what's our churn by channel" and that metric doesn't exist yet, that's a real-time feature request. This passively tells us what to define next — no intake form needed. These signals get reviewed weekly to inform what metrics to prioritize.

### 3. Hardcoded Dashboards (Nic's Build Tool)

Replaces Looker as the platform Nic builds on. Same concept as Looker dashboards, but built in code, deployed to GitHub Pages, and fully under our control. This is a velocity tool for Nic — the audience for the dashboards is still leadership and stakeholders, but delivery is 10x faster.

### 4. AI Chart Builder (Self-Serve — Alpha)

Natural language → live chart, backed by verified metrics only. Supports 14 chart types, YoY comparisons, filters, conditional formatting. Flexible in what you can build, restricted in what it can access — can't write SQL from scratch or invent definitions.

**Current status:** Alpha. It works, but we don't have confirmed demand for self-serve charting yet. Rather than putting a user-facing rollout on the roadmap now, we'll wait for demand signals from the skill. If people start asking "can I make a chart of this?" — that's the evidence that self-serve matters and we open it up.

---

## Data Coverage

### In BigQuery Today

| Family | Metrics | Status |
|---|---|---|
| Revenue / MRR | ~24 BQ views (primitives, breakdowns, derived rates) | 13 verified, more in progress |
| Retention | Churn, expansion, contraction | Partially verified |
| Funnel / Trials | Trials, syncs, conversions | Defined |

49 additional metrics are derivable from existing BQ data but haven't been defined yet.

### Not in BigQuery Yet (Blocked on Ingestion)

| Data Source | What lives there | Why it matters | Priority |
|---|---|---|---|
| **Internal CRM** | Activities, transcripts, healthscore data | Needed to answer "why are people churning" — retention is the #1 company priority | High |
| **Marketing platforms (lifecycle)** | Lifecycle marketing, attribution to retention | Feeds the retention story — which channels produce customers that stay? | High |
| **Marketing platforms (analytics)** | Ad spend, web analytics, demo bookings, free hour bookings | Marketing is generating reports manually today | Medium |
| **Billing / Invoicing** | Payment status, actual revenue vs. invoiced | Needed for accurate revenue metrics | Medium |
| **Product usage** | Feature adoption, login frequency | Needed for healthscore improvement, retention signals | Medium |

102 metrics are pending data ingestion before they can be defined.

---

## Where We Are

| Milestone | Status |
|---|---|
| 155 metrics cataloged across 6 families | Done |
| 13 verified queries (cell-for-cell match vs. Excel) | Done |
| 7 metrics semantic-layer approved and live | Done |
| AI chart builder (14 chart types, YoY, filters) | Alpha |
| Metric approval walkthrough with stakeholders | In Progress |

---

## Roadmap

### Now — In Progress

**Goal: Get verified metrics into the hands of people already using data, and start closing the retention data gap.**

| Initiative | Who it's for | Why now |
|---|---|---|
| Metric registry + shared Claude skills | Everyone who touches data | Foundation. Marketing is in BQ without guardrails. Michelle needs clear labels. This gives everyone a verified, safe path to data. |
| Nelson's board export | Nelson | Board reporting on unverified metrics is high risk. Quick win. |
| Freshness metadata on every metric | Everyone | Small addition, big credibility lift. Ship before the skill is widely used. |
| Begin retention data scoping (CRM activities, transcripts) | Nic, leadership | Retention is the #1 priority. We can't answer "why are people churning" without this data. Scoping now, ingestion next. |
| Continue metric verification | Nic, Justin | Ongoing — 13 of 155 verified. |

### Next — 1-2 Months

**Goal: Expand to revenue metrics, give Sarah what she's been asking for, and start ingesting retention-critical data.**

| Initiative | Who it's for | Why next |
|---|---|---|
| Revenue metrics via shared Claude skill | Sarah, leadership | Revenue is the most verified family. Sarah is the most vocal requester. |
| Dashboards for Sarah | Sarah | She's been waiting. Nic builds these 10x faster now. |
| CRM data ingestion (activities, transcripts) | Whole org | Unlocks the ability to answer "why are people churning" — the question leadership is actually asking. |
| Lifecycle marketing metrics | Marketing | Feeds the retention story — which channels produce customers that stay? |
| Demand signal review | Nic (planning input) | What are people asking the skill that we don't have? First formal review of the passive intake loop. |

### Later — 3-6 Months

**Goal: Let demand tell us what's next.**

| Initiative | Who it's for | Why later |
|---|---|---|
| Marketing analytics (ad spend, web traffic, demos) | Marketing | Important but not retention-critical. Sequenced after lifecycle metrics. |
| Healthscore rework | PS, leadership | Overcomplicated and biased. Needs redesign, not just documentation. Will revisit once retention data is in BQ. |
| Rebuild Looker scorecard on new platform | Leadership | End state, not starting point. Every metric will be verified through real usage by then. |
| AI chart builder broader rollout | TBD | Only if demand signals from the skill confirm people want self-serve. |
| Expand metric coverage (102 metrics pending data) | Whole org | Sequenced by demand — what people ask for through the skill. |

### Explicitly NOT Doing Right Now

- **Rebuilding the Looker scorecard first.** It exists and works. The rebuild is easier once metrics are battle-tested through real usage.
- **Shipping the AI chart builder broadly.** No confirmed demand. We'll wait for pull from skill usage signals.
- **Ingesting data sources speculatively.** We add data when people need it, informed by what they ask through the skill.
- **Serving Draft metrics through the skill.** If it's not at least Defined, the system refuses it. No disclaimers on half-baked numbers.

---

## Success Metrics

### Leading Indicators (Weeks 1-4)

| Metric | Target | How to measure |
|---|---|---|
| Team members using the skill unprompted (not onboarded by Nic) | 5+ in week 4 | Posthog / skill usage analytics |
| Questions asked through the skill per week | 20+ per week by end of month 1 | Skill query logs |
| Metrics at Defined or higher | 50 of 155 within 2 months | Supabase registry |
| Nelson's board export automated | Delivered | Ship it or not |
| Dashboards delivered to Sarah | 3+ within first month of Next phase | Ship count |

### Lagging Indicators (Months 2-6)

| Metric | Target | How to measure |
|---|---|---|
| Reduction in ad-hoc data requests to Nic | 50% reduction within 3 months | Track inbound requests (need to baseline this) |
| Marketing queries reference verified definitions | 100% of marketing BQ queries use registry definitions within 2 months of skill launch | BQ audit logs |
| Demand signals acted on | First metric defined from a skill query signal within 6 weeks | Skill query logs → registry |
| Metrics fully verified | 30+ within 3 months | Supabase registry |
| Time from dashboard request to delivery | Under 1 day for registry-backed dashboards | Track delivery time |

### How We'll Know Self-Serve Matters

| Signal | What it tells us |
|---|---|
| People ask the skill "can I make a chart of this?" | There's pull for the builder — open limited access |
| People use the skill but never ask for charts | Skills are sufficient, builder stays on the shelf |
| People ask for metrics we don't have | Demand signal for what to define/ingest next |
| Nobody uses the skill after 1 month | Bigger problem — the access layer isn't the bottleneck |

---

## Build vs. Buy

We're currently on Looker's free/cheap tier. The new Looker pricing is significantly more expensive. This system eliminates the need to upgrade.

| Tool | Annual Cost | Source |
|---|---|---|
| Looker (new pricing) | $50K – $150K+ / yr | holistics.io, mammoth.io |
| Tableau | $15K – $30K+ / yr | tableau.com |
| Sigma Computing | $17K – $130K+ / yr | vendr.com, qrvey.com |
| **This system** | **~$0 incremental** | Supabase free tier, BQ (already paying), GitHub Pages |

---

## Open Questions

| Question | Who answers | Blocking? |
|---|---|---|
| What does "shipped" mean — people using verified metrics through skills, or the Looker scorecard rebuilt? | Justin, leadership | Yes — defines the MVP |
| How hard is CRM data ingestion (activities, transcripts)? Weeks or months? Do we need engineering help? | Nic, engineering | Yes — determines whether retention data is a Now or Next item |
| What are the real pain points beyond Michelle/Nelson/Sarah? | Broader team (discovered through skill demand signals) | No |
| Do people want self-serve charting or just faster delivery from Nic? | Skill demand signals will tell us | No — testing later |

---

*This is a living document. It changes as we learn from real usage.*
*Questions or feedback → Nic Peralta*
