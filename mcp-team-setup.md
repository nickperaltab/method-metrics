# Method Metrics MCP — Team Setup

Ask Claude Desktop (or claude.ai) anything about our business metrics. Live BigQuery data, pre-built scorecards, conversational answers. No SQL required.

## What it is

A connection between Claude and our internal metrics warehouse. You type questions in plain English; Claude pulls live numbers and explains them.

**Two kinds of answers:**
1. **Scorecards** — pre-built dashboards cached nightly. Fast. Currently only the **Marketing Scorecard** has live snapshot data; other scorecards exist as definitions but you'll get a "no snapshot yet" message until they're wired into the nightly refresh.
2. **Ad-hoc metric queries** — any verified (`live` status) metric, sliced by time period and dimension (channel, country, industry, etc.). Live from BigQuery. Ask Claude *"list metrics about X"* to see what's available — the catalog grows as we verify more.

## What it's good for

- "How's marketing looking this week?"
- "What were our trials last month by channel?"
- "Compare conversion rate by industry over the last 6 months."
- "What does the metric 'Sync Rate' actually measure?"

## What it's not for (yet)

- Writing or changing data — read-only.
- Customer-level detail — metrics are aggregated.
- Metrics not yet promoted to `live` status.

## Data freshness

- **Scorecards:** cached nightly around 5 AM ET. Claude tells you when the cache was last refreshed.
- **Ad-hoc queries:** live against BigQuery, but the underlying views themselves refresh nightly — so yesterday is the most recent accurate day.

---

## Setup (~2 min, self-service)

### 1. Get on the allowlist
Ping Nic with your Method email. Nic adds you (one row in a table).

### 2. Generate your token
Visit **https://nickperaltab.github.io/method-metrics/builder/#/mcp-token**

- You'll be signed in automatically via Google (same session as the Metrics Hub).
- Click **Generate my token**.
- A fresh `mcp_…` string appears. **Copy it now** — it isn't shown again.
- A pre-filled Claude Desktop config block is also shown with a copy button.

> Generating a new token revokes any previous one you had. If you switch machines, just mint a new one.

### 3. Add to Claude (pick one)

**Option A — Claude Desktop (recommended for most people)**

1. Quit Claude Desktop (⌘Q).
2. Open `~/Library/Application Support/Claude/claude_desktop_config.json` (create it with `{}` if missing).
3. Paste the config block from the page (or merge into existing `mcpServers`).
4. Save and reopen Claude Desktop.

**Option B — claude.ai custom connector (Enterprise web)**

1. claude.ai → Settings → Connectors → **Add custom connector**.
2. Name: `Method Metrics`
3. URL: `https://agkubdpgnpwudzpzcvhs.supabase.co/functions/v1/mcp-metrics`
4. Auth: Bearer token → paste your token from step 2.

### 4. Try it
> *"Use method-metrics to show me the Marketing Scorecard."*

If it works you'll get a summary with data age. If not, see Troubleshooting.

---

## What to ask Claude

Claude figures out which tool to call on its own, but these patterns work:

| Ask | What it'll do |
|---|---|
| "Show me [the Marketing/Sales/etc.] scorecard" | `get_dashboard` — cached, instant |
| "What were trials last [month/week]?" | `query_metric` |
| "[Metric] by channel" | `list_dimensions` + `query_metric` with breakdown |
| "What does [metric] measure?" | `get_metric` — pulls the definition |
| "List metrics about conversion" | `list_metrics` with search |

## Troubleshooting

**Page says "not allowlisted"** — Nic hasn't added your email yet; ping him with the exact email shown on the page.

**"method-metrics" doesn't appear in Claude after restart** — Fully quit (⌘Q). First launch downloads `mcp-remote` via npx; give it 30–60 seconds.

**401 unauthorized** — Token was revoked (minting a new token revokes old ones). Go back to the token page and mint again.

**"Tool execution failed"** — Ping Nic; the audit log captures what happened.

**Stale scorecard data (>30h)** — Nightly refresh cron probably failed. Ping Nic.

## Privacy & security

- Every call is logged (tool, args, latency, who called it) in `mcp_audit`.
- Tokens are hashed in the database — plaintext is never stored after you mint one.
- If you lose your token or leave the team, Nic removes you from the allowlist; the token stops working within minutes.
- Data flows Claude → our Supabase edge function → BigQuery/Supabase. No external third parties.

## Known gaps (v1)

- Only Marketing Scorecard has nightly snapshot caching. Others return "no snapshot yet" via `get_dashboard`. Use `list_metrics` + `query_metric` for ad-hoc questions in the meantime.
- `query_metric` is restricted to verified (`live`) metrics. If a metric you want comes back as queued, ping Nic to verify and promote it.
- No customer-list or entity-level drill-down — metrics are aggregated only.

---

## Slack announcement template

> 📊 **New: ask Claude about our metrics**
>
> I've wired up Claude Desktop / claude.ai to our metrics warehouse. Ask things like *"How are marketing trials trending?"* or *"Show me the Sales Scorecard"* and get live answers.
>
> To connect: DM me your Method email so I can allowlist you, then go to **https://nickperaltab.github.io/method-metrics/builder/#/mcp-token** and follow the steps on the page. ~2 minutes.
>
> Read-only. Data refreshes nightly.
