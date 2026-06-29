-- A converted customer must have a convert_month; an unconverted one must not.
-- A retained_Kmo can only be TRUE when eligible_Kmo is TRUE.
SELECT EntityRecordID
FROM {{ ref('int_motion_funnel') }}
WHERE (converted AND convert_month IS NULL)
   OR (NOT converted AND convert_month IS NOT NULL)
   OR (retained_1mo  AND NOT eligible_1mo)
   OR (retained_3mo  AND NOT eligible_3mo)
   OR (retained_6mo  AND NOT eligible_6mo)
   OR (retained_12mo AND NOT eligible_12mo)
