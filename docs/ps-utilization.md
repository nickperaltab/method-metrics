# PS Utilization (`/utilization`)

Of the hours a PS consultant logged in a month, how many were real billable
work. `builder/src/lib/utilization.js` + `builder/src/pages/Utilization.jsx`,
reading `project-for-method-dw.revenue.TimeTracking` joined to `Entity` (who
logged it) and `Item` (which service line).

Sibling of `/free-hours` and deliberately on the same reporting window
(`2026-01-01`) and the same month-range filter, so the two screens can be read
against each other.

Every number is a sum of logged time entries. There is no capacity target and no
headcount denominator: utilization here is billable hours over hours logged,
which is how PS measures it.

## The five buckets

Every non-attendance time entry falls into exactly one of these. They are
disjoint and exhaustive, which is what makes the leaderboard auditable column by
column — the components always add up to `Logged`.

| Bucket | How it is identified |
|---|---|
| Billable | `MethodSupportType` of `Dedicated`, `Pay-per-use` or `Free`, with neither note marker below |
| Bankable | Note contains `UNUSED DEDICATED` |
| Discounted | Note matches `*** DISCOUNT (APPROVED\|REQUESTED) BY` |
| Internal projects | `MethodSupportType` is NULL and the service item is `Internal Project Hours` |
| Other internal | `MethodSupportType` is NULL, any other service item |

Derived from those:

| Term on screen | What it is |
|---|---|
| Billed | Dedicated + Pay-per-use as invoiced, **including** the bankable and discounted hours |
| Free | Free Hour sessions. Not invoiced, but counted as billable work |
| Logged | Everything above. Attendance entries excluded |
| Billable | Logged − bankable − discounted − internal |
| Utilization | Billable ÷ Logged |

## Hours come from `DurationHours` alone

`DurationHours` and `DurationMinutes` are the **same duration in two units**, not
hours plus a remainder. A two-hour entry stores `2.0` and `120.0`. Every one of
the 18,083 non-attendance entries in 2026 satisfies
`DurationMinutes = DurationHours * 60`, with no exceptions.

So `DurationHours + DurationMinutes / 60` returns **exactly twice** the real
figure. That expression is what `revenue.int_consultant_work` computes, and this
screen shipped with it on 2026-09-03 before the doubling was caught.

**`int_consultant_work` still carries the bug**, and so does
`call_prep.free_hour_outcomes`, which is built on it. That makes the Free Hours
screen's "Paid hrs" column and "Paid hours booked" tile 2x too high. Free Hour
counts and conversion rates there are unaffected, since they only test
`hours > 0`.

Sanity check for any future change: a PS consultant logs roughly **105-135 hours
a month**, near the 4.8 billable hours a day the PS time-tracking audit targets.
A per-consultant month over ~200 hours means the doubling is back.

## The two markers live in the notes

**Method has no field for either one.** This is the single most important thing
to know before changing the SQL.

`Unused Dedicated Time` and `Discounted Time` are both logged as ordinary
`HasBeenBilled` Dedicated or Pay-per-use entries against the customer's account,
on the `Offline Consulting Services` or `Meetings` service item. Nothing in
`MethodSupportType`, `BillableStatus`, `ItemName`, `ItemSalesDesc` or
`MethodSupportTypeTT` distinguishes them (all four were checked against the live
Method instance in Sept 2026 and return zero matches). Only the note does:

```
*** UNUSED DEDICATED TIME FOR AUGUST 2026 ***
*** DISCOUNT APPROVED BY <name> ***
```

**The discount marker must stay fenced.** 645 entries in 2026 contain the word
"discount" somewhere in a customer note ("add a discount box under pricelist",
"discount off MSRP / unit"). Only ~150 are approvals. Matching a bare `DISCOUNT`
quadruples the bucket and pulls scoping notes into a financial figure.

If Method ever adds a real field for either, replace the regex and delete this
section — the marker is a workaround, not a definition.

## Internal time is the entries with no support type

`MethodSupportType IS NULL` is Method's own marker for time that was never
against a customer, and in 2026 it maps exactly onto three service items:
`Internal On-boarding/Training` (993h), `Internal Project Hours` (410h) and
`Product Hours` (2.5h).

The service item is used only to split internal *projects* out of that group, not
to define it. Matching on a hardcoded item list instead would go stale the day
someone adds a new internal item, and the hours would silently move into the
billable bucket.

## The in-progress month is a ceiling

Bankable hours are posted at **month end** — nearly all of them on the last day.
Every closed month in 2026 carries 200–330 of them; the current month carries
zero until it closes.

So an open month shows its largest deduction missing, and its utilization is
the highest it will ever be. The screen says so in a banner, marks the month
with a grey dot on the chart, and repeats it in that month's hover card. Do not
compare an open month to a closed one.

## Why not `int_consultant_work`

The Free Hours screen reads that view; this one does not, for two reasons. It
drops `ItemServiceRecordID`, which is the only way to tell internal project time
from internal onboarding. And it computes hours as
`DurationHours + DurationMinutes / 60`, which doubles every entry.

The source and the row filters are otherwise the same (`IsDeleted` and
`IsAttendenceEntry` both false), so once the view's duration is fixed the two
screens will reconcile.

## Consultant identity

`consultant` is `Entity.EntityFullName` via `TimeTracking.EntityRecordID` — who
logged the entry. Not `AssignedTo`, which is null on a large share of rows.

## Mock mode

`npm run dev:mock` serves `UTILIZATION` from `builder/src/dev/fixtures/ps.js`
through the `utilization (consultant x month)` route in `mockBq.js`. That route
must stay **above** the `TimeTracking sessions` route: both match on the table
name, and only the sessions route has an account id to filter on.

The fixture covers a heavy-bankable rep, a mostly-internal rep, a rep with only
two months on the team, and the current month with no bankable hours.
