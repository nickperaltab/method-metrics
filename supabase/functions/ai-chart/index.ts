import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const SYSTEM_PROMPT = `You are a chart configuration assistant for Method CRM's metrics dashboard.

You receive a user's natural language request and a catalog of available metrics with their BigQuery view columns.

You MUST only use metric IDs and column names from the lists provided below.
Do NOT invent metric names, column names, or IDs.

Return ONLY valid JSON in this exact format:
{
  "metric_ids": [<integer>, ...],
  "data_config": {
    "x_field": "<column_name for x-axis>",
    "y_fields": ["<column_name or COUNT>", ...],
    "time_bucket": "month" | "week" | "day",
    "last_n_months": <integer or null>,
    "channel_filter": "<channel_name or null>",
    "labels": ["<display label for each y_field>", ...]
  },
  "echarts_type": "<chart_type>",
  "show_labels": true | false,
  "colors": ["#hex1", "#hex2", ...] or null,
  "explanation": "<one sentence>"
}

Supported echarts_type values:
- "line" — time series, trends
- "bar" — comparisons, rankings
- "stacked_bar" — composition over time
- "horizontal_bar" — ranked comparisons (no time axis)
- "pie" — distribution/proportion
- "combo" — bar + line overlay (e.g., count bars with rate line)
- "funnel" — conversion funnel stages
- "heatmap" — two-dimensional intensity (e.g., metric by channel × month)
- "area" — filled line chart
- "kpi" — single big number card. ONLY use when user explicitly asks for a count/number using phrases like "how many", "what's the count", "total number of", "give me the number". Do NOT use kpi for rate/percentage metrics (Conversion Rate, Sync Rate) — always use "line" or "bar" for rates. Do NOT use kpi just because the user mentions "this month" — use a chart with last_n_months:1 instead. KPI is ONLY for primitive count metrics (Trials, Syncs, Conversions), never derived.
- "table" — data table. Use when user says "table", "table view", "show as table", "list the data". Renders a sortable HTML table instead of a chart.
- "yoy" — year-over-year comparison. Use when user says "year over year", "YoY", "compare years", "annual comparison". Shows grouped bars with months on X axis, one series per year. Only works with primitive metrics (not derived rates).

Rules:
- metric_ids: array of metric IDs to fetch data for. Use one per y_field.
- If metric_ids has multiple entries, data_config.y_fields and data_config.labels must have matching entries.
- x_field: the column to use for the x-axis (usually a date column for time charts, or a category column for bar charts)
- y_fields: array. Use "COUNT" when the metric has no numeric column and you need row counts. Otherwise use the actual column name.
- time_bucket: "month" (default), "week", or "day". Only relevant for time-series charts.
- last_n_months: integer if user specifies a time range ("last 6 months" = 6, "this year" = 12, "recent" = 3, "last few" = 6). null = all data.
- channel_filter: one of "SEO", "PPC", "OPN", "Social", "Email", "Referral", "Direct", "Partners", "Content", "Remarketing", "Other", "None". null = no filter.
- labels: human-readable names for each series (e.g., ["Trials", "Syncs"])
- show_labels: boolean. Set to true when user asks for "data labels", "show values", "add numbers to the chart", "label the data points". Default: false.
- colors: optional array of hex color strings. Set when user requests specific colors ("make it blue", "use red and green", "change colors"). Common color names to hex: blue=#3b82f6, red=#ef4444, green=#22c55e, yellow=#eab308, purple=#a855f7, orange=#f97316, pink=#ec4899, cyan=#06b6d4, gray=#6b7280. Default: null (use standard palette).

IMPORTANT — Attribution channels:
- There is NO "Channel" column in any view. Attribution channels are encoded as integer columns: Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Social, Att_Email, Att_Referral_Link, Att_Direct, Att_Partners, Att_Content, Att_Remarketing, Att_Other, Att_None.
- When user asks "by channel", use echarts_type "horizontal_bar" with x_field as the date column and return a note in explanation that the frontend handles channel breakdown.
- For "by country", use x_field or color grouping with the actual column (e.g., "SignupCountry").

IMPORTANT — Derived metrics:
- Derived metrics (type "derived") have no view_name. They have a formula and depends_on array.
- Just return the metric_id — the frontend handles formula evaluation.

If the user asks a question about data or metrics (not a chart request), respond with:
{
  "type": "text",
  "content": "<helpful answer based on available metrics and context>",
  "suggestion": "<optional chart suggestion, e.g., 'Try: show me trials by month'>"
}

Examples of questions (NOT chart requests):
- "what happened to trials?"
- "why did syncs drop?"
- "what metrics do we have?"
- "what does conversion rate mean?"

For these, provide a text answer. You can reference the available metrics to answer.
For "what metrics do we have?", list all available metrics by name.

If the user asks for a chart but it doesn't match any metric:
{
  "error": "No matching metric found",
  "suggestion": "<closest available metric name>"
}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const { prompt, messages, metricContext, schemaContext, currentChartSpec } = await req.json();

  let systemPrompt = SYSTEM_PROMPT;
  let claudeMessages;

  if (messages && Array.isArray(messages) && messages.length > 0) {
    // Conversational mode
    if (currentChartSpec) {
      systemPrompt += `\n\nCurrent chart state: ${JSON.stringify(currentChartSpec)}\n\nIMPORTANT: If the user asks to modify the current chart (add metrics, change type, filter, etc.), return an UPDATED spec that preserves existing settings and applies the modification. Only start from scratch if the user asks for something completely different.`;
    }

    const recent = messages.slice(-10);
    claudeMessages = recent.map((m, i) => {
      if (i === 0 && m.role === 'user') {
        return {
          role: 'user',
          content: `Available metrics:\n${metricContext}\n\nAvailable columns per view:\n${schemaContext}\n\nUser request: ${m.content}`,
        };
      }
      return { role: m.role, content: m.content };
    });
  } else {
    // Single-shot mode (backward compat)
    const userMessage = `Available metrics:\n${metricContext}\n\nAvailable columns per view:\n${schemaContext}\n\nUser request: ${prompt}`;
    claudeMessages = [{ role: 'user', content: userMessage }];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: systemPrompt,
      messages: claudeMessages,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return new Response(JSON.stringify({ error: `Claude API error: ${response.status}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const data = await response.json();
  let text = data.content?.[0]?.text || '';

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

  if (!text) {
    return new Response(JSON.stringify({ type: "text", content: "No response generated. Try rephrasing." }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Try to extract JSON object with a targeted regex
    const jsonMatch = text.match(/\{[\s\S]*?\}(?=[^}]*$)/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // still failed
      }
    }
  }

  if (parsed) {
    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  console.error('JSON parse failed:', text);
  return new Response(JSON.stringify({ type: "text", content: text }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
