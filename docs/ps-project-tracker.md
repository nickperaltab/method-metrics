# PS project tracker (`/projects`)

Delivery tracking for PS implementation projects: a board over all your accounts,
a per-project view with a work log, and delivered-vs-promised ratings that roll up
per task, per project, per account and per rep.

**Status: UI complete, no shared backing store.** Every screen and flow works,
but only against local sample data — see "Backing store decision". That's why
`/projects` is **not in the nav** outside mock mode.

```bash
npm run dev:mock     # then open the Projects link in the top bar
```

## Screens

| Route | What it is |
|---|---|
| `/projects` | Board with three views: **Board**, **By account**, **By rep** |
| `/projects/new` | Create a project — customer picker, title, owner |
| `/projects/:projectId` | Detail: lifecycle, efficiency, work items, work log, activity |
| `/projects/:projectId/edit` | Edit, including owner reassignment + handoff |

### `/projects` — three views, one dataset

The same rows answer three different questions, so there are three views rather
than three screens:

- **Board** — "what should I do next". Ranked **worst-first**: blocked → at risk →
  most overdue items → nearest target date. Sorting by last activity buries a
  blocked project under whichever account got touched that morning.
- **By account** — "how is this customer doing". One card per account with its
  projects nested, account-level hours efficiency and reliability, and a link
  through to that account's call-prep brief.
- **By rep** — "how is the team doing". Per-rep totals: active projects, at risk,
  open/overdue items, promised vs logged vs billable hours, and both ratings.

Filters (status chips, phase, owner) apply to all three, and the stat row
re-scopes to the filtered set. **"Mine"** reuses `consultantPatternFromEmail()`
from `psOverview.js`: consultant names in PS data are inconsistent
(`Brandon Saltzman` *and* `B. Saltzman`), so it matches first-initial + last name
off the signed-in address rather than an exact string.

### `/projects/:projectId` — the detail

Ordered the way you'd brief someone: state → next action → risk → lifecycle →
delivered-vs-promised → open work → work log → history.

- **Lifecycle timeline** — Discovery → Design → Build → UAT → Go-live → Handoff,
  dated from the project's `Phase change` events. A phase with no event still
  renders (dateless); real projects skip phases, and hiding the step would make
  the timeline lie.
- **Work items** — sorted overdue → open → done, filterable by open/all and type.
  Inline add/edit, and a one-click Done/Reopen. `high`, `promised` and
  `case NNNN` badges; action-shaped statuses (`Ready for Follow-Up`,
  `Check Case Status`, `New Intake`) are highlighted.
- **Work log** — the sub-layer under a project (below).
- **Activity** — every phase change, reassignment and handoff, newest first.

## The work log

One entry per session: date, hours, billable status, author, one-line summary,
optional link to a work item, and a **markdown** write-up.

Two affordances keep markdown from being a chore:

- The editor starts from a **section template** (What we did / Decisions /
  Blockers / Next steps).
- **"Tidy up"** reformats whatever got pasted in — Zoom's `•` bullets, bare
  `Next steps:` lines, ragged blank runs — into consistent markdown. It
  **reformats only: it never rewrites, summarises or reorders**, so every line you
  pasted is still there afterwards. `builder/tests/unit/markdown.test.js` holds it
  to that contract, including a "never loses a word" test and idempotency.

Markdown is parsed to a block AST in `lib/markdown.js` and rendered as React
elements by `components/projects/MarkdownBody.jsx`. **Nothing builds an HTML
string, so `dangerouslySetInnerHTML` is never involved** — notes get pasted
straight out of customer email, and that's the boundary that makes it safe. Link
hrefs are restricted to `http(s)` at parse time. No markdown dependency was added;
the supported subset is headings, lists, bold/italic/code, links, quotes, fenced
code and rules.

Entries linked to a work item drive that task's efficiency. Unlinked entries are
project-level work: they count toward the project's logged hours but are
deliberately **not** attributed to any task, and the panel says so when the
per-task rows don't sum to the headline.

## Efficiency: delivered vs promised

Two ratings, side by side, never blended — they fail for different reasons and one
number would hide which. Both live in `lib/efficiency.js`.

| Rating | Formula | Reads as |
|---|---|---|
| **Hours efficiency** | Σ per-task promised hours ÷ Σ logged hours | >100% = delivered inside the estimate |
| **Delivery reliability** | promised items closed on/before due date ÷ all promised items | 100% = every commitment kept |

Design decisions worth not re-litigating:

- **Three different hour numbers**, kept distinct: `project.hours_budget` (what
  the engagement was quoted at), `item.estimate_hours` (hours **promised** for a
  task), `work_log.hours` (hours **delivered**). Efficiency uses the last two.
  Budget is reported alongside as a separate commercial signal — a project can be
  efficient per task and still blow the quote.
- **A promised item still open counts against reliability.** From the customer's
  side, an unshipped promise and a late one are the same thing.
- **Rollups sum the parts, then divide once.** Averaging percentages would let a
  half-hour task swing the number as hard as a forty-hour one.
- **Null, not zero.** No hours logged yet, or nothing promised, renders `—`. A
  task with a promise and no logged time is "not started", not "0% efficient".
- **Thresholds are generous** (`≥95%` good, `≥75%` warn): PS estimates are
  estimates, and flagging a 95% as failure trains people to ignore the colour.

## Reassignment and handoffs

Changing the owner on the edit form offers to **create a handoff document**,
checked by default. It's a prompt rather than automatic so a correction (wrong
owner typed at creation) doesn't leave a bogus packet behind.

When it runs, the handoff captures the open and promised item counts **as they
stand at that moment** — plus flags for blocked / past-target / promised-work
outstanding — writes a `Handoff` entry to the project activity, and appears on the
existing `/handoffs` screens in `Draft`. The owner change is logged either way.

New reps can be added inline from the owner picker, so reassigning to someone who
isn't in the list yet doesn't dead-end.

## Draft schema

`lib/projects.js` names five tables that **do not exist yet**. The fixtures in
`builder/src/dev/fixtures/projects.js` are the proposal; keep the two in lockstep.

`call_prep.projects`
: `project_id`, `account_record_id`, `account_name`, `project_name`, `phase`,
  `status`, `owner`, `kickoff_date`, `target_date`, `go_live_date`, `next_action`,
  `next_action_due`, `last_activity_date`, `hours_budget`, `risk_note`,
  `jira_key`, `doc_link`, `handoff_needed`, `created_at`, `updated_at`

`call_prep.project_items`
: `item_id`, `project_id`, `account_record_id`, `title`, `item_type`, `status`,
  `owner`, `priority`, `created_date`, `due_date`, `closed_date`, `is_promised`,
  **`estimate_hours`**, `case_ref`, `notes`

`call_prep.project_work_log`
: `entry_id`, `project_id`, **`item_id` (nullable)**, `account_record_id`,
  `work_date`, `author`, `hours`, `billable`, `summary`, **`notes_md`**,
  `created_at`

`call_prep.project_events`
: `event_id`, `project_id`, `account_record_id`, `event_date`, `event_type`,
  `author`, `summary`, `to_phase` (set only on `Phase change` rows)

`call_prep.reps`
: `rep_id`, `name`, `email`, `role`, `is_active`

Counts and hour totals are **not stored** — `buildProjectsSql()` aggregates them
from the items and work-log tables in the same round trip, so the board isn't N+1
over a list of projects. `mockBq.js` mirrors those two CTEs; if you change one,
change both (`tests/unit/mockStore.test.js` cross-checks them).

The customer picker reads accounts from `call_prep.snapshots` — the closest thing
PS has to an account list.

Vocabularies live in `lib/projects.js`: `PROJECT_PHASES`, `PROJECT_STATUSES`,
`ITEM_STATUSES`, `ITEM_TYPES`. The item statuses deliberately reuse the vocabulary
the Google Sheets tracker/orchestrator dispatched agents on (`Ready for
Follow-Up`, `Check Case Status`, `New Intake`) so that automation can point at
this store later without a mapping layer.

## Backing store decision (open)

| Option | Consequence |
|---|---|
| BigQuery table written by a routine | Read-only screens; the create/edit/log-work flows would move into a Claude routine. Zero new infrastructure. |
| Supabase table | Everything built here keeps working as-is — the browser writes directly. Matches the abandoned `feat/ps-hub-screens` approach. |

**`lib/projectsStore.js` is the seam.** Pages import only from there; it reads via
the SQL fetchers and writes via the dev store. Swapping in a real store means
changing that one file — pages, forms, normalizers and the pure helpers
(`compareProjects`, `phaseTimeline`, `sortItems`, `projectEfficiency`, the
rollups) carry over untouched. Writes throw a `ReadOnlyStoreError` with a plain
explanation when there's no writable store, and the write path is behind a dynamic
import so the dev store and its fixtures stay out of the production bundle
entirely (verified: a production build contains no fixture strings).

Until a store is chosen:

- `/projects` stays out of `TopBar.jsx` (gated on `MOCK_MODE`).
- Edits are saved to **`localStorage`** (`method_metrics_mock_store`), so they
  survive a reload but are private to your browser. The board carries a "Sample
  data" banner with a **Reset sample data** button.
- The board's error state explains the missing table rather than showing a raw
  `BQ 404`.

## Tests

| File | Covers |
|---|---|
| `tests/unit/projects.test.js` | SQL builders → mock router → normalizers; rollup counts cross-checked against item rows; phase timeline |
| `tests/unit/efficiency.test.js` | Both ratings, every null/edge case, sum-then-divide rollups, on-time rules |
| `tests/unit/markdown.test.js` | Parser, `javascript:` link rejection, and the reformat-never-rewrite contract |
| `tests/unit/mockStore.test.js` | Every write flow, read back through the real SQL path; handoff capture; close-date stamping |
