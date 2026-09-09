# PS Utilization (`/utilization`)

How much of a PS consultant's available time became billable customer work.
`builder/src/lib/utilization.js` + `builder/src/lib/workingTime.js` +
`builder/src/pages/Utilization.jsx`, reading
`project-for-method-dw.revenue.TimeTracking` joined to `Entity` (who logged it)
and `Item` (which service line).

Sibling of `/free-hours` and deliberately on the same reporting window
(`2026-01-01`) and the same month-range filter, so the two screens can be read
against each other.

## Two rates, and why both exist

The screen reports two figures that are easy to confuse, so it names them apart
and shows both:

| Name on screen | Formula | Answers |
|---|---|---|
| **Utilization** | billable ÷ **working hours** | Did enough billable work get done? |
| **% of billable work** | billable ÷ **hours logged** | Of the time logged, how much was billable? |

A consultant who logs 40 hours in August and bills all 40 is at **100% of
billable work** and **25% utilization**. That gap is the whole point. Before
2026-09-09 the screen called the second one "Utilization", which flattered a
light month: the denominator moved with the numerator.

Working hours are **8 × the working days in the month**, per consultant on the
roster. August 2026 has 20 working days, so one consultant is 160 hours and the
24-person roster is 3,840.

Verified against live data on 2026-09-09:

| Month | Working days | Roster | Working hours | Billable | Utilization |
|---|---|---|---|---|---|
| 2026-01 | 21 | 23 | 3,864 | 2,277.56 | 58.94% |
| 2026-02 | 19 | 21 | 3,192 | 2,232.73 | 69.94% |
| 2026-03 | 22 | 21 | 3,696 | 2,247.49 | 60.80% |
| 2026-04 | 21 | 21 | 3,528 | 1,949.48 | 55.25% |
| 2026-05 | 20 | 22 | 3,520 | 1,964.85 | 55.81% |
| 2026-06 | 22 | 22 | 3,872 | 2,276.56 | 58.79% |
| 2026-07 | 22 | 22 | 3,872 | 2,413.18 | 62.32% |
| 2026-08 | 20 | 24 | 3,840 | 2,276.16 | **59.27%** |

## The reconciliation ladder

The "Hours reconciliation" panel reports the same selection on four bases, each
removing one deduction from the row above, with its own utilization. It exists
because "the dashboard is wrong" almost always turns out to be a disagreement
about which deduction belongs in the figure, and the ladder settles that by
showing all four at once. `ladder()` in `utilization.js` builds the rungs.

| Rung | Formula | Field |
|---|---|---|
| All in | every customer hour = logged − internal | `allIn` |
| Less discounted | all in − discounted | `exDiscounted` |
| Less bankable | all in − bankable | `exBankable` |
| Less both | all in − bankable − discounted (= billable) | `billable` |

**Worked example — Miguel Teodoro, August 2026** (audited entry by entry on
2026-09-09, and now the regression case in `utilization.test.js`):

| Component | Hours | Entries |
|---|---|---|
| Dedicated, clean | 74.3167 | 105 |
| Pay-per-use | 2.0000 | 1 |
| Free | 9.0000 | 9 |
| Bankable | 14.5167 | 9 |
| Discounted | 2.0000 | 3 |
| Internal | 0 | 0 |

| Rung | Hours | Utilization (÷160) |
|---|---|---|
| All in | 101.83 | 63.64% |
| Less discounted | **99.83** | 62.39% |
| Less bankable | 87.31 | 54.57% |
| Less both (billable) | 85.31 | 53.32% |

Nothing was miscomputed in the August audit — every bucket reconciled to the
hour. The question was only which rung to read. Miguel's three discounted
entries (0.5h + 0.5h + 1.0h) are real work carrying
`*** DISCOUNT APPROVED BY ***` from Ryan Karaba and Charvi Anand.

**Utilization on the screen stays on the "less both" rung** (billable), and the
other three rungs are shown beside it rather than replacing it. Do not change
that basis without asking — it moves every consultant and every month.

## Every number is rounded DOWN to two decimals

`floor2()` in `utilization.js` is the single rounding function, used by both the
data layer and the page, so a tile can never disagree with the row it came from.
Down rather than nearest, so a rate never presents itself as having reached a
target it missed.

The `toPrecision(12)` inside it is load-bearing. `0.29 * 100` is
`28.999999999999996` in IEEE 754, and flooring that gives `28.99`. Twelve
significant digits is far more precision than an hour figure carries and far
less than the error, so it collapses the representation noise without moving a
real value. Remove it and roughly one figure in a hundred drops a cent.

## The roster: who gets charged working hours

Only consultants with an **attendance record** that month
(`IsAttendenceEntry = TRUE`). Attendance entries are excluded from every hour
bucket — they are the shift clock, not work — but their presence is the only
signal for who was on the clock, and `revenue` has no staff table.

That gate matters in both directions. In August 2026:

- **Joseph McDonald** is on the roster with no billable work at all. The
  `FULL OUTER JOIN` keeps him, so he reads as a real 0% instead of vanishing and
  flattering the team rate.
- **Zachary Cutler** (3.47h) and **Ashur Shamon** (4.52h) logged a few hours with
  no attendance row. Charging them a full 160 hours each would have pulled team
  utilization from 59.27% to 57.1%.

So utilization's numerator and denominator are both drawn from roster
consultant-months only. Off-roster hours still appear in every hour column and
in "% of billable work"; they are excluded from the ratio, and that consultant's
utilization cell reads `—`.

### The "(as vendor)" duplicate Entity

**`Entity` has only two columns — `RecordID` and `EntityFullName` — so there is
no entity type to filter on. The type is baked into the name.**

Method keeps a **second `Entity` row** for some consultants, suffixed
`(as vendor)`, and posts part of their attendance clock against it. Seven exist
in 2026: Cheryl Tong, Ethan Miranda, Javier Chung, Justin Klein, Miguel Teodoro,
Sarah Chen and Vinesh Gobin. Every one has **zero work entries and attendance
only**, and every one also has a normal `Entity` row in the same month — so it is
a duplicate identity for one person, not a second person.

Because attendance defines the roster, these were **phantom consultants**: each
charged a full month of capacity against no billable work. They also showed up in
the screen's consultant dropdown, which is how the bug was spotted.

`buildUtilizationSql` now strips the suffix (`VENDOR_ALIAS_SUFFIX`,
case-insensitive, anchored to the end) and groups on the result, merging the two
identities. Corrected on 2026-09-09:

| Month | Roster before | Roster after | Utilization before | After |
|---|---|---|---|---|
| 2026-03 | 23 | 21 | 55.52% | **60.80%** |
| 2026-05 | 26 | 22 | 47.23% | **55.81%** |
| 2026-06 | 24 | 22 | 53.89% | **58.79%** |

May was the worst hit — 4 phantoms, 640 hours of capacity that nobody was ever
available for — and it had been reading as the year's outlier low month purely
because of it. March, April, July, August and September were never affected.

Anything else that groups PS time by `EntityFullName` needs the same
normalization. See also the two-conventions problem on consultant names in
`call_prep.snapshots` (`psOverview.js`), which is a different collision with the
same shape.

## The working calendar is derived, not listed

`workingTime.js` computes Ontario statutory and civic holidays from their rules
(Family Day is the third Monday of February; Good Friday follows Easter via
Meeus/Jones/Butcher) rather than reading a table. A hardcoded list is a dashboard
that silently goes wrong every January.

Two independent confirmations that 8 × working days is the right denominator:

1. Brandon specified 160 for August 2026.
2. Method's own attendance rows post **exactly 160.0** for August for 22 of the
   24 consultants on the roster. The other two post 168.0, which is 21 weekdays
   × 8 — the Civic Holiday not netted out. Method's stored figure is not
   self-consistent, so it is not the source of truth here.

`holidays()` handles observed dates: a holiday on a weekend rolls to the next
weekday, and Boxing Day cannot land on the day Christmas moved to (in 2027
Christmas is Sat 25 → Mon 27, so Boxing Day is Tue 28).

**Time off is not modelled, because there is no data for it.** Method tracks no
PTO, vacation or leave anywhere in `TimeTracking`, and attendance posts a flat
monthly figure regardless. A consultant on a two-week vacation is charged full
working hours and reads as half-utilized. The screen states this in "How these
numbers work" rather than pretending otherwise. Fixing it needs a leave source
that does not exist today.

A related, much smaller effect in the other direction: 4 consultants logged
22.63 hours on Labour Day 2026. Those hours count in the numerator against no
capacity, so working a stat holiday nudges utilization above 100% at the margin.

## The open month is prorated to the data, not to today

An open month has not spent its whole capacity, so charging September's full 168
hours on the 9th would report a third of the real rate. Capacity for the open
month is therefore `8 × working days elapsed`.

**Elapsed means up to the last day with time entries, not today.** Those are not
the same day: on 2026-09-09 the newest entry in `TimeTracking` was 2026-09-08,
because time is logged in arrears. Following the clock would have charged the
roster a sixth working day (22 × 8 = 176 hours) against zero logged hours and
understated September by about 14%.

The query returns that date as `data_through` (a `MAX(txn_date)` scalar), and
`fetchUtilization` hands back `{ rows, dataThrough, asOf }`. Every aggregation
function takes `asOf` and nothing calls `new Date()` behind the caller's back,
which is also what makes the capacity tests deterministic.

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
| All in | Logged − internal: every customer hour |
| Working hours | 8 × working days, per roster consultant |
| Utilization | Billable ÷ Working hours |
| % of billable work | Billable ÷ Logged |

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

So an open month shows its largest deduction missing, and both its rates are the
highest they will ever be. That is on top of the prorated capacity above. The
screen says so in a banner, marks the month with a grey dot on the chart and in
the "% of billable work" panel, and repeats it in that month's hover card. Do not
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
two months on the team, the current month with no bankable hours, a roster
consultant with no billable work (a real 0%) and an off-roster consultant whose
utilization cell reads `—`. Its `data_through` is deliberately set to
**yesterday**, because real data lags the clock and that is what prorates the
open month.
