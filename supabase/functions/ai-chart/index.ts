import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const EDGE_FUNCTION_VERSION = '33';

const VALID_CHART_TYPES = new Set([
  'line','bar','stacked_bar','horizontal_bar','pie','combo','funnel',
  'heatmap','area','kpi','table','yoy','variance','drill_table',
]);
const VALID_TIME_BUCKETS = new Set(['month','week','day']);
const VALID_OPERATORS = new Set(['<','<=','>','>=','==','!=']);

function validateChartSpec(spec: Record<string, unknown>, metricContext: string): string[] {
  const errors: string[] = [];

  // Extract valid metric IDs from context
  const validIds = new Set<number>();
  const idMatches = metricContext.matchAll(/id:(\d+)/g);
  for (const m of idMatches) validIds.add(parseInt(m[1]));

  // metric_ids must exist and be valid
  if (!Array.isArray(spec.metric_ids) || spec.metric_ids.length === 0) {
    errors.push('metric_ids must be a non-empty array');
  } else {
    for (const id of spec.metric_ids as number[]) {
      if (!validIds.has(id)) errors.push(`metric_id ${id} not in catalog. Valid: [${[...validIds].join(',')}]`);
    }
  }

  // echarts_type must be valid
  if (spec.echarts_type && !VALID_CHART_TYPES.has(spec.echarts_type as string)) {
    errors.push(`Invalid echarts_type "${spec.echarts_type}". Must be one of: ${[...VALID_CHART_TYPES].join(', ')}`);
  }

  const dc = spec.data_config as Record<string, unknown> | undefined;
  if (dc) {
    // time_bucket
    if (dc.time_bucket && !VALID_TIME_BUCKETS.has(dc.time_bucket as string)) {
      errors.push(`Invalid time_bucket "${dc.time_bucket}". Must be month, week, or day`);
    }

    // Array length consistency
    const ids = spec.metric_ids as unknown[];
    const yf = dc.y_fields as unknown[];
    const labels = dc.labels as unknown[];
    if (ids && yf && ids.length !== yf.length) {
      errors.push(`metric_ids length (${ids.length}) must match y_fields length (${yf.length})`);
    }
    if (ids && labels && ids.length !== labels.length) {
      errors.push(`metric_ids length (${ids.length}) must match labels length (${labels.length})`);
    }

    // last_n_months
    if (dc.last_n_months !== null && dc.last_n_months !== undefined) {
      const lnm = dc.last_n_months as number;
      if (typeof lnm !== 'number' || lnm < 0 || !Number.isInteger(lnm)) {
        errors.push(`last_n_months must be a non-negative integer or null, got ${lnm}`);
      }
    }

    // style_rules operators
    if (Array.isArray(dc.style_rules)) {
      for (const rule of dc.style_rules as Record<string, unknown>[]) {
        if (rule.operator && !VALID_OPERATORS.has(rule.operator as string)) {
          errors.push(`Invalid style_rule operator "${rule.operator}"`);
        }
      }
    }
  }

  return errors;
}

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
    "group_by_dimension": "<column_name or null>",
    "labels": ["<display label for each y_field>", ...],
    "style_rules": [{"target": "<series label>", "compare_to": "<other series label or null>", "threshold": <number or null>, "operator": "<", "color": "#f87171"}] | null,
    "target_line": {"value": <number>, "label": "<string>", "color": "<hex>"} | null,
    "orientation": "horizontal" | null
  },
  "echarts_type": "<chart_type>",
  "show_labels": true | false,
  "colors": ["#hex1", "#hex2", ...] or null,
  "style_rules": [{"target": "<label>", "compareTo": "<label>" | null, "threshold": <number> | null, "operator": "<|<=|>|>=|==|!=", "color": "#hex"}] or null,
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
- "kpi" — single big number card. Use when user says "as KPI", "how many", "what's the count", "total number of", or "give me the number". Works for:
  - Primitive metrics (Trials, Syncs, Conversions, Churn, etc.)
  - chart_sql metrics (forecasts, trajectories, budgets)
  - Derived delta metrics (e.g., "Trajectory vs Forecast" = trajectory minus forecast — produces a single difference number). Return the derived metric_id directly, NOT the component IDs.
  - Derived attainment metrics (e.g., "Forecast Attainment" = trajectory/forecast × 100 — produces a single percentage)
  Do NOT use kpi for rate/percentage TIME SERIES (e.g., "sync rate by month", "conversion rate trend") — use "line" or "bar" for those.
  When user says "as KPI", ALWAYS return a KPI spec with metric_ids, never a text response.
- "table" — data table. Use when user says "table", "table view", "show as table", "list the data". Renders a sortable HTML table. When group_by_dimension is also set, renders as a pivot table: rows = dimension values (e.g. channels), columns = one per metric. Use last_n_months: 0 for MTD snapshot. Example: "trials and syncs by channel as a table" → table + group_by_dimension: AttributionChannel + last_n_months: 0.
- "yoy" — year-over-year comparison. Use when user says "year over year", "YoY", "compare years", "annual comparison". Shows grouped bars with months on X axis, one series per year. Only works with primitive metrics (not derived rates).
- "variance" — actual vs target/forecast comparison. First metric renders as bars, second as dashed line. Bars turn red when actual < target, green when above. Use when user says "compare to forecast", "vs target", "variance", "actual vs plan", "highlight where below". Requires exactly 2 metric_ids.
- "drill_table" — raw transaction-level detail table. Use when user says "show me individual transactions", "raw records", "detail table", "drill into", "list the rows", "transaction details". Renders each row from the underlying view. Only works with primitive metrics that have a view_name. Use last_n_months to scope the date range.

Rules:
- metric_ids: array of metric IDs to fetch data for. Use one per y_field.
- If metric_ids has multiple entries, data_config.y_fields and data_config.labels must have matching entries.
- x_field: the column to use for the x-axis (usually a date column for time charts, or a category column for bar charts)
- y_fields: array. Use "COUNT" when the metric has no numeric column and you need row counts. Otherwise use the actual column name.
- time_bucket: "month" (default), "week", or "day". Only relevant for time-series charts.
- last_n_months: integer. Default to 12 (last year) unless user specifies otherwise. "this month" = 0 (current month only), "last month" = 1, "last 3 months" = 3, "last 6 months" = 6, "this year" = 12, "recent" = 3, "last few" = 6, "last 2 years" = 24, "just march" or "just [month]" = 0. Only use null when user explicitly asks for "all time" or "since inception". Always set a value.
- channel_filter: one of "SEO", "PPC", "OPN", "Social", "Email", "Referral", "Direct", "Partners", "Content", "Remarketing", "Other", "None". null = no filter.
- labels: human-readable names for each series (e.g., ["Trials", "Syncs"])
- show_labels: boolean. Default: false.
- colors: optional array of hex color strings. Set when user requests specific colors. Default: null.
- target_line: optional horizontal reference line on bar/line charts. Set when user says "with a X% target", "show the target", "add a benchmark at X", etc. Fields: value (number), label (string shown on line), color (hex, default #ef4444). Example: {"value": 95, "label": "Target", "color": "#ef4444"}. Default: null.
- orientation: set to "horizontal" when user asks for a "horizontal stacked bar". Only applies to stacked_bar type. Default: null.
- style_rules: optional array of conditional coloring rules. Each rule colors individual data points in a series when a condition is met. Fields:
  - target: the label name of the series to style (must match a label in labels[])
  - compareTo: label of another series to compare against (for actual vs forecast). null if using threshold.
  - threshold: a fixed numeric value to compare against. null if using compareTo.
  - operator: one of "<", "<=", ">", ">=", "==", "!="
  - color: hex color to apply when condition is true
  Use style_rules when:
  - Comparing actual vs forecast: color actual bars red when below forecast, green when above. When user asks for BOTH colors, return TWO rules. Example: [{"target": "Trials", "compareTo": "Trials Forecast", "operator": "<", "color": "#ef4444"}, {"target": "Trials", "compareTo": "Trials Forecast", "operator": ">", "color": "#22c55e"}]
  - Threshold alerts: color a rate metric red when below a numeric target. When the user says "alert when below X%" or "drops below X%", ALWAYS set threshold as a decimal (e.g. 60% → 0.60, 15% → 0.15). The threshold field MUST be a number, never null. Example: {"target": "Sync Rate", "threshold": 0.60, "operator": "<", "color": "#ef4444"}
  - IMPORTANT: When using threshold styling, set BOTH style_rules (for per-point coloring) AND target_line (for the reference line). They serve different visual purposes.
  - Do NOT use style_rules for simple color preferences — use the colors field instead.
  - Default: null (no conditional styling).

IMPORTANT — Dimensions and channel filters:
- channel_filter targets a single channel (e.g. "SEO trials" → channel_filter:"SEO"). Do not set group_by_dimension when user asks for a single channel.
- group_by_dimension segments across all values of a dimension. Only set it when the metric's dimensions: list includes that column. If the metric has no dimensions: field, set group_by_dimension to null.
- When the user says "by <dimension>" (e.g. "trials by country", "syncs by channel"), ALWAYS use group_by_dimension — do NOT put the dimension in x_field. The x_field should remain the date column for time-series or "COUNT" for aggregations. The frontend handles the grouping via group_by_dimension.

IMPORTANT — Derived metrics:
- Derived metrics (type "derived") have no view_name. They have a formula and depends_on array.
- Just return the metric_id — the frontend handles formula evaluation.
- Derived metrics CAN be used as KPI tiles. Return the derived metric_id (not the component IDs). Example: "trials trajectory vs forecast as KPI" → metric_ids: [349], NOT [294, 285].

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
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-method-email',
      },
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Reject non-POST methods
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Info endpoint — returns live system prompt and capabilities for admin tooling
  if (body.action === 'info') {
    return new Response(JSON.stringify({
      version: EDGE_FUNCTION_VERSION,
      system_prompt: SYSTEM_PROMPT,
      supported_chart_types: ['line','bar','stacked_bar','horizontal_bar','pie','combo','funnel','heatmap','area','kpi','table','yoy','variance','drill_table'],
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const { prompt, messages, metricContext, schemaContext, currentChartSpec } = body as {
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    metricContext?: string;
    schemaContext?: string;
    currentChartSpec?: Record<string, unknown>;
  };

  // Validate required fields
  if (!prompt && (!messages || !Array.isArray(messages) || messages.length === 0)) {
    return new Response(JSON.stringify({ error: 'Either prompt or messages is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Enforce size limits to prevent abuse
  const MAX_CONTEXT_LEN = 50000;
  if (typeof metricContext === 'string' && metricContext.length > MAX_CONTEXT_LEN) {
    return new Response(JSON.stringify({ error: 'metricContext too large' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
  if (typeof schemaContext === 'string' && schemaContext.length > MAX_CONTEXT_LEN) {
    return new Response(JSON.stringify({ error: 'schemaContext too large' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

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
      max_tokens: 1024,
      system: systemPrompt,
      messages: claudeMessages,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error('Anthropic API error:', response.status, errBody);
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
    // Try to extract the outermost JSON object using balanced brace matching
    const start = text.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end !== -1) {
        try {
          parsed = JSON.parse(text.slice(start, end + 1));
        } catch {
          // still failed
        }
      }
    }
  }

  if (parsed) {
    // Text responses and errors pass through without chart validation
    if (typeof parsed === 'object' && parsed !== null && (parsed.type || parsed.error)) {
      return new Response(JSON.stringify(parsed), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Chart specs get validated
    if (typeof parsed === 'object' && parsed !== null && parsed.metric_ids) {
      const errors = validateChartSpec(parsed, metricContext || '');

      if (errors.length === 0) {
        return new Response(JSON.stringify(parsed), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      // Retry once with error context
      console.error('Validation errors, retrying:', errors);
      const retryMessages = [
        ...claudeMessages,
        { role: 'assistant', content: text },
        { role: 'user', content: `Your response had validation errors:\n${errors.join('\n')}\n\nPlease fix and return corrected JSON only.` },
      ];

      const retryResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          system: systemPrompt,
          messages: retryMessages,
        }),
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json();
        let retryText = retryData.content?.[0]?.text || '';
        retryText = retryText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
        try {
          const retryParsed = JSON.parse(retryText);
          if (retryParsed.metric_ids) {
            const retryErrors = validateChartSpec(retryParsed, metricContext || '');
            if (retryErrors.length === 0) {
              return new Response(JSON.stringify(retryParsed), {
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              });
            }
            console.error('Retry still has errors:', retryErrors);
          }
        } catch { /* retry parse failed */ }
      }

      // Return original with validation warnings if retry failed
      (parsed as Record<string, unknown>)._validation_errors = errors;
      return new Response(JSON.stringify(parsed), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  }

  console.error('JSON parse failed:', text);
  return new Response(JSON.stringify({ type: "text", content: text }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
