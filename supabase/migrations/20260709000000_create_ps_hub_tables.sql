-- PS Hub: call preps, call audits, and project notes for Method PS dedicated
-- accounts, surfaced as new screens in the builder app.
--
-- Writes come exclusively from the `ps-hub-ingest` Edge Function (service
-- role, shared-secret authenticated) — no anon insert/update/delete policies
-- here on purpose. The builder app reads via the anon key, same as the rest
-- of this app's tables.

CREATE TABLE IF NOT EXISTS ps_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  method_customer_id  TEXT UNIQUE,
  account_type        TEXT NOT NULL CHECK (account_type IN ('DEDICATED', 'PPU', 'FREE')),
  is_dedicated        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ps_call_preps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES ps_accounts (id) ON DELETE CASCADE,
  call_date       DATE NOT NULL,
  summary         TEXT NOT NULL,
  content         TEXT NOT NULL,
  dep_score       INTEGER,
  source_doc_url  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, call_date)
);

CREATE TABLE IF NOT EXISTS ps_audits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES ps_accounts (id) ON DELETE CASCADE,
  audit_type        TEXT NOT NULL CHECK (audit_type IN ('PPU', 'FREE_HOUR')),
  call_date         DATE NOT NULL,
  total_score       INTEGER,
  max_score         INTEGER,
  score_breakdown   JSONB,
  flags             JSONB,
  notes             TEXT,
  transcript_url    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, audit_type, call_date)
);

CREATE TABLE IF NOT EXISTS ps_project_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES ps_accounts (id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE')),
  body        TEXT,
  due_date    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ps_call_preps_account_idx ON ps_call_preps (account_id, call_date DESC);
CREATE INDEX IF NOT EXISTS ps_audits_account_idx ON ps_audits (account_id, audit_type, call_date DESC);
CREATE INDEX IF NOT EXISTS ps_project_notes_account_idx ON ps_project_notes (account_id, status);

ALTER TABLE ps_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_call_preps ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ps_project_notes ENABLE ROW LEVEL SECURITY;

-- Read access for signed-in builder-app users (anon key, gated by the
-- app's Google OAuth wall). No public write policies — see header note.
CREATE POLICY "Allow public read" ON ps_accounts FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON ps_call_preps FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON ps_audits FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON ps_project_notes FOR SELECT USING (true);
