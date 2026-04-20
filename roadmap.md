# Method Metrics — Roadmap

**Last updated:** April 2026
**Owner:** Nic Peralta

---

## Strategic Context

The team is getting more access to Claude and BigQuery. That's good — but without verified definitions, people get confident wrong answers. The metric registry is the guardrail layer. Everything else builds on top of it.

**Core thesis:** Ship verified definitions to the people already doing the work, solve real problems they've told us about, and let demand pull us toward what to build next.

---

## Now — In Progress

**Goal: Get verified metrics into the hands of people already using data.**

| Initiative | What it is | Who it's for | Status |
|---|---|---|---|
| Marketing metrics via shared Claude skill | A skill backed by the metric registry that lets marketing pull verified numbers, run analysis, and explore data — without raw BQ access or bugging Nic | Marketing team (actively in BQ today without guardrails) | Building |
| Solve Michelle & Nelson's problems | Michelle: confusing labels → clear definitions via skill. Nelson: copy-paste exports → automated export | Michelle, Nelson | Scoping |
| Continue metric verification | Keep verifying metrics against Excel source of truth, expanding from 13 verified today | Nic, Justin | Ongoing |

**Why this order:** Marketing is already in BQ without proper definitions. That's the most urgent risk. Michelle and Nelson have given us concrete pain points — those are quick wins that prove the value.

---

## Next — 1-2 Months

**Goal: Expand to revenue metrics and give Sarah what she's been asking for.**

| Initiative | What it is | Who it's for | Status |
|---|---|---|---|
| Revenue metrics via shared Claude skill | Same pattern as marketing — verified revenue/retention definitions accessible through Claude | Sarah, leadership | Not Started |
| Dashboards for Sarah | Hardcoded dashboards built on the new stack. I build these 10x faster now — no Looker dependency | Sarah | Not Started |
| AI chart builder — limited release | Open the builder to a few users. Flexible in what you can build, restricted to verified metrics only. Can't write SQL from scratch or invent definitions | Marketing, Sarah (testing) | Alpha exists |

**Why this order:** Sarah has been the most vocal about wanting more dashboards. Revenue metrics are the most verified family we have (13 queries, cell-for-cell match). The chart builder gets a soft release to see if there's real pull for self-serve.

---

## Later — 3-6 Months

**Goal: Let demand tell us what's next.**

| Initiative | What it is | Who it's for | Status |
|---|---|---|---|
| Expand data coverage | 49 metrics are derivable now from existing BQ data. 102 more need data ingestion (P&L, forecast, marketing attribution, healthscore) | Whole org | Not Started |
| Rebuild Looker scorecard | Rebuild the existing scorecard on the new platform. By this point every metric in it is already verified through usage | Leadership | Not Started |
| AI chart builder — broader rollout | If the limited release shows people want self-serve, open it up. If not, skills + Nic building dashboards is the product | TBD based on feedback | Not Started |

**Why later:** There's no rush to replace the Looker scorecard — it exists and works, even if imperfect. The scorecard rebuild is easier once metrics are verified through real usage, not just against a spreadsheet. Data coverage expansion depends on what people actually ask for once they start using the skills.

---

## What We're Explicitly NOT Doing Right Now

- **Rebuilding the Looker scorecard first.** It's the end state, not the starting point. Rebuilding it now means weeks on formatting before we know the numbers are right.
- **Shipping the AI chart builder broadly.** We don't have a confirmed user base for self-serve yet. Let the limited release tell us.
- **Ingesting new data sources.** Until people are using what we already have, adding more data is premature.

---

## Open Questions

- **Who actually wants self-serve charting?** Marketing is in BQ — do they want a better tool, or do they just want the right numbers? The limited release will answer this.
- **What are the real pain points beyond Michelle/Nelson/Sarah?** Need to talk to more people before committing to Phase 2 scope.
- **What does Justin think "shipped" means?** Is it "people are using verified metrics through skills" or "the Looker scorecard is rebuilt"? Need to align on this.

---

## Build vs. Buy Reference

This replaces tooling that would cost $50K–$150K+/yr off the shelf. Our incremental cost is ~$0.

| Tool | Annual Cost |
|---|---|
| Looker | $50K – $150K+ |
| Tableau | $15K – $30K+ |
| Sigma Computing | $17K – $130K+ |
| Method Metrics | ~$0 (Supabase free tier, BQ we already pay for, GitHub Pages) |
