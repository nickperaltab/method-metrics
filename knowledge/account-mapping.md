# Account Type Mapping

## Paying Entity Whitelist

A "paying entity" is one where the sum of new-platform income > 0 for the period.

**Whitelisted account types** (count toward paying status):
- `Subscriptions:MethodNew` — new platform SaaS income
- `Subscriptions:Dedicated Enhancement Plan` (DEP) — recurring maintenance
- `Subscriptions:Prepay Expiry Income` — deferred revenue recognition
- `Subscriptions:Emails` — email service income

**Separate column** (SaaSIncomeAmountClassic in spreadsheet):
- `Subscriptions:Classic` — legacy platform income

**Excluded** (not counted as paying):
- `Subscriptions:Portals` — separate product, not SaaS income
- `Subscriptions:Prepay Discounts` — discount, maps to DiscountPrepayPortion
- `Subscriptions:MSP Free Licenses` — discount
- `Subscriptions:Promo Subscription Discount` — discount
- `Subscriptions:Reseller Discounts` — discount
- `Subscriptions:Premium App Configuration Disc` — discount

## Critical Rule

**SUM first, then check > 0.** Never check individual transaction lines for positivity. An entity might have a positive MethodNew line and a negative discount line. The spreadsheet logic is:

```
Paying = SUM(whitelisted amounts for this entity) > 0
```

Not:

```
Paying = ANY(whitelisted transaction > 0)  -- WRONG
```

## Formula Chain

Traced from the spreadsheet:
1. Monthly Summary tab → column AS (paying logos)
2. Monthly Detail tab → column BP = `SUM(Y:AA)` where Y:AA = SaaSIncomeAmountNew columns
3. NRR By Customer tab → columns V (US), W (CAN), X (UK) = `COUNTIFS(Customers!Z:Z, ">0", ...)`
4. Customers tab → column Z = `SaaSIncomeAmountNewPeriod2`

The BQ equivalent: SUM the whitelisted AccountFullName amounts per entity, then COUNTIF > 0.

## SQL Pattern

```sql
SUM(CASE WHEN AccountFullName LIKE '%MethodNew%'
          OR AccountFullName LIKE '%Dedicated Enhancement Plan%'
          OR AccountFullName LIKE '%Prepay Expiry Income%'
          OR AccountFullName LIKE '%Emails%'
     THEN SaaSAmount ELSE 0 END) AS new_platform_income
-- Then: COUNTIF(new_platform_income > 0) AS paying_logos
```
