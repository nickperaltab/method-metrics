-- Guardrail: int_mrr_movement_decomposed decides Prepay-Expiry (PE) exclusion at
-- ENTITY grain, while int_customer_mrr decides it at COMPANY grain. These are
-- equivalent ONLY because every all-PE company is currently single-entity.
--
-- If a MULTI-entity company ever has a MIXED prior book in a given month (at least
-- one entity entirely PE, at least one entity with a real SaaS book), the two models
-- would silently disagree on what counts as a cancellation. This test fails loudly
-- (returns > 0 rows) the first time such a company-month appears.
--
-- Filters mirror int_customer_mrr exactly: TxnDate >= '2021-12-01', exclude the
-- in-progress month, exclude CompanyAccount prefixes 'm11%' / 'm18%'.

WITH entity_monthly AS (
  SELECT
    CompanyAccount,
    DATE_TRUNC(TxnDate, MONTH) AS month,
    EntityRecordID,
    COUNTIF(SaaSAmount != 0) AS saas_lines,
    COUNTIF(SaaSAmount != 0 AND AccountFullName LIKE '%Prepay Expiry Income%') AS expiry_lines
  FROM {{ source('revenue', 'TransLineFlattened') }}
  WHERE TxnDate >= '2021-12-01'
    AND FORMAT_DATE('%Y-%m', TxnDate) < FORMAT_DATE('%Y-%m', CURRENT_DATE())
    AND CompanyAccount NOT LIKE 'm11%'
    AND CompanyAccount NOT LIKE 'm18%'
  GROUP BY 1, 2, 3
),

-- Keep only entities with a non-zero book in the month, and flag the all-PE ones.
entity_flagged AS (
  SELECT
    CompanyAccount,
    month,
    EntityRecordID,
    (expiry_lines > 0 AND expiry_lines = saas_lines) AS is_all_pe
  FROM entity_monthly
  WHERE saas_lines > 0
),

-- Roll up to the company-month: how many entities, how many all-PE, how many not.
company_month AS (
  SELECT
    CompanyAccount,
    month,
    COUNT(DISTINCT EntityRecordID) AS entities,
    COUNTIF(is_all_pe) AS pe_entities,
    COUNTIF(NOT is_all_pe) AS non_pe_entities
  FROM entity_flagged
  GROUP BY 1, 2
)

-- Risky: > 1 entity AND a mix of all-PE and non-PE entities.
SELECT
  CompanyAccount,
  month,
  entities,
  pe_entities,
  non_pe_entities
FROM company_month
WHERE entities > 1
  AND pe_entities > 0
  AND non_pe_entities > 0
