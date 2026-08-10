---
name: call-prep-ui-audit
description: Audit the call-prep screens for AI-slop copy, readability and accessibility faults, and missed at-a-glance signals — then record the findings in a durable ledger so re-runs track what was fixed. Use before shipping a change to any /call-prep route, or to sweep the area.
---

# Call Prep — UI audit

Sweeps the `/call-prep` routes, scores them against three lenses, and writes the
result to **`docs/ui-audit-call-prep.md`**, which is a ledger, not a report: each
finding keeps a stable id across runs so a later sweep can mark it fixed instead
of renumbering everything.

## Scope

| Route | File |
|---|---|
| `#/call-prep` | `builder/src/pages/CallPrep.jsx` |
| `#/call-prep/:consultant` | `builder/src/pages/CallPrepBook.jsx` |
| — (week strip) | `builder/src/components/callprep/WeekStrip.jsx` |
| `#/call-prep/account/:recordId` | `builder/src/pages/CallPrepAccount.jsx` |
| nav entry | `builder/src/components/Sidebar.jsx` (PS section only) |

Data layers (`lib/callPrep.js`, `lib/googleCalendar.js`) are in scope only for
strings that reach the screen — error messages, labels, empty-state text.

## Method

1. **Load the `ui-review` skill first.** It holds the AI-slop tells, the microcopy
   length limits, and the measured contrast table for this codebase's tokens.
   Follow it rather than substituting taste.
2. Read every file in scope in full. Copy faults hide in the middle of long style
   objects.
3. Score against the three lenses below.
4. Merge into the ledger. Never renumber an existing finding.

## Lens 1 — AI slop

Per `ui-review`. The archetype in this repo is *statement, em dash, unrequested
reasoning*. Also: explaining the data model to a consultant, defensive hedging,
"X, not Y" constructions, and mechanical parallelism across sibling strings.

Call-prep-specific tell: **narrating the matcher**. The calendar guesses which
account an event belongs to. Explaining *how* it guessed is teaching the
mechanism; signalling *that it is a guess* is useful. Keep the second, cut the
first.

## Lens 2 — Readability and access

Per `ui-review`'s checklists, plus the faults this area is prone to:

- **A grid of days is not a list of days.** Columns built from `<div>`s give a
  screen-reader user no structure. Each day needs a name in the accessibility
  tree, not just on screen.
- **`—` is not an empty state.** It renders as "em dash" aloud and as noise
  visually. Say what is absent.
- **Filtering without announcement.** Every search box and tab on these screens
  changes a row count silently. Row counts need a polite live region.
- **Whose calendar / whose book.** Copy that says "your" is wrong the moment a
  rep opens a teammate's book. Check every possessive against both cases.
- **Raw warehouse values.** `sync_status` arrives lowercase from BigQuery. Ship
  what a person would write, not what the column holds.

## Lens 3 — At a glance

The one that matters most, and the one a generic audit misses. These screens are
read in the ninety seconds before a call. A finding here asks: **does the screen
answer the question the rep actually has, without a click?**

The standing questions, in priority order:

1. **Which of today's calls has no prep written?** A call with no brief is the
   single most actionable thing on the screen. If it looks identical to a
   prepped call, the screen has failed.
2. **Which accounts need attention, and how many?** Flags exist per row, but a
   count belongs above the fold.
3. **Is this account in trouble *right now*?** Sync failing or open cases should
   be visible next to the call, not one click into the brief.
4. **What am I walking into next?** Time, account, and a way in — in that order.

Score every proposed addition against density: this screen is skimmed, so a new
signal has to displace an existing one or earn its line. Reject anything that is
merely interesting.

## Output — the ledger

Write or update `docs/ui-audit-call-prep.md`:

- A **status table** at the top: id, one-line summary, status
  (`open` / `fixed` / `wont-fix`), and the run that changed it.
- Findings grouped by lens, each with: stable id, `file:line`, the current string
  **quoted verbatim**, the fault named, and **the exact replacement**. A finding
  with no replacement is an opinion — drop it.
- **What's already good**, 2–4 bullets, so the reader can calibrate.
- Do not pad to a quota. A short honest sweep beats a long one.

Severity: `critical` (misleads, or locks out keyboard/screen-reader users),
`major` (materially hurts a rep mid-call), `minor` (polish).
