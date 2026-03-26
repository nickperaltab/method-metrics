# AI Chart Builder — How It Works

## The Big Picture

The chart builder has 4 moving parts. Each one does exactly one job:

| System | What it stores | Role |
|--------|---------------|------|
| **Supabase** | Metric definitions (names, formulas, which BQ view to query) | The "menu" the AI reads from |
| **AI (Claude)** | Nothing — stateless | Reads the menu + your prompt, picks the right metric and chart type |
| **BigQuery** | All the actual data (signups, syncs, revenue, etc.) | Answers SQL queries with real numbers |
| **Browser** | Nothing persistent | Builds the SQL, runs it, draws the chart |

```mermaid
flowchart LR
    subgraph Supabase
        M[metrics table]
    end

    subgraph AI["AI (Claude)"]
        LLM["Reads metric menu\n+ user prompt\n→ Returns JSON config"]
    end

    subgraph BQ[BigQuery]
        V["47 SQL views\n(v_trials, v_syncs, etc.)"]
    end

    subgraph Browser
        JS[Frontend JS]
        Chart[ECharts renderer]
    end

    M -->|"Metric catalog\n(on page load)"| JS
    JS -->|"Prompt + catalog"| LLM
    LLM -->|"JSON config\n(metric_id, chart_type)"| JS
    JS -->|"SQL query\n(built from config)"| V
    V -->|"Row data"| JS
    JS -->|"Formatted data"| Chart
```

## The Full Flow: Prompt to Chart

Here's exactly what happens when someone types **"show me trials by month"**:

```mermaid
sequenceDiagram
    participant User
    participant Browser as Browser (React App)
    participant Supabase
    participant AI as AI (Claude Haiku)
    participant BQ as BigQuery

    Note over Browser,Supabase: Page Load
    Browser->>Supabase: Fetch all metric definitions
    Supabase-->>Browser: 242 metrics (name, type, view, formula)
    Browser->>BQ: Fetch column schemas (INFORMATION_SCHEMA)
    BQ-->>Browser: Column names + types for each view

    Note over User,BQ: User Asks a Question
    User->>Browser: "show me trials by month"
    Browser->>Browser: Build AI prompt with metric catalog + schemas
    Browser->>AI: Send prompt + context
    AI-->>Browser: JSON config: metric_id=1, chart=bar, bucket=month

    Note over Browser,BQ: Data Fetch
    Browser->>Browser: Build SQL from AI config
    Note right of Browser: SELECT FORMAT_DATE('%Y-%m', SignupDate)<br/>AS period, COUNT(*) AS value<br/>FROM v_trials GROUP BY 1
    Browser->>BQ: Run SQL query (via OAuth)
    BQ-->>Browser: [{period: "2026-01", value: 80}, ...]

    Note over Browser: Render
    Browser->>Browser: Draw chart with ECharts
    Browser->>User: Interactive bar chart appears
```

## Key Concept: The AI Does NOT Touch Data

This is the most important thing to understand:

```mermaid
flowchart TB
    subgraph "What the AI does"
        A1["Reads a menu of 242 metrics"]
        A2["Picks which metric matches your question"]
        A3["Returns a JSON config"]
    end

    subgraph "What the AI does NOT do"
        B1["Does NOT write SQL"]
        B2["Does NOT query BigQuery"]
        B3["Does NOT see any actual data"]
    end

    style B1 fill:#ff6b6b,color:#fff
    style B2 fill:#ff6b6b,color:#fff
    style B3 fill:#ff6b6b,color:#fff
    style A1 fill:#51cf66,color:#fff
    style A2 fill:#51cf66,color:#fff
    style A3 fill:#51cf66,color:#fff
```

**The AI is a router.** It reads the question, looks at the metric catalog, and says: *"You want metric #1 (Trials), grouped by month, as a bar chart."* Then the browser's JavaScript builds the actual SQL query and runs it against BigQuery.

## How the AI's "Menu" Works

The `metrics` table in Supabase looks like this:

| id | name | metric_type | view_name | formula | depends_on |
|----|------|-------------|-----------|---------|------------|
| 1 | Trials | primitive | v_trials | — | — |
| 2 | Syncs | primitive | v_syncs | — | — |
| 5 | Sync Rate | derived | — | SAFE_DIVIDE({2},{1}) | [2, 1] |
| 10 | MRR | foundational | v_mrr | — | — |

Before calling the AI, the app formats this into plain text:

```
- id:1  name:"Trials"     type:primitive  view:v_trials
- id:2  name:"Syncs"      type:primitive  view:v_syncs
- id:5  name:"Sync Rate"  type:derived    formula:SAFE_DIVIDE({2},{1})  depends:[2,1]
- id:10 name:"MRR"        type:foundational  view:v_mrr
```

This text gets stuffed into the AI's prompt alongside the user's question. That's how the AI knows what metrics exist.

## What the AI Returns

The AI returns a small JSON object — a "chart spec." Example:

```json
{
  "metric_ids": [1],
  "data_config": {
    "x_field": "SignupDate",
    "y_fields": ["COUNT"],
    "time_bucket": "month",
    "channel_filter": null,
    "labels": ["Trials"]
  },
  "echarts_type": "bar",
  "explanation": "Monthly count of new trials"
}
```

This says: *Use metric #1 (Trials). Count the rows. Group by month. Draw a bar chart.*

The frontend JavaScript then translates this into an actual SQL query:

```sql
SELECT FORMAT_DATE('%Y-%m', SignupDate) AS period,
       COUNT(*) AS value
FROM `project-for-method-dw.revenue.v_trials`
GROUP BY 1
ORDER BY 1
```

## How Derived Metrics Work (e.g., Sync Rate)

Some metrics aren't stored in BigQuery — they're calculated from other metrics. "Sync Rate" = Syncs / Trials.

```mermaid
flowchart TB
    User["User asks: 'show me sync rate by month'"]
    AI["AI returns: metric_id=5 (Sync Rate)"]
    Check{"Does this metric\nhave a formula?"}

    subgraph "Derived Metric Path"
        Dep1["Fetch Trials data from BQ\n(dependency #1)"]
        Dep2["Fetch Syncs data from BQ\n(dependency #2)"]
        Calc["For each month:\nSAFE_DIVIDE(syncs, trials)\n\nJan: 45/80 = 56.2%\nFeb: 52/92 = 56.5%"]
    end

    subgraph "Normal Metric Path"
        Direct["Fetch data directly from BQ view"]
    end

    User --> AI --> Check
    Check -->|"Yes (has formula)"| Dep1
    Check -->|"No (has view_name)"| Direct
    Dep1 --> Calc
    Dep2 --> Calc
    Calc --> Chart[Draw chart with computed values]
    Direct --> Chart
```

The formula `SAFE_DIVIDE({2},{1})` means "divide metric #2 by metric #1." The `{2}` and `{1}` are replaced with the actual values fetched from BigQuery.

This computation happens **in the browser**, not in BigQuery. The formulas are stored in the Supabase `metrics` table.

## Filtering and Grouping (Dimensions)

There are two ways to slice data beyond just "metric over time":

### Channel Filtering — "show me SEO trials by month"

This is **fully built.** Each row in BigQuery has attribution columns like `Att_SEO`, `Att_Pay_Per_Click`, `Att_Organic`, etc. When the AI detects a channel in the prompt, it returns `channel_filter: "SEO"`. The frontend maps that to the right column and adds a `WHERE Att_SEO > 0` clause to the SQL query.

```mermaid
flowchart LR
    User["'show me SEO trials'"]
    AI["AI returns:\nchannel_filter: 'SEO'"]
    Map["Frontend maps:\nSEO → Att_SEO column"]
    SQL["SQL adds:\nWHERE Att_SEO > 0"]
    BQ["BigQuery returns\nonly SEO-attributed rows"]
    Chart["Chart shows\nSEO trials only"]

    User --> AI --> Map --> SQL --> BQ --> Chart
```

The mapping between channel names and BigQuery columns lives in `ATT_COL_MAP` (in `chartUtils.js`):

| Channel name | BigQuery column |
|-------------|----------------|
| SEO | Att_SEO |
| PPC | Att_Pay_Per_Click |
| Organic | Att_Organic |
| Direct | Att_Direct |
| Referral | Att_Referral |
| Partner | Att_Partner |

### Group-By Dimensions — "show me trials by channel"

This is **not built yet** in the new AI builder (but works in the old `charts.html`).

The difference from filtering: filtering says "only show SEO." Grouping says "show all channels side by side." That requires a different chart type (grouped bar or horizontal bar) and pivoting the data into multiple series.

```mermaid
flowchart TB
    subgraph today["What Works Today"]
        F1["'show me SEO trials by month'"]
        F2["Filters to one channel\n→ single line chart"]
    end

    subgraph planned["What's Being Built"]
        G1["'show me trials by channel'"]
        G2["Groups all channels\n→ horizontal bar chart"]
        G3["'show me trials by channel over time'"]
        G4["Groups all channels × months\n→ grouped bar chart"]
    end

    style today fill:#d4edda
    style planned fill:#fff3cd
```

**What needs to happen:**
1. AI needs to return a `group_by_field` in its config (e.g., `"channel"` or `"country"`)
2. The SQL query needs a `GROUP BY` on that dimension
3. The chart renderer needs to pivot data into one series per group value
4. Each group gets its own color and a legend appears

This is **P0 item #3** in the feature parity plan.

## What Happens When Data Changes?

```mermaid
flowchart TB
    subgraph auto["Updates Automatically"]
        C1["Change a BQ view definition\n(e.g., redefine what counts as a Trial)"]
        C2["Change a metric formula in Supabase\n(e.g., multiply Sync Rate by 100)"]
        C3["Add a new metric to Supabase"]
    end

    subgraph manual["Requires Manual Action"]
        C4["Saved dashboard charts\nshow stale/old data"]
        Fix["Must re-create and re-save\nthe chart to update"]
    end

    C1 -->|"Next chart load"| OK1[New definition used]
    C2 -->|"Next page reload"| OK2[New formula used]
    C3 -->|"Next page reload"| OK3[AI sees new metric]
    C4 --> Fix

    style auto fill:#d4edda
    style manual fill:#fff3cd
```

**No deploy needed** for metric or view changes. Both Supabase and BigQuery are queried live at runtime. The only exception is saved dashboards — those store a snapshot of the data at save time and don't refresh.

## System Map

```mermaid
flowchart TB
    subgraph "Supabase (Metric Registry)"
        MT["metrics table\n242 rows"]
        SC["saved_charts table"]
        EF["ai-chart Edge Function\n(calls Claude API)"]
    end

    subgraph "BigQuery (Data Warehouse)"
        P["Primitive views\nv_trials, v_syncs, v_mrr..."]
        B["Breakdown views\nv_trials_by_channel..."]
        D["Derived views\nv_sync_rate..."]
        P --> B
        P --> D
    end

    subgraph "Vercel (Chart Builder App)"
        AI["ai.js\n(builds prompt, calls Edge Function)"]
        BQjs["bigquery.js\n(builds SQL, queries BQ)"]
        Exp["Explorer.jsx\n(orchestrates everything)"]
        CR["ChartRenderer.jsx\n(ECharts)"]

        Exp --> AI
        AI --> EF
        Exp --> BQjs
        BQjs --> P
        BQjs --> B
        Exp --> CR
    end

    subgraph "GitHub Pages (Tracker)"
        TR["tracker.html\n(metric table editor)"]
    end

    MT --> AI
    MT --> TR
    Exp --> SC
```

## Glossary

| Term | What it means |
|------|--------------|
| **Primitive metric** | A metric that comes directly from a BigQuery view (e.g., Trials = count of rows in `v_trials`) |
| **Derived metric** | A metric calculated from other metrics using a formula (e.g., Sync Rate = Syncs / Trials) |
| **BQ view** | A saved SQL query in BigQuery that acts like a virtual table. Change the query, all charts using it update automatically. |
| **Supabase** | A hosted database (like a spreadsheet in the cloud) that stores our metric definitions — names, formulas, which BQ view to use |
| **Edge Function** | A small program that runs on Supabase's servers. Ours calls the AI (Claude) and returns the result. |
| **ECharts** | The JavaScript library that draws interactive charts in the browser |
| **Chart spec** | The JSON object the AI returns — describes what to chart but doesn't contain any data |
| **OAuth** | The "Sign in with Google" flow that lets the browser query BigQuery directly using your Google account |
