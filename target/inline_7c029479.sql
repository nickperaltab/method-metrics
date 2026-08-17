
WITH d AS (SELECT EXTRACT(DAY FROM CURRENT_DATE()) dom)
SELECT
 (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_trials`,d WHERE DATE_TRUNC(SignupDate,MONTH)=DATE '2026-07-01' AND EXTRACT(DAY FROM SignupDate)<=dom)   jul_trials_thru_d10,
 (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_trials`,d WHERE DATE_TRUNC(SignupDate,MONTH)=DATE '2026-07-01' AND EXTRACT(DAY FROM SignupDate)<dom)    jul_trials_thru_d9,
 (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_syncs`,d  WHERE DATE_TRUNC(SyncDate,MONTH)=DATE '2026-07-01'   AND EXTRACT(DAY FROM SyncDate)<=dom)      jul_syncs_thru_d10,
 (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_syncs`,d  WHERE DATE_TRUNC(SyncDate,MONTH)=DATE '2026-07-01'   AND EXTRACT(DAY FROM SyncDate)<dom)       jul_syncs_thru_d9,
 (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_trials` WHERE DATE_TRUNC(SignupDate,MONTH)=DATE_TRUNC(CURRENT_DATE(),MONTH)) aug_trials_mtd,
 (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_syncs`  WHERE DATE_TRUNC(SyncDate,MONTH)=DATE_TRUNC(CURRENT_DATE(),MONTH))  aug_syncs_mtd
