ALTER TABLE saved_charts ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE saved_charts ADD COLUMN IF NOT EXISTS created_by_avatar TEXT;
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS created_by_avatar TEXT;
