---
name: ui-review
description: Review UI code for AI-slop copy and UX/accessibility violations. Use when writing or reviewing any user-facing text, screen, form or table in builder/ — and before shipping a new screen.
---

# UI review: copy and UX standards

Two failure modes this catches. **AI-slop copy**: text that is technically accurate,
grammatically fine, and exhausting to read. **UX violations**: patterns that fail
usability or accessibility standards regardless of how they read.

Apply to any user-facing string: labels, hints, empty states, buttons, banners,
errors, section subtitles.

---

## Part 1 — AI-slop copy

### The tells, ranked by how much they hurt

**1. The em-dash justification.** A statement, an em dash, then the reasoning
nobody asked for. This is the single most common slop pattern in this codebase.

> ❌ The customer can't be changed after creation — create a new project instead, so
> the delivered/promised history stays with the right account.
>
> ✅ Customer can't be changed after creation.

Of the major models tested in 2026, **only Claude used em dashes more often than
human writers**, and "more verbose with caveats" is its documented signature. If
you are an LLM writing UI copy, assume you are doing this and cut it.

**2. Explaining the rationale in the UI.** Design reasoning belongs in a code
comment or a doc, not in the interface. The user wants to know *what*, not *why you
built it that way*.

> ❌ Deliberately not part of the ratio — a project can be efficient per task and
> still blow the quote.
>
> ✅ Not included in the efficiency score.

**3. Defensive hedging and self-justification.** "Deliberately", "on purpose",
"honest", "genuinely", "rather than", "which is why". These defend a decision to a
reader who never questioned it.

> ❌ A promised item still open counts against this — an unshipped promise and a
> late one look the same to the customer.
>
> ✅ Open promises count as missed.

**4. Teaching the data model.** Table names, column names, join keys and row counts
in user-facing text. The user is a consultant, not a DBA.

> ❌ `customer_signals.call_summaries` only covers a single backfilled day, so most
> calls won't have one.
>
> ✅ No summary for this call.  *(put the coverage caveat in the docs)*

**5. The "X, not Y" construction.** "Ranked worst-first, not by recency."
"Reformats only: it never rewrites." Pick the positive half.

**6. Nested clauses and stacked qualifiers.** If a hint needs two commas and a dash
to survive, it's a doc paragraph wearing a hint's clothes.

**7. Mechanical parallelism.** Three sibling sentences with identical rhythm, or
every empty state opening with "No X yet —".

### Length limits (from microcopy research)

| Element | Limit |
|---|---|
| Button | 1–5 words, ideally 2–3 |
| Field label | 1–4 words, no sentence |
| Inline hint | **1 sentence, ≤ 15 words** |
| Error | Problem + fix, 5–15 words inline |
| Empty state | 1 sentence + 1 action |
| Section subtitle | 1 sentence or delete it |
| Tooltip | 5–20 words |

Microcopy is defined as **fewer than three sentences**. Anything longer isn't
microcopy — it's documentation in the wrong place.

### The rewrite test

For every string, ask in order:

1. **Would a busy consultant read this, or skip it?** If skip → cut it.
2. **Does it say what to do, or why we built it?** Why → move to a comment.
3. **Can I delete half the words without losing meaning?** Then do.
4. **Does the reasoning matter to *anyone* using the screen?** If only to the
   author → code comment.
5. **Would a senior product designer sign off, or wince?**

**Comments are free. UI text is not.** Move the reasoning into the code; keep the
comment quality high. This skill is not an argument for undocumented code.

---

## Part 2 — UX and accessibility

### Measured contrast failures in this codebase

Computed against WCAG 2.1 AA (4.5:1 for text under 18.66px, 3:1 for large/bold).
Everything below **fails** at the size it's used:

| Token | Ratio on white | Used for |
|---|---|---|
| `#b6bcc4` | **1.91** | upcoming phase names, signal dates |
| `#9ca3af` | **2.54** | completed-item rows |
| `#8a9099` | **3.22** | every uppercase mono label, muted text, due dates |
| `#059669` on white | **3.77** | links, and white text on the primary button |
| `#059669` on `#ecfdf5` | **3.58** | "good" chips |
| `#6b7280` | 4.83 | passes |

Fixes: darken `#8a9099` → `#6b7280`; `#b6bcc4` → `#8a9099` *(only if the text is
decorative, otherwise `#6b7280`)*; `#9ca3af` → `#6b7280`; use `#047857` for green
text and small green chips. Never encode meaning in colour alone — pair with a
word or icon.

### Interaction checklist

- **Clickable table rows must be keyboard-reachable.** `onClick` on a `<tr>` is
  mouse-only: no tab stop, no Enter, no focus ring, invisible to screen readers.
  Put a real `<a>`/`<button>` in the primary cell, or add
  `tabIndex={0}` + `onKeyDown` (Enter/Space) + `role="button"` + a visible
  `:focus-visible` ring at ≥3:1.
- **Never remove focus outlines** without replacing them.
- **Disabled buttons need a reason.** A greyed control with no explanation reads as
  broken; say why, or hide it.
- **Destructive actions confirm.** Especially anything that deletes a logged entry.
- **Tables need `<th scope>`** and a caption or `aria-label`; header-only `<thead>`
  is not enough for a screen reader.
- **Long lists paginate** past ~50 rows.
- **Loading and empty states are different states.** "No results" while still
  fetching is a lie.
- **Filter state must be visible** and reversible; if a filter hides everything, say
  which filter did it.
- **Numbers need units and alignment** — right-align numerics, use tabular figures,
  never render `—` and `0` to mean the same thing.
- **Don't reflow on hover.** Layout that shifts under the cursor is unusable.

### Form checklist

- Labels above inputs, always visible (no placeholder-as-label).
- Validate on blur or submit, not per keystroke; keep the error next to the field.
- Required vs optional marked once, consistently.
- Primary action first, cancel second, both reachable without scrolling on a laptop.
- Date inputs: say the format or use a picker.
- Preserve entered values on a failed submit.

### Consistency checklist

Sweep these across screens, since drift is invisible file-by-file:

- One term per concept. Not "rep"/"owner"/"consultant" for the same person.
- Sentence case for labels and buttons; don't mix Title Case in.
- Same word for the same action everywhere ("Edit", not "Edit"/"Change"/"Update").
- Same date format everywhere; relative dates where recency is the point.
- Same empty-state shape: what's missing + what to do.

---

## How to report

Group by severity, and for each finding give: file:line, the current string, why
it fails (name the tell or the standard), and **the exact replacement text**. A
finding without a rewrite is an opinion, not a fix.

Sources: [NN/g microcopy limits via TypeCount](https://typecount.com/blog/microcopy-ux-writing-guide) ·
[AI writing tells (Fast Company / Economist report)](https://www.fastcompany.com/91584243/how-to-identify-ai-generated-writing-viral-report-has-surprising-new-clues-economist) ·
[AI editing checklist (Proofed)](https://proofed.com/knowledge-hub/ai-editing-checklist-how-to-spot-and-fix-ai-writing-patterns/) ·
[W3C WAI tables tutorial](https://www.w3.org/WAI/tutorials/tables/) ·
[Keyboard patterns for complex widgets (UXPin)](https://www.uxpin.com/studio/blog/keyboard-navigation-patterns-complex-widgets/)
