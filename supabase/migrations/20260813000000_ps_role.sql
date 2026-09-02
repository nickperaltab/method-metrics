-- PS-only access: give the professional services team `role = 'ps'`.
--
-- The builder reads this role and renders a PS-only shell (see
-- builder/src/lib/permissions.js): the Call Prep screens, no metrics nav, and
-- every other URL redirects to /call-prep. Roles in use: 'admin', 'viewer',
-- 'ps'. There is no CHECK constraint on the column, so this is additive.
--
-- Rows are seeded rather than left to first sign-in, because
-- upsertUserByEmail() creates unknown emails as 'viewer' — a PS person signing
-- in before their row existed would get the full app until it was fixed by hand.
--
-- ── The roster is not in this file ─────────────────────────────────────────
--
-- This repository is public, so the team's email addresses are left out of it.
-- The list below is empty on purpose and the migration is a no-op as committed:
-- an empty ARRAY[]::text[] is valid SQL that seeds nothing.
--
-- To apply it, fill in `ps_roster` with the PS team's addresses and run it in
-- the Supabase SQL editor. Do not commit the filled-in version. The roster
-- source is method-ps-skills/commands/team-call-prep.md.
--
-- Brandon (b.saltzman@method.me) is deliberately left off: he builds these
-- screens and needs the metrics side. To scope him too:
--   UPDATE users SET role = 'ps' WHERE email = 'b.saltzman@method.me';
--
-- Adding someone later needs no migration:
--   UPDATE users SET role = 'ps' WHERE email = 'first.last@method.me';

BEGIN;

-- One list, used by both statements below, so there is a single place to edit.
CREATE TEMP TABLE ps_roster (email text PRIMARY KEY);

INSERT INTO ps_roster (email)
SELECT lower(e)
FROM unnest(ARRAY[
  -- 'first.last@method.me',
  -- 'first.last@method.me',
]::text[]) AS e;

-- 1. Existing rows: flip to 'ps'. Admins are left alone — a PS manager who also
--    needs the metrics side keeps it, deliberately.
UPDATE users
SET role = 'ps'
WHERE role <> 'admin'
  AND lower(email) IN (SELECT email FROM ps_roster);

-- 2. Missing rows: create them. `users.name` is NOT NULL UNIQUE, so names use
--    the email local part — the same convention upsertUserByEmail() uses — and
--    a name already taken by a different email is skipped rather than failing
--    the migration.
--
--    That name is what the sidebar prints, so these rows read as "f.last"
--    rather than "First Last". Guessing surnames out of email addresses gets
--    people's names wrong, so set them by hand if the raw handle bothers you:
--      UPDATE users SET name = 'First Last' WHERE email = 'first.last@method.me';
INSERT INTO users (name, email, role)
SELECT split_part(r.email, '@', 1), r.email, 'ps'
FROM ps_roster r
WHERE NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = r.email)
  AND NOT EXISTS (SELECT 1 FROM users u WHERE u.name = split_part(r.email, '@', 1));

DROP TABLE ps_roster;

COMMIT;
