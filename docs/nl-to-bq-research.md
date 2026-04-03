# NL-to-BigQuery OSS Research

Research session: 2026-04-03. Goal: find open source projects doing NL → BigQuery → charts that we can copy patterns from.

## Our Stack (for reference)

User types NL prompt → Claude Sonnet (Edge Function) → returns JSON config (metric IDs, chart type, time bucket, filters) → frontend builds SQL → runs against BigQuery via OAuth → renders with ECharts.

Metric catalog lives in Supabase (`metrics` table). AI sees all `live` metrics as context.

---

## Projects Worth Studying

### 1. WrenAI
**Repo:** https://github.com/Canner/WrenAI  
**Stars:** ~14,800 | Active (TypeScript + Python) | Updated daily

Closest architectural match. NL → semantic catalog (MDL) → SQL → charts.

**Prompt structure (from their source):**
```
### DATABASE SCHEMA ###
[MDL documents]

### CALCULATED FIELDS ###
[metric formulas]

### METRICS ###
[available metrics]

### SQL SAMPLES ###
[few-shot question→SQL pairs]

### USER INSTRUCTIONS ###
[numbered rules]

### QUESTION ###
User's Question: [query]

Let's think step by step.
```

**MDL metric definition format:**
```json
{
  "name": "customers",
  "columns": [
    {
      "name": "consumption",
      "type": "integer",
      "isCalculated": true,
      "expression": "sum(orders.totalprice)",
      "properties": { "description": "Total spend by customer" }
    }
  ]
}
```

**What to copy:**
- Section headers in prompt (`### DATABASE SCHEMA ###` etc.) — helps LLM organize context at high metric counts
- Separating "retrieval" (which metrics are relevant?) from "generation" (write the SQL)
- Relationship definitions: `{"models": ["Customer", "Orders"], "joinType": "ONE_TO_MANY", "condition": "..."}`
- Few-shot SQL samples injected into prompt — their `pipelines/generation/` directory

**Files to investigate:**
- `wren-ai-service/src/pipelines/generation/` — prompt construction
- `wren-ai-service/src/pipelines/retrieval/` — metric selection
- `wren-ai-service/src/pipelines/indexing/` — catalog indexing

---

### 2. nao
**Repo:** https://github.com/getnao/nao  
**Stars:** ~834 | Active | React + TypeScript + BigQuery + Fastify + tRPC

Closest JS stack to ours. Deploys AI analytics agents backed by BigQuery/Snowflake/Postgres.

**What to copy:**
- Built-in eval framework for testing agent responses — directly maps to our `eval.test.js`
- `nao init / nao sync / nao chat / nao test` CLI pattern for managing agent context
- tRPC for type-safe API between frontend and backend
- Shadcn UI components (already similar to our stack)

**Files to investigate:**
- Their eval/test framework — compare to `builder/tests/eval.test.js`
- Agent context management — how they sync schema to the agent

---

### 3. Google Open Data QnA
**Repo:** https://github.com/GoogleCloudPlatform/Open_Data_QnA  
**Stars:** ~225 | Google-built | Python + Angular | BigQuery native

Google's own NL→BigQuery agent. Has a clean agent pipeline worth stealing.

**Pipeline:**
1. `DescriptionAgent` — auto-generates table/column descriptions using LLM
2. Semantic embeddings find relevant tables from user question
3. LLM generates SQL with few-shot examples + column metadata
4. `ValidationAgent` — fixes syntax errors iteratively (passes error back to LLM for retry)
5. `VisualizeAgent` — takes SQL results + original question → returns JavaScript chart code

**What to copy:**
- `VisualizeAgent` pattern: after SQL executes, pass results + question to LLM → returns chart config. Clean separation of SQL generation vs visualization.
- Iterative SQL validation loop: if execution fails, pass the error back to LLM for a fix attempt (we don't do this today)
- Auto-generated column descriptions: use LLM to enrich Supabase metric catalog `description` fields

**Files to investigate:**
- `backend/agents/` — DescriptionAgent, ValidationAgent, VisualizeAgent implementations
- `backend/prompts/` — YAML prompt templates

---

### 4. Vanna (archived but valuable)
**Repo:** https://github.com/vanna-ai/vanna  
**Stars:** ~23,000 | ARCHIVED March 2026 | Python only

High-profile, now archived (commercialized). Still worth reading for the RAG pattern.

**Key RAG concept:**
At "training" time, feed it:
1. DDL statements
2. Business documentation text
3. Known-good question→SQL pairs

At query time, retrieves the 10 most relevant pieces via vector similarity and injects them into the prompt.

**What to copy:**
- Store verified SQL examples in Supabase alongside metrics (our `knowledge/verified-queries/` is already this)
- Retrieve most relevant verified examples per query as few-shot examples
- The `train()` (offline) vs `ask()` (online) separation

---

### 5. Cube (semantic layer reference)
**Repo:** https://github.com/cube-js/cube  
**Stars:** ~19,700 | Very active | TypeScript + Rust

Headless semantic layer. Not NL-native but the metric definition schema is clean.

**Metric definition pattern:**
```javascript
cube('Orders', {
  sql: 'SELECT * FROM orders',
  measures: {
    count: { type: 'count' },
    totalRevenue: { type: 'sum', sql: 'amount' }
  },
  dimensions: {
    status: { sql: 'status', type: 'string' },
    createdAt: { sql: 'created_at', type: 'time' }
  }
})
```

The `measures` / `dimensions` / `segments` separation is cleaner than a flat SQL string in a catalog — worth considering for how we structure Supabase metric definitions.

---

## Key Patterns to Apply

### 1. Prompt section headers (WrenAI)
Our `buildMetricContext()` in `builder/src/lib/ai.js` likely does a flat dump. Adding structured section headers (`### DATABASE SCHEMA ###`, `### METRICS ###`, `### SQL SAMPLES ###`) improves LLM accuracy at scale.

### 2. Few-shot SQL examples (Vanna RAG)
We already have `knowledge/verified-queries/` SQL files. The next step: surface the most relevant ones to Claude at query time. Even 2-3 verified examples per metric family would reduce hallucination.

### 3. Iterative SQL validation (Google Open Data QnA)
Today, if BigQuery returns a SQL error, we show it to the user. Instead: catch the error, pass it back to Claude with the original query, ask for a fix. One retry loop would handle most syntax errors.

### 4. VisualizeAgent separation (Google Open Data QnA)
Currently the AI decides both which metrics to use AND how to visualize them in one call. Splitting into a "metric selection" call and a "visualization" call could improve accuracy on both.

---

## Deep Dives (completed 2026-04-03)

### WrenAI: Prompt Construction & Retrieval

**Source files investigated:**

| File | Purpose |
|---|---|
| `wren-ai-service/src/pipelines/generation/sql_generation.py` | Main text-to-SQL pipeline |
| `wren-ai-service/src/pipelines/generation/sql_generation_reasoning.py` | Chain-of-thought reasoning plan before SQL |
| `wren-ai-service/src/pipelines/generation/sql_correction.py` | Retry failed SQL with error feedback |
| `wren-ai-service/src/pipelines/generation/utils/sql.py` | All prompt templates, SQL rules, metric instructions |
| `wren-ai-service/src/pipelines/retrieval/db_schema_retrieval.py` | Vector search for relevant tables + LLM column pruning |
| `wren-ai-service/src/pipelines/retrieval/sql_pairs_retrieval.py` | Few-shot SQL examples via vector similarity |
| `wren-ai-service/src/pipelines/retrieval/instructions.py` | User-defined rules retrieval |
| `wren-ai-service/src/web/v1/services/ask.py` | Full pipeline orchestration |

**Exact prompt template (user prompt for SQL generation):**

```jinja2
### DATABASE SCHEMA ###
{% for document in documents %}
    {{ document }}
{% endfor %}

{% if calculated_field_instructions %}
{{ calculated_field_instructions }}
{% endif %}

{% if metric_instructions %}
{{ metric_instructions }}
{% endif %}

{% if sql_functions %}
### SQL FUNCTIONS ###
{% for function in sql_functions %}
{{ function }}
{% endfor %}
{% endif %}

{% if sql_samples %}
### SQL SAMPLES ###
{% for sample in sql_samples %}
Question:
{{sample.question}}
SQL:
{{sample.sql}}
{% endfor %}
{% endif %}

{% if instructions %}
### USER INSTRUCTIONS ###
{% for instruction in instructions %}
{{ loop.index }}. {{ instruction }}
{% endfor %}
{% endif %}

### QUESTION ###
User's Question: {{ query }}

{% if sql_generation_reasoning %}
### REASONING PLAN ###
{{ sql_generation_reasoning }}
{% endif %}

Let's think step by step.
```

**System prompt (summarized):**
```
You are a helpful assistant that converts natural language queries into ANSI SQL.
Given user's question, database schema, etc., think deeply and generate SQL based
on the given reasoning plan step by step.

### GENERAL RULES ###
1. FOLLOW instructions strictly if USER INSTRUCTIONS section available
2. ONLY CHOOSE functions from SQL FUNCTIONS list if available
3. REFER to sql samples if SQL SAMPLES section available
4. FOLLOW the reasoning plan step by step if REASONING PLAN available
5. FOLLOW SQL Rules if not contradicted with instructions

{text_to_sql_rules}

### FINAL ANSWER FORMAT ###
{"sql": <SQL_QUERY_STRING>}
```

**How schema is formatted for the LLM — DDL with inline comments:**

```sql
/* {"alias":"orders","description":"A model representing orders."} */
CREATE TABLE orders (
  -- {"description":"Order timestamp","alias":"_timestamp"}
  ApprovedTimestamp TIMESTAMP,
  -- This column is a Calculated Field
  -- column expression: avg(reviews.Score)
  Rating DOUBLE,
  FOREIGN KEY (CustomerId) REFERENCES customers(Id)
);
```

Metrics become pseudo-tables:
```sql
/* This table is a metric */
/* Metric Base Object: orders */
CREATE TABLE Revenue (
  -- This column is a dimension
  PurchaseTimestamp TIMESTAMP,
  -- This column is a measure
  -- expression: sum(order_items.Price)
  PriceSum DOUBLE
);
```

**Retrieval pipeline (how they select relevant context):**

1. **Historical question check** — vector similarity at 0.9 threshold. If found, returns cached SQL immediately (skips everything).
2. **Table retrieval** — embed query, search Qdrant vector store (top-k=10 tables). Fetch full schemas.
3. **Column pruning** — if schemas exceed token budget, an LLM prunes irrelevant columns (structured JSON output with chain-of-thought reasoning per table).
4. **SQL pairs retrieval** — embed query, search `sql_pairs` store with 0.7 similarity threshold, max 10 results. Injected as `### SQL SAMPLES ###`.
5. **Instructions retrieval** — scoped user rules + default rules merged together.

**Two-pass generation (the big insight):**
1. First call: generate a step-by-step **reasoning plan** (chain-of-thought, no SQL)
2. Second call: generate SQL following the reasoning plan

This is their accuracy multiplier — the reasoning plan forces the LLM to think about table relationships, join conditions, and edge cases before writing code.

**Recommendation for `builder/src/lib/ai.js`:**

1. **Add section headers to the prompt.** Our `buildMetricContext()` returns a flat list of `- id:54 name:"Trials"...` lines. Wrap it with `### METRICS ###` and add `### SCHEMA ###` around the schema context. This is a 5-minute change in the Edge Function's system prompt.

2. **Inject few-shot examples.** We have `knowledge/verified-queries/` with working SQL. Even 2-3 relevant examples in a `### SQL SAMPLES ###` section would reduce hallucination. Start simple: for each metric family, hardcode 1-2 question→config pairs. No vector search needed yet.

3. **Consider two-pass for complex queries.** For multi-metric or derived metric queries, a reasoning step ("which metrics are needed? what are their dependencies?") before the config generation would help. Not needed for simple "show me trials by month" queries — could gate on metric count or prompt complexity.

---

### nao: Eval Framework

**Source files investigated:**

| File | Purpose |
|---|---|
| `cli/nao_core/commands/test/case.py` | Test case model + YAML discovery |
| `cli/nao_core/commands/test/runner.py` | Test execution, DataFrame comparison, result aggregation |
| `cli/nao_core/commands/test/client.py` | HTTP client to nao backend |
| `cli/nao_core/commands/test/server.py` | Local web UI for viewing results |
| `apps/backend/src/services/test-agent.service.ts` | Agent + verification pass |

**Test case format (YAML files in `tests/` folder):**

```yaml
name: total_revenue
prompt: What is the total revenue from all orders?
sql: |
  SELECT SUM(amount) as total_revenue
  FROM orders
```

Three fields: `name`, `prompt` (NL input), `sql` (ground truth query whose results are compared).

**How evaluation works (two-pass verification):**

1. **Agent pass** — send prompt to full AI agent. Agent explores schema, writes SQL, executes it, returns answer.
2. **Verification pass** — run the test case's `sql` against the real database to get `expectedData`. Then ask the LLM to extract structured data from the agent's response matching expected columns → `actualData`.
3. **DataFrame comparison** — compare `actualData` vs `expectedData`:
   - Check column presence
   - Check row count
   - Round floats to 2 decimals
   - Sort rows (order-independent)
   - Try `df.equals()` first, fall back to `np.allclose(rtol=1e-5, atol=1e-8)`
   - Show diff on failure

**Metrics tracked per test:**

```json
{
  "passed": true,
  "message": "match",
  "tokens": 2500,
  "cost": 0.01,
  "duration_ms": 1700,
  "tool_call_count": 3
}
```

Aggregated summary: total/passed/failed, total tokens/cost, avg duration, avg tool calls. Results persisted to `tests/outputs/results_YYYYMMDD_HHMMSS.json`.

**CLI features:**
```bash
nao test                          # run all tests
nao test -m openai:gpt-4.1       # specific model
nao test -m model1 -m model2     # multi-model comparison
nao test --threads 4              # parallel execution
nao test -s total_revenue         # single test
nao test server                   # web UI for results
```

**Comparison with our `eval.test.js`:**

| Aspect | Our eval | nao eval |
|--------|----------|----------|
| What's tested | NL → JSON config | NL → SQL → data (full loop) |
| Ground truth | Hardcoded assertions | SQL query result comparison |
| Test format | Inline JS assertions | YAML files |
| Scoring | Pass/fail only | Pass/fail + tokens + cost + latency |
| Models | Single (Haiku) | Multi-model via `-m` flag |
| Parallelism | Sequential | Threaded `--threads N` |
| Result persistence | None (stdout) | JSON files + web viewer |

**Recommendation for `builder/tests/eval.test.js`:**

1. **Extract test cases to YAML/JSON.** Move the test definitions out of the JS file. Each test becomes a small JSON object: `{prompt, expectedMetricIds, expectedType, assertions}`. The test runner loops over them. Makes it trivial to add new tests without writing JS.

2. **Track cost/token/latency per test.** The Edge Function could return token usage in its response. Track it in test output. Over time this shows which prompts are expensive or slow.

3. **Add result persistence.** Write results to `builder/tests/eval-results/results_YYYYMMDD.json`. This enables regression tracking — did last week's prompt change improve or regress?

4. **Parallel execution.** Our tests run sequentially and each hits the Edge Function. Running them in parallel (e.g., `Promise.all` batches of 5) would cut wall time from ~60s to ~15s.

---

### Google Open Data QnA: ValidationAgent & VisualizeAgent

**Source files investigated:**

| File | Purpose |
|---|---|
| `agents/core.py` | Base `Agent` class wrapping Vertex AI models |
| `agents/BuildSQLAgent.py` | Initial SQL generation from question + schema |
| `agents/ValidateSQLAgent.py` | LLM-based syntax/semantic check (returns `{valid, errors}`) |
| `agents/DebugSQLAgent.py` | Iterative fix/retry loop using chat with error feedback |
| `agents/VisualizeAgent.py` | SQL results → Google Charts JavaScript |
| `agents/ResponseAgent.py` | SQL results → natural language answer |
| `opendataqna.py` | Main orchestrator chaining all agents |

**ValidationAgent retry loop (from `DebugSQLAgent.start_debugger()`):**

```python
def start_debugger(self, source_type, user_grouping, query, user_question,
                   SQLChecker, tables_schema, columns_schema, AUDIT_TEXT,
                   similar_sql="-No examples provided..-",
                   DEBUGGING_ROUNDS=2, LLM_VALIDATION=False):
    i = 0
    STOP = False
    invalid_response = False
    chat_session = self.init_chat(source_type, user_grouping, tables_schema,
                                  columns_schema, similar_sql)
    sql = query.replace("```sql","").replace("```","")

    while (not STOP):
        json_syntax_result = {"valid": True, "errors": "None"}

        # Step 1: Optional LLM syntax check
        if LLM_VALIDATION:
            json_syntax_result = SQLChecker.check(source_type, user_question,
                                                  tables_schema, columns_schema, sql)
        else:
            json_syntax_result['valid'] = True

        if json_syntax_result['valid'] is True:
            # Step 2: Actual dry-run against real database
            correct_sql, exec_result_df = connector.test_sql_plan_execution(sql)

            if not correct_sql:
                # Step 3: Feed error back to LLM for rewrite
                rewrite_result = self.rewrite_sql_chat(chat_session, sql,
                                                       user_question, exec_result_df)
                sql = str(rewrite_result).replace("```sql","").replace("```","")
            else:
                STOP = True  # Success
        else:
            # LLM validation failed — feed syntax errors back
            syntax_err_df = pd.read_json(json.dumps(json_syntax_result))
            rewrite_result = self.rewrite_sql_chat(chat_session, sql,
                                                    user_question, syntax_err_df)
            sql = str(rewrite_result).replace("```sql","").replace("```","")

        i += 1
        if i > DEBUGGING_ROUNDS:
            STOP = True
            invalid_response = True

    return sql, invalid_response, AUDIT_TEXT
```

**Key design decisions:**
- **2 debugging rounds** (3 total attempts: initial + 2 rewrites)
- **Two-tier validation**: optional LLM syntax check, then real database dry-run/EXPLAIN
- **Chat-based rewriting**: each retry uses the same chat session, so the LLM sees all previous failed attempts
- **Rewrite prompt**: "Present a different SQL from previous ones. Avoid repeating suggestions."

**The rewrite prompt sent each iteration:**
```
What is an alternative SQL statement to address the error mentioned below?
Present a different SQL from previous ones. It is important that the query
still answer the original question. All columns selected must be present on
tables mentioned on the join section. Avoid repeating suggestions.

<Original SQL> {sql} </Original SQL>
<Original Question> {question} </Original Question>
<Error Message> {error_df} </Error Message>
```

**VisualizeAgent (3-step process, all Gemini 1.5 Pro):**

1. **`getChartType()`** — asks LLM to suggest 2 best chart types from: scorecard, table, bar, line, pie, scatter. Returns `{"chart_1": "Bar Chart", "chart_2": "Pie Chart"}`.
2. **`getChartPrompt()`** — builds prompt with question + SQL + chart type + result data.
3. **`generate_charts()`** — makes 2 parallel LLM calls (one per chart type), each generating complete Google Charts JavaScript. Returns `{"chart_div": "<js>", "chart_div_1": "<js>"}`.

The VisualizeAgent generates **raw JavaScript strings** (not structured config). The frontend injects the JS into the page. This is the opposite of our approach (structured JSON config → ECharts).

**Full pipeline flow:**
```
User Question → [EmbedderAgent] → vector search for similar tables/SQL
    → [BuildSQLAgent] → initial SQL
    → [DebugSQLAgent] → validate + retry loop (up to 3 attempts)
    → Execute SQL against BigQuery
    → [ResponseAgent] → natural language answer
    → [VisualizeAgent] → chart JavaScript
```

Each stage gates on `invalid_response` — if any step fails, downstream steps are skipped.

**Recommendation for `builder/src/lib/ai.js`:**

1. **Add a SQL error retry loop.** Today if BigQuery returns a SQL error, we show it to the user. Instead: catch the BQ error in `fetchAggregatedData()` or `fetchChartData()`, send it back to the Edge Function with the original prompt + error message, ask for a corrected config. One retry (not two) is enough for our case since we generate config, not raw SQL. Implementation: add a `retryWithError(originalPrompt, error, previousConfig)` function that calls the Edge Function with an extra `error_context` field.

2. **Use chat-based retry, not single-shot.** The key insight from Google's approach: use the same conversation context for retries so the LLM sees its previous failed attempt. Our `generateChartSpecWithHistory()` already supports message history — we can append an error message as a system/user message and re-call.

3. **Don't copy the VisualizeAgent pattern.** Their approach (LLM generates raw JS) is fragile and opposite to our architecture (structured JSON config → deterministic rendering). Our approach is better — keep it.

---

## Concrete Action Items for `builder/src/lib/ai.js`

Prioritized by impact vs effort:

### 1. Structured prompt sections (WrenAI pattern) — LOW effort, HIGH impact
Change the Edge Function system prompt to use `### METRICS ###`, `### SCHEMA ###`, `### RULES ###` section headers instead of flat text. Update `buildMetricContext()` and `buildSchemaContext()` to wrap their output.

### 2. Few-shot examples (WrenAI + Vanna pattern) — MEDIUM effort, HIGH impact
Add a `### EXAMPLES ###` section to the prompt with 5-10 hardcoded question→config pairs covering common patterns (single metric, multi-metric, breakdown, forecast comparison, derived rate). Pull from verified eval test cases.

### 3. Error retry loop (Google Open Data QnA pattern) — MEDIUM effort, HIGH impact
When BQ query fails, append the error to chat history and re-call the Edge Function. Use `generateChartSpecWithHistory()` with an extra message: `{role: "user", content: "The query failed with error: {error}. Please fix the config."}`. Limit to 1 retry.

### 4. YAML test cases + result persistence (nao pattern) — LOW effort, MEDIUM impact
Extract eval test definitions to `builder/tests/eval-cases.json`. Add JSON result output with timestamps, token counts, and pass/fail. Enables regression tracking.

### 5. Cost/latency tracking in evals (nao pattern) — LOW effort, MEDIUM impact
Have the Edge Function return `{tokens, latency_ms}` alongside the config. Record in eval results. Track over time to catch prompt bloat.

### 6. Two-pass reasoning (WrenAI pattern) — HIGH effort, HIGH impact (defer)
For complex multi-metric queries, generate a reasoning plan first, then the config. This is the biggest accuracy win but requires a second LLM call. Defer until the simpler changes are in place and we have eval data showing where accuracy gaps remain.
