# Partner referral views — design

**Date:** 2026-06-25
**Status:** approved, ready for implementation plan
**Author:** Nic (with Claude)

## Problem

We have no model of which accounts a partner referred. Partner managers and CS
want a list, per partner, of the accounts that partner brought in — and a
roll-up scoreboard across partners. Today this only exists as one-off CRM
exports (e.g. a partner's active-account list).

The referring partner already lives in BigQuery: `revenue.Account.Partner`. It
holds 466 distinct values across ~33K accounts. The dbt models already lean on
this field (they filter out `Partner = 'Method Integration'`, the internal one).
Nothing surfaces it as a partner → accounts view.

## Goal

Two BQ-only dbt models in `project-for-method-dw.revenue`:

1. A detail intermediate: one row per (partner, referred account).
2. A summary view: one row per partner, rolled up from the detail.

## Non-goals (v1)

- **No Health / Managed? columns.** Those live in Method CRM
  (CustomerMethodAccount) and the mssql health-score table, not BQ. Pulling them
  couples the model to a second source. Deferred.
- **No partner-name normalization.** Raw `Account.Partner` strings only.
  Deferred (see Follow-ups).

## Models

### 1. `int_partner_accounts` (intermediate, `materialized='table'`)

Grain: **one row per (Partner, CompanyAccount).**

| Column | Source | Notes |
|---|---|---|
| `Partner` | `Account.Partner` (raw) | No normalization. |
| `CompanyAccount` | `Account.CompanyAccount` | |
| `EntityRecordID` | `Account.EntityRecordID` | Customer key; one customer can own accounts across partners. |
| `SignupDate` | `Account.FirstSaaSInvoiceTxnDate` | First paid invoice. |
| `CancellationDate` | `Account.CancellationDate` | NULL/`0001-01-01` sentinel = not cancelled. |
| `IsActive` | derived | `FirstSaaSInvoiceTxnDate IS NOT NULL AND (CancellationDate IS NULL OR CancellationDate = '0001-01-01')` |
| `Licenses` | `MAX(UserPaidCount)` latest complete month | 0 if no billing that month. |
| `MRR` | `SUM(SaaSAmount)` latest complete month | 0 if no billing that month. |

Exclusions / hygiene:
- Exclude `Partner = 'Method Integration'` (internal) and rows with NULL/empty `Partner`.
- Exclude `m11%` / `m18%` test accounts (same as `int_customer_mrr` / `int_customers`).
- Dedup `Account` to one row per `CompanyAccount` (the table fans out ~1.22
  rows per EntityRecordID — see memory `account-table-dedup`).
- "Latest complete month" = the month before the current month
  (`DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)`), so the
  in-progress month never shows false zeros.

### 2. `v_partner_scorecard` (view, built on `int_partner_accounts`)

Grain: **one row per Partner.**

| Column | Definition |
|---|---|
| `Partner` | raw string |
| `AccountsReferred` | `COUNT(*)` — all-time referred accounts |
| `ActiveAccounts` | `COUNTIF(IsActive)` |
| `TotalLicenses` | `SUM(Licenses)` |
| `TotalMRR` | `SUM(MRR)` |

## Active definition — why Def B

We considered two definitions for `IsActive`:

- **Def A** — account billed SaaS in the latest complete month (point-in-time,
  mirrors the revenue model `int_customers` / `int_customer_mrr`).
- **Def B** — account has a `FirstSaaSInvoiceTxnDate` and no `CancellationDate`
  (lifecycle / CRM-subscriber view). **Chosen.**

Tested against a reference partner's CRM export, pulled 2026-06-25. Pattern of
the counts (exact figures live in Obsidian, not this public repo):

| Definition | Active count |
|---|---|
| Total accounts ever | N |
| **Def B (first pay + no cancel)** | **exact match to the CRM export** |
| Def A (paid last month) | N + 2 |
| Active by Def B but no recent payment | 1 |

Def B matches the partner's own CRM view exactly, and `CancellationDate` is
reliable (1 discrepancy across the partner's whole book). A partner referral list is something
partners and CS eyeball against their CRM, so the lifecycle definition is the
right fit — Def A answers a different question (did this account bill revenue
last month). This view establishes the first **account-grain** active
definition; the existing canonical definition is customer-grain only
(`int_customers.IsActive`, metric #373).

## Parity check (before flipping live)

`v_partner_scorecard` filtered to the reference partner should reproduce that
partner's CRM export exactly (AccountsReferred = all-time, ActiveAccounts =
matches the export). Exact target figures are recorded in Obsidian, not this
public repo. Reference month for Licenses/MRR = May 2026 (the latest complete
month at design time).

Run the snapshot → build → diff discipline from `migrate-metric-to-dbt`.

## Documented caveats

1. **Raw partner strings.** One top partner appears as two rows because its
   name has a punctuation variant (", Inc" vs " Inc") until normalization lands.
   Only 3 partners total have variants; only this one is material.
2. **Account-grain active ≠ point-in-time billing — by design.** A
   lifecycle-active account that didn't bill last month shows `IsActive = true`
   with `MRR = 0` (one such account in the reference partner's book). This is not a data quirk: an account can have
   no `CancellationDate` yet still pay $0 because Method places non-paying
   accounts on a **hard hold** and waits before formally cancelling. So `MRR = 0`
   is the financially correct figure while the account is still a live
   subscriber lifecycle-wise. Consequence: `ActiveAccounts` (lifecycle count)
   and `TotalMRR` (financial) intentionally will not reconcile — active-account
   count can exceed the number of accounts actually billing. Both columns are
   correct for their respective questions.
3. **No Health / Managed? columns** in v1.

## Follow-ups (noted, not built)

- Light partner-name normalization (trim / lowercase / strip punctuation +
  Inc/LLC/Co) to merge the 3 variant partners in the summary. Keep the raw
  string on detail rows. Conservative rule only — at this data size there is no
  over-merge risk (461 stay distinct after normalization).
- Health + Managed? columns via a Method CRM (CustomerMethodAccount) join.
