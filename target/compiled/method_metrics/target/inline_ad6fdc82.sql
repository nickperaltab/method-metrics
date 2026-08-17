
WITH d AS (SELECT EXTRACT(DAY FROM CURRENT_DATE())-1 elapsed, EXTRACT(DAY FROM LAST_DAY(CURRENT_DATE(),MONTH)) dim, DATE_TRUNC(CURRENT_DATE(),MONTH) m),
f AS (SELECT SUM(Forecasted_Trials) ft, SUM(Forecasted_Syncs) fs, SUM(Forecasted_Conversion) fc, SUM(Forecasted_Churn) fch
      FROM `project-for-method-dw.revenue.method_forecast`,d WHERE DATE_TRUNC(Date,MONTH)=d.m)
SELECT d.elapsed, d.dim,
  (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_trials`,d WHERE DATE_TRUNC(SignupDate,MONTH)=d.m AND SignupDate<CURRENT_DATE()) trials_mtd,
  (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_syncs`,d WHERE DATE_TRUNC(SyncDate,MONTH)=d.m AND SyncDate<CURRENT_DATE()) syncs_mtd,
  (SELECT COUNT(*) FROM `project-for-method-dw.revenue.int_conversions`,d WHERE DATE_TRUNC(FirstSaaSInvoiceTxnDate,MONTH)=d.m AND FirstSaaSInvoiceTxnDate<CURRENT_DATE()) conv_mtd,
  (SELECT COUNT(DISTINCT CompanyAccount) FROM `project-for-method-dw.revenue.int_cancellations`,d WHERE DATE_TRUNC(CancellationDate,MONTH)=d.m AND CancellationDate<CURRENT_DATE()) churn_mtd,
  ROUND(f.ft,0) fc_trials, ROUND(f.fs,0) fc_syncs, ROUND(f.fc,0) fc_conv, ROUND(f.fch,0) fc_churn
FROM d, f