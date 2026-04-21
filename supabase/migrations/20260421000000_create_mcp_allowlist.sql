-- Email allowlist for self-service MCP token minting.
-- Anyone with an email in this table can generate their own MCP bearer token
-- via the /mcp-token page in the builder app. Out = no access.

CREATE TABLE IF NOT EXISTS mcp_allowlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by   TEXT,
  note       TEXT
);

CREATE INDEX IF NOT EXISTS mcp_allowlist_email_idx ON mcp_allowlist (LOWER(email));

-- Service-role only; no public policies.
ALTER TABLE mcp_allowlist ENABLE ROW LEVEL SECURITY;
