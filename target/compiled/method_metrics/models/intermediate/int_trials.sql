

-- Intermediate model: one row per Method account that began a trial.
-- Source: revenue.Account, filtered to exclude conversion exceptions,
-- internal Method Integration partner rows, and the '0001-01-01' sentinel
-- (which marks "no trial").
--
-- This is the DEFINITIVE definition. dbt owns this view at run time.
-- The previous BQ-side hand-written DDL is being replaced by this model.
-- If you change the filter / projection, change it here and re-run.
--
-- Renaming to int_trials is deferred — handoff §12 commits to a single
-- one-shot v_* → int_* rename PR after all 20 metrics are migrated.

SELECT
  EntityRecordID,
  SignupDate, CompanyAccount, SignupCountry, SyncType, SyncTypeRegion, Vertical, CustDatIndustry,
  Att_SEO, Att_Pay_Per_Click, Att_OPN_Other_Peoples_Networks, Att_Social, Att_Email,
  Att_Referral_Link, Att_Referral_Program, Att_Direct, Att_Partners, Att_Content,
  Att_Remarketing, Att_Other, Att_None, Att_Backlinks, Att_Banner_Ads,
  Att_Help_Center, Att_Online_Chat_Tool, Att_Seminar_Conference,
  CASE
    WHEN Att_SEO = 1 THEN 'SEO'
    WHEN Att_Pay_Per_Click = 1 THEN 'PPC'
    WHEN Att_OPN_Other_Peoples_Networks = 1 THEN 'OPN'
    WHEN Att_Social = 1 THEN 'Social'
    WHEN Att_Email = 1 THEN 'Email'
    WHEN Att_Referral_Link = 1 THEN 'Referral'
    WHEN Att_Direct = 1 THEN 'Direct'
    WHEN Att_Partners = 1 THEN 'Partners'
    WHEN Att_Content = 1 THEN 'Content'
    WHEN Att_Remarketing = 1 THEN 'Remarketing'
    WHEN Att_Other = 1 THEN 'Other'
    WHEN Att_None = 1 THEN 'None'
    ELSE 'Unknown'
  END AS AttributionChannel
FROM `project-for-method-dw`.`revenue`.`Account`
WHERE IsConversionException = FALSE
  AND Partner != 'Method Integration'
  AND SignupDate != DATE('0001-01-01')