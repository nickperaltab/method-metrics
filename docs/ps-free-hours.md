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
| Open case | A `Consulting Request` case on the account still open at the call date |
| Trial FH | The account had no paying SaaS MRR as of the call — see the MRR lag note below |
| Agreements sent | Every PPU/Dedicated row in `call_prep.ps_proposals` a consultant created in the period (`created_date`, `assigned_to`) |
| After trial FH | A trial Free Hour where **that same consultant** sent an agreement within 90 days |
| Time to sign | Days from the Free Hour to the `accepted_date` on a PPU/Dedicated agreement |
| Rate within 30 days | Conversions inside 30 days ÷ calls at least 30 days old |

**Open-case accounts stay in the delivered count but sit outside the rate.** An
account already mid-engagement when the call happened cannot be opened by it —
the hours it bills next were already committed.

This is deliberately **not** "has ever bought PS work", which is what the screen
used until Sept 2026. An account whose consulting case closed a year ago is a
real opportunity again, and excluding it discarded **31 conversions in 2026
alone** (eligible 546 → 649, converted 164 → 199). The blended rate barely moved
— ~30% either way — so the old rule was costing attribution, not accuracy.

### Agreements: the proposal desk

Only **31%** of agreements that follow a Free Hour are written by the consultant
who delivered it (77 of 252 in 2026). Shane Li, Phuong Phan, Harsh Patel, Urja
Rao and Rafiya Syed write proposals but never deliver Free Hours — there is a
proposal desk. So two different questions:

- **"Agr. sent"** — everything that consultant wrote. Their own output.
- **"After trial FH"** — agreements they sent following their own trial Free
  Hour. Their follow-through, and the desk's work is excluded.

A per-account "did anyone send one" number would be a third figure again, and
much higher. Do not read the same-rep column as the funnel step.

Note that an agreement is close to a **precondition** for billed PPU/Dedicated
work, so the agreement-sent split (60.8% vs 5.9% on existing customers) is a
funnel step, not a cause. Do not present it as one.

### There is no "did the rep email them" metric

`customer_signals.free_hour_journey.email_touches` exists but is **100% NULL**
on all 1,287 rows, and that table stops at 2026-07-13. `revenue.Activity` has
the email types but cannot be attributed to an account:
`Free Consulting Follow Up` carries `MethodCompanyAccountRecordID` on **0 of 656**
rows, `Email Outgoing` on 264 of 17,139, and the `Contacts` bridge fails too
(`Contacts` has no account FK, and its `EntityRecordID` matched 2 of 633
follow-ups). Agreement-sent is the available proxy. Do not re-derive this.

## Four traps in the upstream data

**3. SaaS MRR is keyed on `entity_record_id`, not `account_record_id`.** The
Free Hour grain carries `account_record_id`; `revenue.int_customer_mrr` is keyed
on `EntityRecordID`. Joining MRR straight onto `account_record_id` returns rows
and looks fine but matches **25 of 663** — under 4%. Bridge through
`revenue.int_accounts`, which carries both (663/663, then 654/663 to MRR).

**4. `int_customer_mrr` publishes a month in arrears.** Its newest month is the
*previous* one, so joining on the call's own month makes every Free Hour in the
current month read as a trial — an error that grows all month. `buildFreeHoursSql`
takes the latest MRR month **at or before** the call instead, which also covers
accounts with a gap in their MRR history. BigQuery will not de-correlate a
"latest row" subquery across tables here, hence the `ROW_NUMBER()` window; check
`COUNT(DISTINCT fh_id)` still equals `COUNT(*)` if you touch that join.

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
