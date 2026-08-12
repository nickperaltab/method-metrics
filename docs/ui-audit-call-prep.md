# Call Prep — UI audit ledger

**Scope:** `#/call-prep`, `#/call-prep/:consultant`, the week strip,
`#/call-prep/account/:recordId`, and the PS nav entry.
**Auditor:** `.claude/skills/call-prep-ui-audit/SKILL.md`

This is a ledger, not a one-off report. Finding ids are stable across runs — a
later sweep marks an id fixed rather than renumbering.

---

## Status

| Id | Finding | Severity | Status | Run |
|---|---|---|---|---|
| CP-01 | Week strip days have no structure in the accessibility tree | critical | ✅ fixed | 2026-08-10 |
| CP-02 | An empty day renders as `—` | major | ✅ fixed | 2026-08-10 |
| CP-03 | An empty week looks like a broken calendar | major | ✅ fixed | 2026-08-10 |
| CP-04 | "Loading **your** calendar" shown on a teammate's book | major | ✅ fixed | 2026-08-10 |
| CP-05 | Search and tab filtering change row counts silently | major | ✅ fixed | 2026-08-10 |
| CP-06 | Calendar narrates *how* it matched an account | minor | ✅ fixed | 2026-08-10 |
| CP-07 | Strip footer reads as system vocabulary | minor | ✅ fixed | 2026-08-10 |
| CP-08 | Raw lowercase `sync_status` from BigQuery reaches the screen | minor | ✅ fixed | 2026-08-10 |
| CP-09 | Book page `<h1>` is a bare name with no context | minor | ✅ fixed | 2026-08-10 |
| CP-10 | **Today's calls don't show which ones have no prep written** | major | ✅ fixed | 2026-08-10 |
| CP-11 | **Account trouble isn't visible next to the call** | major | ✅ fixed | 2026-08-10 |
| CP-12 | **No attention count above the fold** | major | ✅ fixed | 2026-08-10 |
| CP-13 | Account brief has eight sections and zero `<h2>`s | critical | ✅ fixed | 2026-08-10 (run 2) |
| CP-14 | Toolbar navigation built from `<button onClick>` | major | ✅ fixed | 2026-08-10 (run 2) |
| CP-15 | Entry animation ignores `prefers-reduced-motion` | major | ✅ fixed | 2026-08-10 (run 2) |
| CP-16 | Anchor offset is a fixed 110px inside a zoomable container | minor | ✅ fixed | 2026-08-10 (run 2) |
| CP-17 | "click to read notes →" repeated on every expandable row | major | ✅ fixed | 2026-08-10 (run 2) |
| CP-18 | Details section repeats 12 of its 14 fields from elsewhere | major | ✅ fixed | 2026-08-10 (run 2) |
| CP-19 | Jump nav never shows which section you're in | major | ✅ fixed | 2026-08-10 (run 2) |
| CP-20 | Fit badge renders the raw lowercase enum | minor | ✅ fixed | 2026-08-10 (run 2) |
| CP-21 | Activities capped at 10 with no disclosure | minor | ✅ fixed | 2026-08-10 (run 2) |
| CP-22 | Case badges set at 9.5px | minor | ✅ fixed | 2026-08-10 (run 2) |
| CP-23 | Snapshot-date select is the only unlabelled control | minor | ✅ fixed | 2026-08-10 (run 2) |
| CP-24 | "source document" link doesn't read as a link | minor | ✅ fixed | 2026-08-10 (run 2) |

---

## Run 2 — `CallPrepAccount.jsx`, second pass

Run 1 called this screen "the strongest in the area" on the strength of its
accessibility *attributes* — `aria-label`s, an `sr-only` caption, a documented
contrast palette. That was an audit of the markup's good intentions, not of the
interface. Re-read as a screen, it has one critical fault and five majors.

Two things run 1 worried about turned out fine and are recorded so a later run
doesn't re-litigate them: **Fraunces is loaded properly** (`builder/index.html:7`
requests all three families), and **activities are capped in SQL**
(`ACTIVITY_LIMIT = 10`) rather than rendering unbounded.

### CP-13 · critical · `CallPrepAccount.jsx` (8 sites)

Every section title — Top 3, Why today, Opportunity fit, DEP signals, Time
tracking, Cases, Recent activities, Details — plus all three rail-card titles was
a `<div style={s.bodyLabel}>`. The document had exactly one heading (`<h1>`, the
account name) and nothing below it.

Heading navigation is the primary way screen-reader users move through a long
document. On the longest screen in the product it did not exist. This is the
finding that most directly contradicts run 1's verdict.

Fix: `<h2>` throughout, with `margin: '0 0 14px'` on `bodyLabel` so the visual
result is byte-identical.

### CP-14 · major · `CallPrepAccount.jsx` toolbar

Current: `<button onClick={() => navigate('/call-prep/…')}>← Brandon's book</button>`

Both crumbs navigate but are buttons, so middle-click, cmd-click, "open in new
tab" and "copy link address" all fail, and nothing appears in the status bar on
hover. `docs/ui-audit-2026-08-05.md` fixed this exact pattern on the tracker
(C4, "9 navigate-only buttons converted to links"); it came back here.

Fix: `<Link to=…>`.

### CP-15 · major · `CallPrepAccount.jsx` CSS block

`.cp-rise` animates the kicker, title and identity block on every load, with
staggered 40ms/90ms delays and a `scroll-behavior: smooth` jump nav. Neither
honours `prefers-reduced-motion`, which for a vestibular-sensitive reader is the
difference between usable and not.

Fix: a `@media (prefers-reduced-motion: reduce)` block disabling the animation,
the caret transition, and smooth scrolling.

### CP-17 · major · `CallPrepAccount.jsx` (2 sites)

Current: `click to read notes →`

Rendered under **every** session and activity that has notes — up to 16 times on
one screen. Three faults at once: it instructs the reader how to operate the UI
rather than showing an affordance; it's the same string repeated as visual noise;
and the arrow points right while the content expands downward.

The row is already a `<button aria-expanded>`, so the accessible behaviour was
there and only the visual affordance was missing.

Fix: delete the string. Add a `▸` caret that rotates to `▾` when open — the
standard disclosure affordance, one glyph, correct direction.

### CP-18 · major · `CallPrepAccount.jsx` Details section

The Details grid held 14 fields. **Twelve of them already appear higher on the
same page**: Signup date and Account age and DEP enrolled in the identity block;
Time tracked, Sessions and Last session in the stat strip; Open cases, Sync
status, Sync failures and Parent entity in the Snapshot card; Industry and
Operating model in the Business context card.

So the section cost a screenful of scrolling to repeat what the reader had
already passed, and pushed the genuinely unique fields out of sight.

Fix: cut to the two fields nothing else shows — Closed cases (90d) and Contact
phone. If a 2-item Details section reads thin, the alternative is deleting the
section and moving both fields into the Snapshot card; flagging rather than
deciding, since the section order deliberately mirrors the `/call-prep` Google Doc.

### CP-19 · major · `CallPrepAccount.jsx` jump nav

Eight sticky chips that scroll you somewhere and never indicate where you are.
On a document this long the nav is the map, and the map had no "you are here".

Fix: an `IntersectionObserver` scroll spy highlighting the current chip, with
`aria-current` so it isn't colour-only. Section list moved into one `SECTIONS`
constant shared by the nav and the spy, so a section can't appear in one and not
the other.

### CP-16 · minor · `CallPrepAccount.jsx`

`section { scrollMarginTop: 110 }` is a fixed value, but the sheet renders inside
`zoom: {zoom/100}`. The sticky nav's own offset is zoom-corrected
(`TOOLBAR_H / (zoom/100)`); the anchor offset wasn't, so at 150% zoom a jump
overshot and left a gap above the heading.

Fix: derive it — `navTop + NAV_H` — so both follow zoom together.

### CP-20 · minor · `CallPrepAccount.jsx` fit table

Current: `{row.fit ?? 'unknown'}` → renders `strong`, `moderate`, `current`, `none`

Raw BigQuery enum on screen, and `none` reads as missing data rather than as an
assessment that the motion doesn't fit.

Replacement: `Strong` / `Moderate` / `Current` / `No fit` / `Unknown`.

### CP-21 · minor · `CallPrepAccount.jsx` activities

`ACTIVITY_LIMIT = 10` is applied in SQL and never mentioned on screen, while the
sessions list right above it discloses its cap ("Show all 23 sessions"). The repo
standard is no silent caps.

Fix: `Latest 10 activities.` when the cap is hit.

### CP-22 · minor · `CallPrepAccount.jsx:216`

`caseBadge` set at `fontSize: 9.5`. Below the readable floor, and the smallest
type in the product.

Fix: 10.5, matching the other badges.

### CP-23 · minor · `CallPrepAccount.jsx` toolbar

The snapshot-date `<select>` carried `aria-label="Snapshot date"` but no visible
label, sitting beside Width and Zoom which both have visible labels. A bare date
dropdown gives no clue what changing it does.

Fix: visible `Snapshot` label in the established `controlLabel` style, wired with
`aria-labelledby`.

### CP-24 · minor · `CallPrepAccount.jsx:242`

`sourceLink` was `MUTE` text with a `RULE`-coloured bottom border — muted grey on
grey, reading as body text rather than the only outbound link on the page.

Fix: `ACCENT` text with an `ACCENT` border.

---

## Lens 1 — AI slop

The copy here is in much better shape than the project tracker was. The em-dash
justification pattern that dominated `docs/ui-audit-2026-08-05.md` appears **zero**
times across these five files. Two findings, both minor.

### CP-06 · minor · `WeekStrip.jsx:237`

Current: `Matched on attendee domain`

Naming the mechanism teaches the reader how the matcher works, which is the
call-prep flavour of "teaching the data model". What the rep needs is that the
link is uncertain, not which signal produced it. The reasoning belongs in the
code comment that already sits above `matchEvent`.

Replacement: `Best guess`

### CP-07 · minor · `WeekStrip.jsx:251-252`

Current: `12 events, 4 matched to an account.`

"Matched to an account" is the matcher's vocabulary, not a consultant's. A rep
thinks in calls, not matches.

Replacement: `12 events · 4 linked to an account`

---

## Lens 2 — Readability and access

### CP-01 · critical · `WeekStrip.jsx:213-220`

The week is a `display: grid` of `<div>`s. Every day column, its date, and its
events are visually distinct and structurally identical — a screen-reader user
gets one flat run of text with no way to tell Tuesday's calls from Wednesday's.
The visible `Mon Aug 10` heading is a styled `<div>`, invisible to assistive tech
as a label.

Fix: give each column `role="group"` with an `aria-label` carrying the full date,
so the day name enters the accessibility tree without changing the visual design
or inventing a heading level that would break the page's hierarchy.

### CP-02 · major · `WeekStrip.jsx:218`

Current: `—`

An em dash is not an empty state. It reads aloud as "em dash" and carries no
meaning visually either.

Replacement: `No events` (in the muted style already defined)

### CP-03 · major · `WeekStrip.jsx`

A week with no events at all renders five columns of `—` and no footer, which is
indistinguishable from a failed load. Loading and empty must be different states.

Fix: when the week has no events, render one line — `Nothing on the calendar this
week.` — instead of the column grid.

### CP-04 · major · `WeekStrip.jsx:205`

Current: `Loading your calendar…`

Wrong the moment a rep opens a teammate's book, which is now a supported path.
Every possessive on these screens has to hold in both cases.

Replacement: `Loading the calendar…`

### CP-05 · major · `CallPrep.jsx:132`, `CallPrepBook.jsx`

Both screens filter a table from a search box, and `CallPrepBook` also swaps the
whole table when a tab changes. The row count changes with no announcement, so a
screen-reader user has no idea whether typing narrowed anything.

Fix: a polite live region reporting the visible count, updated on every filter or
tab change.

### CP-08 · minor · `CallPrepBook.jsx:272`

Current: `{snap.syncStatus ?? '—'}`

`normalizeSnapshotRow` lowercases the BigQuery value, so the Sync column renders
`ok` / `failing`. That's the column's value, not a word anyone would write.

Fix: capitalise for display. Keep the stored value lowercase — comparisons
elsewhere depend on it.

### CP-09 · minor · `CallPrepBook.jsx:198`

Current: `<h1>{consultant}</h1>`

The page title is a bare person's name. Opened from a bookmark or a shared link,
nothing on screen says what the page is. `CallPrepAccount` already solves this
with a mono kicker above the title; this screen should match it.

Fix: add a `Call prep` kicker above the name, reusing the established pattern.

---

## Lens 3 — At a glance

The three findings that actually change how useful this screen is in the ninety
seconds before a call.

### CP-10 · major — which calls have no prep?

The week strip gives every account-matched event the same green **Prep** button
whether or not a brief was written for that day. The most actionable fact on the
screen — *this call has no prep* — is invisible, and the button leads to a stale
brief from some earlier date without saying so.

Fix: cross-reference each event against the prep history already loaded by
`CallPrepBook`. An event whose account has a snapshot on that day keeps the green
**Prep** button. One that doesn't, on today or later, gets a muted **Open**
button and a `no prep` chip. Past days are left alone — a missing prep on a call
that already happened is history, not a task.

### CP-11 · major — is this account in trouble right now?

`computeFlags` already derives sync failures, open cases and stale sessions per
account, and the Accounts tab shows them. The calendar — the thing a rep actually
looks at before a call — shows none of it, so walking into a call with a failing
sync is indistinguishable from a routine one.

Fix: surface the account's flags on the event card, capped at two so the card
stays skimmable, with a `+N` overflow marker.

### CP-12 · major — how much needs attention?

The Accounts tab sorts flagged rows first, which helps only after you've clicked
into it. There's no count anywhere above the fold.

Fix: a one-line summary above the tabs — `4 of 23 accounts need attention` — and
nothing when the number is zero, so a clean book stays clean.

---

## What's already good

- **`CallPrepAccount.jsx` has the best accessibility *plumbing*** in the area —
  contrast tokens carry their measured ratio in a comment, the fit table has an
  `sr-only` `<caption>` with `scope` on both axes, there's a real
  `:focus-visible` ring, and the zoom control is `aria-live`. Run 1 over-read
  that as the screen being sound; run 2 found a critical and five majors it had
  missed. **Good attributes are not the same as a good screen** — audit what
  renders, not what's declared.
- **No em-dash justifications anywhere.** The pattern that produced 20+ findings
  on the project tracker has not recurred here.
- **Caps are disclosed, never silent** — "Showing 50 of 214", "only the latest 500
  preps are loaded", and the hidden-events count on the strip.
- **Meaning is never carried by colour alone** — flags pair amber with the word,
  `ok` is a word, the `You` chip is a word.
