-- Fix user emails to match what BQ OAuth stores in created_by
UPDATE users SET email = 'j.porter@method.me' WHERE name = 'Justin';
UPDATE users SET email = 'n.peralta-baron@method.me' WHERE name = 'Nic';

-- Now backfill created_by_user by matching email
UPDATE dashboards d SET created_by_user = u.id FROM users u WHERE d.created_by_user IS NULL AND d.created_by = u.email;
UPDATE saved_charts sc SET created_by_user = u.id FROM users u WHERE sc.created_by_user IS NULL AND sc.created_by = u.email;
