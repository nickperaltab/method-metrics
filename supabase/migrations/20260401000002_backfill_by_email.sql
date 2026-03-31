-- Re-backfill created_by_user by matching email (not name)
UPDATE dashboards d SET created_by_user = u.id FROM users u WHERE d.created_by_user IS NULL AND d.created_by = u.email;
UPDATE saved_charts sc SET created_by_user = u.id FROM users u WHERE sc.created_by_user IS NULL AND sc.created_by = u.email;
