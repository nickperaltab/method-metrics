-- Per-user bearer tokens for the Metrics MCP server.
-- Plaintext is never stored — only a SHA-256 hash. The plaintext is shown once
-- when generated (see scripts/generate_mcp_token.py) and shared via 1Password.

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email    TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  note          TEXT
);

CREATE INDEX IF NOT EXISTS mcp_tokens_user_email_idx ON mcp_tokens (user_email);
CREATE INDEX IF NOT EXISTS mcp_tokens_active_idx ON mcp_tokens (token_hash) WHERE revoked_at IS NULL;

-- Audit log: every MCP tool call. One row per call. Paired with token_id.
CREATE TABLE IF NOT EXISTS mcp_audit (
  id            BIGSERIAL PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  token_id      UUID REFERENCES mcp_tokens(id),
  tool          TEXT NOT NULL,
  args          JSONB,
  success       BOOLEAN NOT NULL,
  error_code    TEXT,
  latency_ms    INTEGER,
  bytes_billed  BIGINT,
  rows_returned INTEGER
);

CREATE INDEX IF NOT EXISTS mcp_audit_created_at_idx ON mcp_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS mcp_audit_token_id_idx ON mcp_audit (token_id);
CREATE INDEX IF NOT EXISTS mcp_audit_tool_idx ON mcp_audit (tool);

-- RLS: these tables are service-side only. Block all direct client access.
ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_audit  ENABLE ROW LEVEL SECURITY;
-- No policies = service role only.
