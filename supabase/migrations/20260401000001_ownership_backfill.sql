-- Ownership model: Method Approved vs Individual
-- Ticket #36

-- Add created_by_user UUID column to dashboards (the TEXT created_by already exists)
ALTER TABLE dashboards ADD COLUMN IF NOT EXISTS created_by_user uuid REFERENCES users(id);

-- Add is_approved to saved_charts (dashboards already has it)
ALTER TABLE saved_charts ADD COLUMN IF NOT EXISTS is_approved boolean DEFAULT false;

-- Add description to saved_charts for search
ALTER TABLE saved_charts ADD COLUMN IF NOT EXISTS description text;

-- Backfill created_by_user on dashboards by matching created_by text to users.name
UPDATE dashboards d
SET created_by_user = u.id
FROM users u
WHERE d.created_by_user IS NULL
  AND d.created_by = u.name;

-- Backfill created_by_user on saved_charts by matching created_by text to users.email
UPDATE saved_charts sc
SET created_by_user = u.id
FROM users u
WHERE sc.created_by_user IS NULL
  AND sc.created_by = u.email;

-- Also try matching by name for charts (some may have been created with name instead of email)
UPDATE saved_charts sc
SET created_by_user = u.id
FROM users u
WHERE sc.created_by_user IS NULL
  AND sc.created_by = u.name;
