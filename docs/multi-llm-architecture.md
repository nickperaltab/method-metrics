# Multi-LLM Agent Architecture for Chart Builder

Research-backed architecture plan. Grounded in Anthropic's "Building Effective Agents" patterns,
current eval data (24/26 Haiku, ~53/56 Sonnet), and cost/latency tradeoffs from production systems.

---

## Current State

- Single Sonnet 4.5 call via Supabase Edge Function (v31)
- ~4K token system prompt + metric catalog + BQ schemas per request
- Client-side post-processing: `applyPromptOverrides()`, `validateColumns()`, stacked_bar guard
- Eval suite: ~56 test cases, Haiku passes 24/26 on its own
- Metric catalog: ~45 live metrics, growing toward 80+

## Recommended Architecture

### The "Graduated Complexity" Approach

Do NOT build a 4-agent system upfront. Anthropic's core guidance: "Start with simple prompts,
optimize them with comprehensive evaluation, and add multi-step agentic systems only when
simpler solutions fall short." Multi-agent systems use 10-15x more tokens than single agents.

**Build in phases. Each phase must prove its value via the eval suite before proceeding.**

```
Phase 1 (now)     Phase 2 (50+ metrics)     Phase 3 (if needed)
--------------    ----------------------    --------------------
[Single Call]  →  [Router → Expert]      →  [Router → Expert → Validator]
  Haiku 4.5         Haiku    Haiku             Haiku   Haiku    Haiku
                             (Sonnet            (Sonnet for complex)
                              for complex)
```

### Phase 1: Optimized Single Call (Current Priority)

The data says Haiku handles 92% of test cases already. Before adding agents, exhaust single-call
optimizations:

1. **Switch from Sonnet to Haiku** as the default model in the edge function
2. **Compress the metric catalog** — use the compact format from eval tests (~30 tokens/metric
   instead of ~80), drop formula/view_definition from context
3. **Move remaining deterministic logic out of the prompt** — channel_filter, time_bucket
   detection, stacked_bar guard are already client-side; audit for more candidates
4. **Add the 2 failing Haiku test cases** as targeted prompt improvements

**Decision gate:** Run full eval suite on Haiku with compressed catalog. If pass rate is >=90%
(50/56), stay on single call. If it degrades with 80+ metrics, proceed to Phase 2.

Cost impact: Haiku is $1/$5 per MTok vs Sonnet's $3/$15. Immediate 3-5x cost reduction.

### Phase 2: Router + Expert (When Catalog Exceeds ~60 Metrics)

Split into two sequential calls. This is Anthropic's "routing" pattern — the simplest
multi-agent pattern, not a full orchestrator.

#### Call 1: Router (Haiku 4.5)

**Input:** Compact metric catalog (id, name, 1-line description) + user prompt
**Output:**
```json
{
  "metric_ids": [54, 55],
  "intent": "time_series" | "comparison" | "kpi" | "breakdown" | "table" | "question",
  "confidence": 0.95
}
```

**Why separate:** Metric selection is pure retrieval/matching. It does not need BQ schemas,
chart type rules, or style_rules documentation. Stripping that context improves signal-to-noise
ratio as the catalog grows. Research shows LLM attention to list items degrades past ~50 items
in a mixed-purpose prompt.

**Model:** Always Haiku. Classification accuracy matches Sonnet for retrieval tasks.

**Prompt size:** ~1.5K tokens (system) + ~30 tokens/metric * 80 metrics = ~4K total.
Compare to current: ~4K system + ~80 tokens/metric * 80 = ~10.4K total.

#### Call 2: Expert (Haiku or Sonnet, routed by intent)

**Input:** Only the selected metrics' full definitions + BQ schemas + intent + user prompt
**Output:** Full chart config JSON (the current response shape)

**Key insight:** The expert prompt is specialized per intent category. Instead of one 112-line
system prompt covering all 14 chart types, each expert variant covers 3-4 types:

| Intent | Chart Types | Model | Prompt Size |
|--------|------------|-------|-------------|
| `time_series` | line, bar, area, stacked_bar, combo | Haiku | ~1.5K |
| `comparison` | variance, yoy | Haiku (Sonnet if >2 metrics) | ~1K |
| `kpi` | kpi | Haiku | ~0.8K |
| `breakdown` | horizontal_bar, pie, heatmap, stacked_bar | Haiku | ~1.2K |
| `table` | table, drill_table | Haiku | ~1K |
| `question` | text response | Haiku | ~0.5K |

**Model selection rule:** Use Haiku by default. Escalate to Sonnet when:
- Intent is `comparison` AND >2 metrics with derived dependencies
- Confidence from Router is below 0.7 (ambiguous request)
- Conversational follow-up modifying a complex multi-metric chart

**Latency budget:** Router (Haiku) ~300ms + Expert (Haiku) ~400ms = ~700ms total.
Compare to current single Sonnet call: ~800-1200ms. Net neutral or faster.

#### Where It Runs

Both calls happen inside the existing Supabase Edge Function. No new infrastructure.
The edge function becomes an orchestrator:

```typescript
// Pseudocode for the edge function
const routerResult = await callClaude({
  model: 'claude-haiku-4-5',
  system: ROUTER_PROMPT,
  messages: [{ role: 'user', content: compactCatalog + userPrompt }],
});

const expertPrompt = EXPERT_PROMPTS[routerResult.intent];
const expertModel = shouldEscalate(routerResult) ? 'claude-sonnet-4-6' : 'claude-haiku-4-5';

const chartSpec = await callClaude({
  model: expertModel,
  system: expertPrompt,
  messages: [{ role: 'user', content: selectedMetricDetails + userPrompt }],
});
```

### Phase 1.5: Deterministic Validator (Implement Immediately)

Add server-side validation from the start. It's cheap, pure code, and prevents bad charts
from reaching the user. No reason to wait for error rate data — this is basic input validation.

#### How the Validator Works

```
Expert output → Deterministic checks → [pass] → return to client
                                     → [fail] → retry with error context (max 1 retry)
```

**Deterministic checks (no LLM needed):**
1. Valid JSON parse
2. All metric_ids exist in the catalog
3. echarts_type is in the allowed set
4. y_fields.length === metric_ids.length === labels.length
5. group_by_dimension is in the metric's approved_dimensions
6. time_bucket is one of: month, week, day
7. style_rules operators are valid
8. last_n_months is a non-negative integer or null

**On failure:** Re-call the expert with the original prompt + the failed output + specific
error message ("metric_id 999 does not exist in catalog. Available IDs: [54, 55, 56...]").
Max 1 retry. If retry fails, return the best-effort result to the client (which already
has its own validation layer).

**Model:** No LLM needed for validation. This is pure deterministic code. Only the retry
uses an LLM call (same expert model).

**Important:** The validator does NOT use an LLM to check the output. LLM-as-judge is
expensive and slow. For structured JSON with a known schema, deterministic validation
is faster, cheaper, and more reliable.

---

## The Chatter Layer

The Chatter is an **intent clarification agent** — not a conversational memory layer, but
an expert at understanding what the user actually wants before routing. Its job is to ask
smart follow-up questions when the request is ambiguous.

**Examples:**
- "show me revenue" → "Did you mean New DEP Revenue, Total DEP Revenue, or Total Net SaaS?"
- "compare metrics" → "Which metrics would you like to compare?"
- "show me trends" → "Which metric? Trials, Syncs, Conversions, or something else?"

**Implementation:** The Router gains a `clarify` intent. When confidence is low or the
request is ambiguous, instead of guessing it returns:
```json
{
  "intent": "clarify",
  "question": "Did you mean New DEP Revenue or Total DEP Revenue?",
  "options": ["New DEP Revenue (id:329)", "Total DEP Revenue (id:333)"]
}
```
The client displays this as a follow-up question. The user picks, and the request
re-submits with context. This is a Phase 2 feature since it requires the Router.

**What it is NOT:** A separate agent with its own LLM call on every request. That would
double latency for clear requests ("trials by month") that need no clarification. The
clarification ability lives inside the Router — one call, not two.

---

## Cost and Latency Analysis

### Per-Request Cost (80 metrics, typical request)

| Architecture | Input Tokens | Output Tokens | Cost | Latency |
|-------------|-------------|--------------|------|---------|
| Single Sonnet (current) | ~10K | ~300 | ~$0.0075 | ~1000ms |
| Single Haiku (Phase 1) | ~10K | ~300 | ~$0.0025 | ~500ms |
| Router+Expert Haiku (Phase 2) | ~4K + ~3K | ~100 + ~300 | ~$0.0027 | ~700ms |
| Router+Expert+Retry (Phase 3) | ~4K + ~3K + ~4K (5% of time) | ~100 + ~300 + ~300 | ~$0.0029 | ~700ms (1100ms on retry) |

**Key takeaway:** Phase 1 (Haiku swap) delivers the biggest cost win. Phase 2 adds
architectural headroom for catalog growth with minimal cost/latency increase.

### When Multi-Call Pays for Itself

Research consensus (Anthropic, academic papers, production case studies):

| Signal | Single Call | Multi-Call |
|--------|-----------|------------|
| Catalog size | <50 metrics | >60 metrics |
| Eval pass rate | >90% | Degrading with catalog growth |
| Prompt token count | <8K | >10K with mixed retrieval+generation |
| Post-processing correction rate | <5% | >10% |
| Chart type complexity | Uniform | Highly varied (KPI vs pivot vs variance) |

---

## Implementation Roadmap

### Phase 1: Haiku Default + Catalog Compression (Week 1)

1. Update edge function: change model from `claude-sonnet-4-6` to `claude-haiku-4-5`
2. Compress `buildMetricContext()` output format to match eval test compact format
3. Run full eval suite — establish Haiku baseline
4. Fix any Haiku-specific failures with targeted prompt changes
5. Deploy and monitor production error rate for 1 week

**Exit criteria:** Haiku pass rate >=50/56 on eval suite, production error rate <5%.

### Phase 2: Router + Expert Split (When Catalog Hits ~60 Metrics)

1. Write Router prompt (~30 lines) and 5 Expert prompts (~40 lines each)
2. Add eval tests for router accuracy (correct intent classification)
3. Implement 2-call flow in edge function with model escalation logic
4. Run full eval suite — must match or beat Phase 1 baseline
5. Add catalog scaling stress test (50 → 80 → 120 metrics)

**Exit criteria:** Pass rate maintained at scale, p95 latency <1200ms.

### Phase 3: Server-Side Validator (Only If Needed)

1. Move deterministic validation from client to edge function
2. Add retry-with-context logic (max 1 retry)
3. Add monitoring: validation failure rate, retry rate, retry success rate
4. Run eval suite with intentionally degraded expert prompts to test recovery

**Exit criteria:** Retry recovers >80% of validation failures.

---

## What NOT to Build

1. **Separate Chatter agent.** Conversational context is already handled. A separate agent
   adds latency and state sync complexity for no proven benefit.

2. **LLM-based validator.** Deterministic checks are faster, cheaper, and more reliable for
   structured JSON validation. LLM-as-judge is for open-ended quality assessment, not
   schema conformance.

3. **Framework dependency (LangGraph, CrewAI, etc.).** The entire multi-call flow is ~30
   lines of TypeScript in the edge function. A framework adds bundle size, learning curve,
   and abstraction overhead for a 2-call pipeline.

4. **Parallel expert calls.** The router must complete before the expert can start (it
   determines which expert to use). There is no parallelism opportunity in a 2-step pipeline.

5. **Fine-tuned models.** At 80 metrics and ~56 eval tests, the data volume does not justify
   fine-tuning. Prompt engineering + routing covers the need.

---

## References

- [Anthropic: Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic: How We Built Our Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic: Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Multi-Agent Orchestration Economics: When Single Agents Win](https://iterathon.tech/blog/multi-agent-orchestration-economics-single-vs-multi-2026)
- [Claude Sonnet 4.6 vs Haiku 4.5 Model Selection Guide](https://claudelab.net/en/articles/claude-ai/claude-sonnet-46-vs-haiku-45-model-selection-guide)
- [Optimizing Latency and Cost in Multi-Agent Systems](https://www.hockeystack.com/applied-ai/optimizing-latency-and-cost-in-multi-agent-systems)
- [Single-agent or Multi-agent Systems? Why Not Both? (arXiv 2505.18286)](https://arxiv.org/pdf/2505.18286)
