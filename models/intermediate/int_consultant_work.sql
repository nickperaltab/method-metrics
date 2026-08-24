{{ config(materialized='view') }}

-- Consultant-delivered work, one row per time entry. Built for consultant grading /
-- service-quality review, where the question is "who did what on which account, and
-- for how long".
--
-- GRAIN TRAP this model exists to hide: TimeTracking.EntityRecordID is the METHOD
-- STAFF MEMBER, while Activity.EntityRecordID is the CUSTOMER. Joining the wrong one
-- to Entity silently returns customer names in a column labelled "consultant".
--
-- Excludes internal attendance rows (clock-in/out, no account) and deleted rows.
-- Entries with no account FK are KEPT with a NULL account so consultant hour totals
-- still reconcile against raw TimeTracking.

SELECT
  t.RecordID                                            AS time_tracking_record_id,

  -- who did the work
  t.EntityRecordID                                      AS consultant_record_id,
  e.EntityFullName                                      AS consultant,

  -- what they worked on
  t.MethodCompanyAccountRecordID                        AS account_record_id,
  a.CompanyAccount                                      AS company_account,
  t.CustomerRecordID                                    AS customer_record_id,

  -- when, and how much
  DATE(t.TxnDate)                                       AS txn_date,
  DATE_TRUNC(DATE(t.TxnDate), MONTH)                    AS txn_month,
  ROUND(t.DurationHours + t.DurationMinutes / 60.0, 4)  AS hours,

  -- how the work was classified
  t.MethodSupportType                                   AS method_support_type,
  t.BillableStatus                                      AS billable_status,
  t.IsInvoiced                                          AS is_invoiced,
  t.IsDemo                                              AS is_demo,

  -- links back out
  t.CaseRecordID                                        AS case_record_id,
  t.ActivityRecordID                                    AS activity_record_id,
  t.Notes                                               AS notes

FROM {{ source('revenue', 'TimeTracking') }} t
INNER JOIN {{ source('revenue', 'Entity') }} e
  ON e.RecordID = t.EntityRecordID
LEFT JOIN {{ source('revenue', 'Account') }} a
  ON a.RecordID = t.MethodCompanyAccountRecordID
WHERE COALESCE(t.IsDeleted, FALSE) = FALSE
  AND COALESCE(t.IsAttendenceEntry, FALSE) = FALSE
