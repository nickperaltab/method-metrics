-- PS Hub: account board (owner + active status) and editable cards.
--
-- Adds the columns the board/filter UI needs (owner_email for "mine vs
-- everyone's accounts", is_active for "active within managed billable"),
-- and opens up anon UPDATE/INSERT/DELETE policies on the PS Hub tables so
-- the builder app can edit call preps, audits, and project notes directly.
-- This matches the rest of this repo's security model: RLS is wide open by
-- convention (dashboards, saved_charts, metrics all allow anon writes) and
-- the real gate is the app's Google OAuth sign-in wall, not RLS. The
-- ps-hub-ingest Edge Function (service role + shared secret) remains the
-- only way routines write in; this migration only affects human edits from
-- the browser.

ALTER TABLE ps_accounts ADD COLUMN IF NOT EXISTS owner_email TEXT;
ALTER TABLE ps_accounts ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS ps_accounts_owner_idx ON ps_accounts (owner_email);
CREATE INDEX IF NOT EXISTS ps_accounts_active_idx ON ps_accounts (is_active);

CREATE POLICY "Allow anon update" ON ps_accounts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon update" ON ps_call_preps FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon update" ON ps_audits FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon insert" ON ps_project_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update" ON ps_project_notes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete" ON ps_project_notes FOR DELETE USING (true);
