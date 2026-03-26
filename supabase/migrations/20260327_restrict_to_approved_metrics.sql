-- Set all metrics to review except the 5 approved ones
UPDATE metrics SET status = 'review' WHERE id NOT IN (54, 55, 56, 20, 25);

-- Ensure the approved ones are set to 'live'
UPDATE metrics SET status = 'live' WHERE id IN (54, 55, 56, 20, 25);
