

-- Pre-sale human-touch signals per entity, from the Activity table.
-- Date = DueDateStart (CreatedDate is NULL on ~93% of rows). Attended types only
-- set the *_attended flags; booked/missed are tracked separately for show-rate.
-- Tracking effectively starts 2024 — older cohorts read as untouched.

WITH acts AS (
  SELECT EntityRecordID, ActivityType, DueDateStart
  FROM `project-for-method-dw`.`revenue`.`Activity`
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