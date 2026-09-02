# PS Free Hours (`/free-hours`)

How many Free Hours the PS team delivered, and how many turned into paid
Pay-Per-Use or Dedicated work. `builder/src/lib/freeHours.js` +
`builder/src/pages/FreeHours.jsx`, reading the BigQuery view
`project-for-method-dw.call_prep.free_hour_outcomes`.

Every number is deterministic — billed time in, billed time out. Nothing on this
screen depends on how a call was scored or judged.

## Definitions

| Term on screen | What it actually is |
|---|---|
| Free Hour delivered | A consultant's own logged `Free` time entry with `hours > 0` |
| Led to paid work | The first **billed** `Pay-per-use` or `Dedicated` time entry on that account, any time after the Free Hour |
| Already paying | The account was already buying PS work before the call |
| Time to sign | Days from the Free Hour to the `AcceptedDate` on a PPU/Dedicated agreement |
| Rate within 30 days | Conversions inside 30 days ÷ calls at least 30 days old |

**Already-paying accounts stay in the delivered count but sit outside the rate.**
Their later billed hours are business as usual, not something the Free Hour
produced. Counting them would inflate the rate; hiding them would understate how
many Free Hours the team actually ran.

## Two traps in the upstream data

**1. Do not count Free Hours from `revenue.Activity`.** It stores
`AI Summary - Free Hour` in two shapes:

- typed rows — `ActivityTypeRecordID = 126`, carrying account, date and consultant
- shadow rows — `ActivityTypeRecordID`, `CreatedDate`, `MethodCompanyAccountRecordID`
  and `AssignedToRecordID` all **NULL**, with only `RecordID`, `DueDateStart` and
  `EntityRecordID` set

The two sets are disjoint and together reconcile exactly to Method's own counts.
Filtering on `ActivityTypeRecordID = 126` therefore drops up to **100%** of a
month — April 2026 returns zero against 71 real sessions. The `Free` time entry
in `int_consultant_work` is complete in every month and carries account,
consultant and date, which is why the view is built on it instead.

Do not try to repair the shadow rows by joining `EntityRecordID` either —
`Account.EntityRecordID` is not unique (up to 434 accounts share one) and the
join fans out to the wrong customer.

**2. `hours > 0` is load-bearing.** A time entry can be created and abandoned
with zero hours, no case, no activity and empty notes. Three such rows exist in
2026 and they all land in recent months, so without the filter a consultant's
current-month count reads one or two too high.

## Refreshing

- **`call_prep.free_hour_outcomes` is a view**, so it needs no refresh — it
  reads through to `revenue.int_consultant_work` on every query.
- `revenue.int_consultant_work` is part of the warehouse build and trails live
  Method by roughly six hours.
- `call_prep.ps_proposals` — the agreement signature dates behind *time to
  sign* — is a **table**, synced daily from the Alocet MCP by the routine
  `PS Proposal Sync — Daily` (`trig_01LvqeY1DmXcMeshPh6atdyw`, 11:30 UTC).
  It is the only piece of this screen with a refresh job. If *time to sign*
  goes stale while everything else moves, check that routine first.

## Access

Reads the `call_prep` dataset over the same BigQuery OAuth as Call Prep and
Handoffs. A viewer without the grant sees the shared 403 message.

## If the PS-only shell lands

`/free-hours` is registered in `App.jsx` and `PS_ITEMS` in `Sidebar.jsx`. The
`role: 'ps'` shell (`isPsPath`, `PsRoutes`, `PS_PATH_PREFIXES`) is not on `main`
yet. When it merges, add `/free-hours` to `PS_PATH_PREFIXES` in
`builder/src/lib/permissions.js` and to `PsRoutes` in `App.jsx`, or the nav link
will redirect PS users back to Call Prep.
