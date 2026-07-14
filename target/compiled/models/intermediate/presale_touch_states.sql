-- Build actual result given inputs
WITH
            	`project-for-method-dw_revenue_Activity` as (SELECT *  FROM UNNEST([STRUCT(CAST(NULL AS INT64) AS recordid, CAST('2024-05-01' AS DATE) AS duedatestart, CAST(1 AS INT64) AS entityrecordid, CAST('Demo booked' AS STRING) AS activitytype, CAST(NULL AS INT64) AS activitytyperecordid, CAST(NULL AS STRING) AS activitystatus, CAST(NULL AS STRING) AS comments, CAST(NULL AS STRING) AS zoommeetinguuid, CAST(NULL AS TIMESTAMP) AS createddate, CAST(NULL AS TIMESTAMP) AS lastmodifieddate, CAST(NULL AS INT64) AS methodcompanyaccountrecordid, CAST(NULL AS INT64) AS assignedtorecordid, CAST(false AS BOOL) AS isdeleted), STRUCT(CAST(NULL AS INT64) AS recordid, CAST('2024-05-08' AS DATE) AS duedatestart, CAST(1 AS INT64) AS entityrecordid, CAST('Demo' AS STRING) AS activitytype, CAST(NULL AS INT64) AS activitytyperecordid, CAST(NULL AS STRING) AS activitystatus, CAST(NULL AS STRING) AS comments, CAST(NULL AS STRING) AS zoommeetinguuid, CAST(NULL AS TIMESTAMP) AS createddate, CAST(NULL AS TIMESTAMP) AS lastmodifieddate, CAST(NULL AS INT64) AS methodcompanyaccountrecordid, CAST(NULL AS INT64) AS assignedtorecordid, CAST(false AS BOOL) AS isdeleted), STRUCT(CAST(NULL AS INT64) AS recordid, CAST('2024-06-01' AS DATE) AS duedatestart, CAST(2 AS INT64) AS entityrecordid, CAST('Free Consulting Booked' AS STRING) AS activitytype, CAST(NULL AS INT64) AS activitytyperecordid, CAST(NULL AS STRING) AS activitystatus, CAST(NULL AS STRING) AS comments, CAST(NULL AS STRING) AS zoommeetinguuid, CAST(NULL AS TIMESTAMP) AS createddate, CAST(NULL AS TIMESTAMP) AS lastmodifieddate, CAST(NULL AS INT64) AS methodcompanyaccountrecordid, CAST(NULL AS INT64) AS assignedtorecordid, CAST(false AS BOOL) AS isdeleted), STRUCT(CAST(NULL AS INT64) AS recordid, CAST('2024-07-02' AS DATE) AS duedatestart, CAST(3 AS INT64) AS entityrecordid, CAST('Free Consulting Session' AS STRING) AS activitytype, CAST(NULL AS INT64) AS activitytyperecordid, CAST(NULL AS STRING) AS activitystatus, CAST(NULL AS STRING) AS comments, CAST(NULL AS STRING) AS zoommeetinguuid, CAST(NULL AS TIMESTAMP) AS createddate, CAST(NULL AS TIMESTAMP) AS lastmodifieddate, CAST(NULL AS INT64) AS methodcompanyaccountrecordid, CAST(NULL AS INT64) AS assignedtorecordid, CAST(false AS BOOL) AS isdeleted), STRUCT(CAST(NULL AS INT64) AS recordid, CAST('2024-01-01' AS DATE) AS duedatestart, CAST(4 AS INT64) AS entityrecordid, CAST('Demo' AS STRING) AS activitytype, CAST(NULL AS INT64) AS activitytyperecordid, CAST(NULL AS STRING) AS activitystatus, CAST(NULL AS STRING) AS comments, CAST(NULL AS STRING) AS zoommeetinguuid, CAST(NULL AS TIMESTAMP) AS createddate, CAST(NULL AS TIMESTAMP) AS lastmodifieddate, CAST(NULL AS INT64) AS methodcompanyaccountrecordid, CAST(NULL AS INT64) AS assignedtorecordid, CAST(true AS BOOL) AS isdeleted)])),
  	`project-for-method-dw_revenue_int_presale_touches_expect` as (SELECT *  FROM UNNEST([STRUCT(CAST(1 AS INT64) AS entityrecordid, CAST(true AS BOOL) AS demo_booked, CAST(true AS BOOL) AS demo_attended, CAST('2024-05-08' AS DATE) AS demo_first_date, CAST(false AS BOOL) AS free_booked, CAST(false AS BOOL) AS free_attended, CAST(NULL AS DATE) AS free_first_date, CAST(true AS BOOL) AS attended_any, CAST('2024-05-08' AS DATE) AS first_attended_date), STRUCT(CAST(2 AS INT64) AS entityrecordid, CAST(false AS BOOL) AS demo_booked, CAST(false AS BOOL) AS demo_attended, CAST(NULL AS DATE) AS demo_first_date, CAST(true AS BOOL) AS free_booked, CAST(false AS BOOL) AS free_attended, CAST(NULL AS DATE) AS free_first_date, CAST(false AS BOOL) AS attended_any, CAST(NULL AS DATE) AS first_attended_date), STRUCT(CAST(3 AS INT64) AS entityrecordid, CAST(false AS BOOL) AS demo_booked, CAST(false AS BOOL) AS demo_attended, CAST(NULL AS DATE) AS demo_first_date, CAST(false AS BOOL) AS free_booked, CAST(true AS BOOL) AS free_attended, CAST('2024-07-02' AS DATE) AS free_first_date, CAST(true AS BOOL) AS attended_any, CAST('2024-07-02' AS DATE) AS first_attended_date)])),
  	`project-for-method-dw_revenue_int_presale_touches_actual` as (

-- Pre-sale human-touch signals per entity, from the Activity table.
-- Date = DueDateStart (CreatedDate is NULL on ~93% of rows). Attended types only
-- set the *_attended flags; booked/missed are tracked separately for show-rate.
-- Tracking effectively starts 2024 — older cohorts read as untouched.

WITH acts AS (
  SELECT EntityRecordID, ActivityType, DueDateStart
  FROM `project-for-method-dw_revenue_Activity`
  WHERE COALESCE(IsDeleted, FALSE) = FALSE
    AND EntityRecordID IS NOT NULL
)
SELECT
  EntityRecordID,
  LOGICAL_OR(ActivityType IN ('Demo booked', 'Phone Call Demo Booked'))            AS demo_booked,
  LOGICAL_OR(ActivityType IN ('Demo', 'Pre-sales Demo'))                           AS demo_attended,
  MIN(IF(ActivityType IN ('Demo', 'Pre-sales Demo'), DueDateStart, NULL))          AS demo_first_date,
  LOGICAL_OR(ActivityType = 'Free Consulting Booked')                              AS free_booked,
  LOGICAL_OR(ActivityType = 'Free Consulting Session')                             AS free_attended,
  MIN(IF(ActivityType = 'Free Consulting Session', DueDateStart, NULL))            AS free_first_date,
  LOGICAL_OR(ActivityType IN ('Demo', 'Pre-sales Demo', 'Free Consulting Session')) AS attended_any,
  MIN(IF(ActivityType IN ('Demo', 'Pre-sales Demo', 'Free Consulting Session'), DueDateStart, NULL)) AS first_attended_date
FROM acts
GROUP BY 1
)
        (SELECT EntityRecordID, demo_booked, demo_attended, demo_first_date, free_booked, free_attended, free_first_date, attended_any, first_attended_date, 'actual' AS actual_or_expected FROM `project-for-method-dw_revenue_int_presale_touches_actual`)
        UNION ALL
        (SELECT EntityRecordID, demo_booked, demo_attended, demo_first_date, free_booked, free_attended, free_first_date, attended_any, first_attended_date, 'expected' AS actual_or_expected FROM `project-for-method-dw_revenue_int_presale_touches_expect`)
        ORDER BY EntityRecordID, demo_booked, demo_attended, demo_first_date, free_booked, free_attended, free_first_date, attended_any, first_attended_date