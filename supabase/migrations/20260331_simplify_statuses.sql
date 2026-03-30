-- Simplify metric statuses: collapse all non-live statuses to 'queued'
-- Preserves the 5 live metrics (IDs 54, 55, 56, 20, 25)
UPDATE metrics SET status = 'queued' WHERE status != 'live';
