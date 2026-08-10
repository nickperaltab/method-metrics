
SELECT
  EXTRACT(DAY FROM CURRENT_DATE()) dom,
  EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(),MONTH)) dim,
  (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_conversions` WHERE FirstSaaSInvoiceTxnDate>=DATE_TRUNC(CURRENT_DATE(),MONTH) AND FirstSaaSInvoiceTxnDate<CURRENT_DATE()) thru_yesterday,
  (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_conversions` WHERE FirstSaaSInvoiceTxnDate>=DATE_TRUNC(CURRENT_DATE(),MONTH) AND FirstSaaSInvoiceTxnDate<=CURRENT_DATE()) thru_today,
  (SELECT ROUND(value,1) FROM `project-for-method-dw.revenue_metrics.v_metric__conversions_trajectory`) our_traj,
  (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_conversions` WHERE DATE_TRUNC(FirstSaaSInvoiceTxnDate,MONTH)=DATE_TRUNC(DATE_SUB(CURRENT_DATE(),INTERVAL 1 MONTH),MONTH)) prior_full,
  (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_conversions` WHERE DATE_TRUNC(FirstSaaSInvoiceTxnDate,MONTH)=DATE_TRUNC(DATE_SUB(CURRENT_DATE(),INTERVAL 1 MONTH),MONTH) AND EXTRACT(DAY FROM FirstSaaSInvoiceTxnDate)<=EXTRACT(DAY FROM CURRENT_DATE())) prior_same_window
