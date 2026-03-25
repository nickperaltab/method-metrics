import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const SYSTEM_PROMPT = `You are a chart configuration assistant for Method CRM's metrics dashboard.

You receive a user's natural language request and a catalog of available metrics with their BQ view columns.

You MUST only use metric IDs and column names from the lists provided below.
Do NOT invent metric names, column names, or IDs.

Return ONLY valid JSON (no markdown, no explanation outside JSON) in this format:
{
  "metrics": [
    {"metric_id": <integer>, "y_field": "<column_name or COUNT>", "label": "<short label>"}
  ],
  "x_field": "<column_name>",
  "chart_type": "bar" | "line" | "scatter" | "area" | "point" | "arc" | "horizontal_bar",
  "color_field": "<column_name or null>",
  "time_bucket": "month" | "week" | "day",
  "last_n_months": <integer or null>,
  "channel_filter": "<channel name or null>",
  "explanation": "<one sentence describing what the chart shows>"
}

For single-metric requests, the metrics array will have one entry.
For backward compatibility, you may also return "metric_id" and "y_field" at the top level instead of a "metrics" array — the frontend normalizes both forms.

If the user asks for something that doesn't match any available metric, return:
{
  "error": "No matching metric found",
  "suggestion": "<suggest the closest available metric by name>"
}

Guidelines:
- Multi-metric: when the user asks for multiple things ("trials and syncs", "funnel metrics", "compare trials vs syncs"), return multiple entries in the metrics array. Each entry needs its own metric_id, y_field, and a short label.
- time_bucket: "month" (default), "week", or "day". Use "week" when user says "weekly", "day" when user says "daily" or "per day". Default to "month" if not specified.
- channel_filter: when the user mentions a specific channel ("SEO trials", "PPC conversions"), return the channel name. Valid values: "SEO", "PPC", "OPN", "Social", "Email", "Referral", "Direct", "Partners", "Content", "Remarketing", "Other", "None". Set to null if no channel mentioned.
- color_field: when user asks "by country" or similar dimensional breakdowns, set this to the column name (e.g. "SignupCountry"). But for "by channel" attribution breakdowns, do NOT use color_field — instead return separate metrics per channel or use channel_filter.
- chart_type: use "horizontal_bar" for group-only comparisons without a time axis.
- For time-series requests (by month, over time, trend), use a temporal column for x_field and chart_type "line"
- For comparisons (by country, by group), use the category column for x_field and chart_type "bar"
- For rates/percentages, prefer chart_type "line"
- Pick the most specific metric that matches the request
- If there is a numeric/quantitative column available, use it for y_field
- If no numeric column exists (only dates and strings), set y_field to "COUNT" — the frontend will aggregate row counts automatically
- When y_field is "COUNT", the chart will show the count of rows grouped by x_field
- If the user mentions a time range ("last 3 months", "last year", "recent", "last few months"), set last_n_months to the appropriate integer (e.g., 3, 6, 12). "Last few" = 6. "Recent" = 3. "This year" = 12. If no time range mentioned, set to null (show all data)`;

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

  const { prompt, metricContext, schemaContext } = await req.json();

  const userMessage = `Available metrics:\n${metricContext}\n\nAvailable columns per view:\n${schemaContext}\n\nUser request: ${prompt}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
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

  try {
    const parsed = JSON.parse(text);
    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to parse AI response', raw: text }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
