import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const SYSTEM_PROMPT = `You are a chart configuration assistant for Method CRM's metrics dashboard.

You receive a user's natural language request and a catalog of available metrics with their BQ view columns.

You MUST only use metric IDs and column names from the lists provided below.
Do NOT invent metric names, column names, or IDs.

Return ONLY valid JSON (no markdown, no explanation outside JSON) in this format:
{
  "metric_id": <integer>,
  "chart_type": "bar" | "line" | "scatter" | "area" | "point" | "arc",
  "x_field": "<column_name>",
  "y_field": "<column_name>",
  "color_field": "<column_name or null>",
  "filters": {},
  "explanation": "<one sentence describing what the chart shows>"
}

If the user asks for something that doesn't match any available metric, return:
{
  "error": "No matching metric found",
  "suggestion": "<suggest the closest available metric by name>"
}

Guidelines:
- For time-series requests (by month, over time, trend), use a temporal column for x_field and chart_type "line"
- For comparisons (by channel, by country), use the category column for x_field and chart_type "bar"
- For rates/percentages, prefer chart_type "line"
- Pick the most specific metric that matches the request
- y_field should typically be a numeric/quantitative column`;

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
      max_tokens: 300,
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
  const text = data.content?.[0]?.text || '';

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
