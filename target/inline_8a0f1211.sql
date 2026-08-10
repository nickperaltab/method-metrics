
SELECT COUNT(*) rows_, COUNT(DISTINCT account_record_id) uniq_key,
  COUNTIF(health_score IS NULL) null_health,
  ROUND(COUNTIF(health_score IS NULL)/COUNT(*)*100,1) null_health_pct,
  COUNTIF(user_licenses < 0) negative_licenses,
  COUNTIF(is_active) active
FROM `project-for-method-dw.revenue.int_accounts`