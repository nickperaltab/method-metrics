# AI Chart Builder — How It Works

## What Is This?

An internal tool where you type a question in plain English — like "show me trials by month" — and get an interactive chart back instantly. No SQL, no Looker, no asking someone to pull data.

## How It Works (30-Second Version)

```mermaid
flowchart LR
    You["You type:\n'show me trials by month'"]
    AI["AI picks the\nright metric\nand chart type"]
    Data["BigQuery\nruns the query"]
    Chart["Chart\nappears"]

    You --> AI --> Data --> Chart
```

1. **You ask a question** in the chart builder
2. **The AI figures out what you mean** — it picks the right metric (e.g., "Trials"), the right time range, and the right chart type
3. **BigQuery pulls the actual numbers** from our data warehouse
4. **The chart renders** in your browser

**The AI never sees your data.** It just reads a menu of available metrics and picks the right one. Think of it like a waiter — it takes your order and sends it to the kitchen, but it doesn't cook the food.

## Where Do Metrics Come From?

We maintain a registry of ~242 metrics in a database called Supabase. Each metric has:

- A **name** (e.g., "Trials", "Syncs", "MRR")
- A **data source** pointing to a BigQuery table
- Optionally, a **formula** (e.g., Sync Rate = Syncs / Trials)

When you open the chart builder, the AI loads this registry so it knows what's available. **If we add a new metric to the registry, the AI can immediately use it** — no code changes needed.

## Two Types of Metrics

```mermaid
flowchart TB
    subgraph direct["Direct Metrics"]
        D1["Trials, Syncs, MRR, etc."]
        D2["Pulled straight from BigQuery"]
    end

    subgraph calculated["Calculated Metrics"]
        C1["Sync Rate, Conversion Rate, etc."]
        C2["Computed from other metrics\nusing a formula"]
    end

    style direct fill:#d4edda
    style calculated fill:#e8daef
```

- **Direct metrics** — the number lives in BigQuery. We just query it.
- **Calculated metrics** — there's no single table for "Sync Rate." Instead, we pull Syncs and Trials separately, then divide. The formula is stored in the metric registry.

## Filtering vs. Grouping

```mermaid
flowchart TB
    subgraph works["Works Today"]
        F["'Show me SEO trials by month'"]
        FR["Filters to just SEO → one line on the chart"]
    end

    subgraph coming["Coming Soon"]
        G1["'Show me trials by channel'"]
        GR1["All channels side by side → bar chart"]
        G2["'Show me trials by channel over time'"]
        GR2["Channels × months → grouped bars"]
    end

    style works fill:#d4edda
    style coming fill:#fff3cd
```

**Filtering** = "only show me one slice" (e.g., just SEO). Works today.

**Grouping** = "break it down by all slices" (e.g., SEO vs PPC vs Direct side by side). Being built now.

## What Updates Automatically?

| Change | Auto-updates? |
|--------|:---:|
| Someone changes how "Trials" is defined in BigQuery | Yes — next chart load |
| Someone changes a formula in the metric registry | Yes — next page refresh |
| Someone adds a new metric to the registry | Yes — AI sees it immediately |
| Saved dashboard charts when underlying data changes | No — must re-save (known gap, fix planned) |

No deploys needed for metric or definition changes. Everything is pulled live.

## System Overview

```mermaid
flowchart TB
    subgraph registry["Metric Registry (Supabase)"]
        M["242 metric definitions\nnames, formulas, data sources"]
    end

    subgraph ai["AI Layer (Claude)"]
        LLM["Interprets your question\nPicks metric + chart type"]
    end

    subgraph warehouse["Data Warehouse (BigQuery)"]
        BQ["47 data views\nTrials, Syncs, MRR, etc."]
    end

    subgraph app["Chart Builder (Vercel)"]
        UI["Web app\nYou interact with this"]
    end

    M -->|"AI reads the\nmetric menu"| LLM
    LLM -->|"AI's answer goes\nback to the app"| UI
    UI -->|"App queries\nthe data"| BQ
    BQ -->|"Numbers come back"| UI
```

**Four systems, one job each:**

| System | Job |
|--------|-----|
| **Supabase** | Stores the list of metrics and their definitions |
| **AI (Claude)** | Understands your question and picks the right metric |
| **BigQuery** | Holds all the actual data and answers queries |
| **Vercel** | The web app you see and interact with |
