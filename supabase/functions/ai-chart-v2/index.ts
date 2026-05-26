import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const EDGE_FUNCTION_VERSION = '1';

// ─────────────────────────────────────────────────────────────────────────────
// Call 1: Intent Classifier
// Pure NLU — no metric catalog, no schema. Just extracts structured intent
// from the user's message so Call 2 has explicit context to work with.
// ─────────────────────────────────────────────────────────────────────────────
const INTENT_CLASSIFIER_PROMPT = `You are a quick intent parser for a metrics chart builder.

Given a user's message (and optional recent conversation), extract intent and entities.

Return ONLY valid JSON:
{
  "intent": "chart" | "modify" | "question",
  "metric_hints": ["<metric name hint>", ...],
  "chart_type_hint": "line" | "bar" | "stacked_bar" | "horizontal_bar" | "pie" | "combo" | "area" | "kpi" | "table" | "yoy" | "variance" | null,
  "time_range_hint": "<e.g. last 3 months, this year, all time>" | null,
  "time_bucket_hint": "day" | "week" | "month" | null,
  "channel_hint": "<channel name e.g. SEO, PPC>" | null,
  "dimension_hint": "country" | "channel" | "vertical" | "sync_type" | null,
  "is_dimension_breakdown": true | false,
  "is_single_channel_filter": true | false,
  "is_kpi": true | false,
  "is_modification": true | false
}

Rules:
- is_dimension_breakdown: true if user wants to SEE all values of a dimension (e.g. "by country", "by channel", "broken down by", "distribution by", "across channels")
- is_single_channel_filter: true if user names ONE specific channel to filter to (e.g. "SEO trials", "PPC conversions") — these are filters, NOT breakdowns
- is_kpi: true ONLY for "how many", "what's the count", "total number of" — not just "this month"
- dimension_hint: infer from "by country"→country, "by channel"→channel, "by vertical"→vertical, "by sync type"→sync_type
- If is_dimension_breakdown is true and channel_hint is null, do NOT set is_single_channel_filter

Do not include any explanation outside the JSON.`;

// ─────────────────────────────────────────────────────────────────────────────
// Call 2: Spec Generator
// Receives the full metric catalog + schema + Call 1's intent output.
// Explicit intent removes ambiguity so it can focus on metric ID lookup.
// ─────────────────────────────────────────────────────────────────────────────
const SPEC_GENERATOR_PROMPT = `You are a chart configuration assistant for Method CRM's metrics dashboard.

You receive a user's natural language request, a catalog of available metrics, and a structured intent analysis.

CRITICAL: Trust the intent analysis. It was computed before you received this request.
- If intent.is_dimension_breakdown is true → you MUST set group_by_dimension to the appropriate column
- If intent.is_single_channel_filter is true → set channel_filter, NOT group_by_dimension
- If intent.dimension_hint is "country" → group_by_dimension: "SignupCountry"
- If intent.dimension_hint is "channel" → group_by_dimension: "AttributionChannel"
- If intent.dimension_hint is "vertical" → group_by_dimension: "Vertical"
- If intent.dimension_hint is "sync_type" → group_by_dimension: "SyncType"

You MUST only use metric IDs and column names from the lists provided.
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
    "style_rules": [{"target": "<series label>", "compare_to": "<other series label>", "operator": "<", "color": "#f87171"}] | null,
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
- "combo" — bar + line overlay
- "funnel" — conversion funnel stages
- "heatmap" — two-dimensional intensity
- "area" — filled line chart
- "kpi" — single big number. ONLY when user explicitly asks for a count/number ("how many", "what's the count", "total number of"). Never for rates.
- "table" — data table / pivot table
- "yoy" — year-over-year comparison
- "variance" — actual vs target/forecast comparison

Rules:
- metric_ids: array of metric IDs. Use one per y_field.
- y_fields: use "COUNT" when metric has no numeric column. Otherwise use the actual column name.
- time_bucket: "month" (default), "week", or "day".
- last_n_months: default 12. "this month"=0, "last month"=1, "last 3 months"=3, "last 6 months"=6, "this year"=12, "last 2 years"=24. Only null for "all time".
- channel_filter: one of SEO, PPC, OPN, Social, Email, Referral, Direct, Partners, Content, Remarketing, Other, None. null = no filter.
- group_by_dimension: ONLY set if intent.is_dimension_breakdown is true AND the dimension is in the metric's approved dimensions list.
- labels: human-readable names for each series.

IMPORTANT — Derived metrics:
- Derived metrics (type "derived") have no view_name. Just return the metric_id — frontend handles formula evaluation.

If the user asks a question (not a chart request):
{"type": "text", "content": "<helpful answer>", "suggestion": "<optional chart suggestion>"}

If no matching metric:
{"error": "No matching metric found", "suggestion": "<closest available metric name>"}`;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function callAnthropic(systemPrompt: string, userMessage: string, maxTokens: number): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errBody}`);
  }

  const data = await response.json();
  let text = data.content?.[0]?.text || '';
  // Strip markdown code fences
  text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return text;
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    // Try balanced brace extraction
    const start = text.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end !== -1) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch { /* noop */ }
      }
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Call 1: Classify intent from user message
// ─────────────────────────────────────────────────────────────────────────────
async function classifyIntent(
  lastUserMessage: string,
  recentHistory: Array<{ role: string; content: string }>,
): Promise<Record<string, unknown>> {
  const historyStr = recentHistory.length > 0
    ? `Recent conversation:\n${recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\n`
    : '';
  const userMsg = `${historyStr}User message: ${lastUserMessage}`;

  const text = await callAnthropic(INTENT_CLASSIFIER_PROMPT, userMsg, 256);
  const parsed = parseJson(text);
  if (!parsed) {
    console.warn('Intent parse failed, using defaults. Raw:', text);
    return { intent: 'chart', metric_hints: [], is_dimension_breakdown: false, is_single_channel_filter: false, is_kpi: false, is_modification: false };
  }
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Call 2: Generate spec with explicit intent context injected
// ─────────────────────────────────────────────────────────────────────────────
async function generateSpec(
  lastUserMessage: string,
  intent: Record<string, unknown>,
  metricContext: string,
  schemaContext: string,
  currentChartSpec: Record<string, unknown> | null,
  recentHistory: Array<{ role: string; content: string }>,
): Promise<Record<string, unknown>> {
  let systemPrompt = SPEC_GENERATOR_PROMPT;

  if (currentChartSpec) {
    systemPrompt += `\n\nCurrent chart state: ${JSON.stringify(currentChartSpec)}\n\nIf the user is modifying the current chart, return an UPDATED spec that preserves existing settings. Only start fresh if asking for something completely different.`;
  }

  const historyStr = recentHistory.length > 0
    ? `Recent conversation:\n${recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\n`
    : '';

  const userMsg = `Available metrics:\n${metricContext}\n\nAvailable columns per view:\n${schemaContext}\n\nIntent analysis (trust this):\n${JSON.stringify(intent, null, 2)}\n\n${historyStr}User request: ${lastUserMessage}`;

  const text = await callAnthropic(systemPrompt, userMsg, 1024);
  const parsed = parseJson(text);
  if (!parsed) {
    console.error('Spec parse failed. Raw:', text);
    return { type: 'text', content: text };
  }
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
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

  // Info endpoint
  if (body.action === 'info') {
    return new Response(JSON.stringify({
      version: EDGE_FUNCTION_VERSION,
      architecture: '2-call-haiku',
      call1: 'intent classifier (claude-haiku-4-5-20251001, no catalog)',
      call2: 'spec generator (claude-haiku-4-5-20251001, with intent context)',
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

  if (!prompt && (!messages || !Array.isArray(messages) || messages.length === 0)) {
    return new Response(JSON.stringify({ error: 'Either prompt or messages is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const MAX_CONTEXT_LEN = 50000;
  if (typeof metricContext === 'string' && metricContext.length > MAX_CONTEXT_LEN) {
    return new Response(JSON.stringify({ error: 'metricContext too large' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Resolve last user message and recent history
  let lastUserMessage: string;
  let recentHistory: Array<{ role: string; content: string }> = [];

  if (messages && Array.isArray(messages) && messages.length > 0) {
    const recent = messages.slice(-10);
    lastUserMessage = recent.filter(m => m.role === 'user').at(-1)?.content || '';
    // History = all turns except the last user message
    recentHistory = recent.slice(0, -1);
  } else {
    lastUserMessage = prompt || '';
  }

  try {
    // ── Call 1: Classify intent ───────────────────────────────────────────────
    const intent = await classifyIntent(lastUserMessage, recentHistory.slice(-6));

    // ── Call 2: Generate spec ────────────────────────────────────────────────
    const result = await generateSpec(
      lastUserMessage,
      intent,
      metricContext || '',
      schemaContext || '',
      currentChartSpec || null,
      recentHistory.slice(-6),
    );

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('V2 handler error:', err);
    return new Response(JSON.stringify({ error: `Internal error: ${(err as Error).message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
