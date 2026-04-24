-- OAuth 2.1 + Dynamic Client Registration support for the Metrics MCP.
--
-- The MCP server (mcp-metrics) acts as the OAuth resource server.
-- A new edge function (mcp-oauth) acts as the authorization server,
-- delegating actual user identity to Google. End result: a Claude client
-- gets back an MCP bearer token that lives in mcp_tokens, alongside the
-- existing self-mint tokens.

-- Registered OAuth clients (claude.ai instances, etc.).
-- Populated via Dynamic Client Registration (RFC 7591).
CREATE TABLE IF NOT EXISTS oauth_clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       TEXT NOT NULL UNIQUE,
  client_secret   TEXT,                              -- null for public clients
  redirect_uris   TEXT[] NOT NULL,
  client_name     TEXT,
  scope           TEXT,                              -- space-separated; null = no restriction
  registered_by   TEXT,                              -- IP or user agent for audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- State carried across the Google round-trip. The `state` column is the
-- opaque value we pass to Google; we look it up when Google calls back.
CREATE TABLE IF NOT EXISTS oauth_pending_authorizations (
  state                  TEXT PRIMARY KEY,
  client_id              TEXT NOT NULL,
  redirect_uri           TEXT NOT NULL,
  client_state           TEXT,                       -- echoed back to client untouched
  code_challenge         TEXT NOT NULL,              -- PKCE
  code_challenge_method  TEXT NOT NULL,              -- 'S256'
  resource               TEXT,                       -- RFC 8707 audience
  scope                  TEXT,
  expires_at             TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Authorization codes issued after Google sign-in succeeds. One-shot;
-- consumed at /token exchange. 10-minute TTL per OAuth 2.1.
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code                   TEXT PRIMARY KEY,
  client_id              TEXT NOT NULL,
  redirect_uri           TEXT NOT NULL,
  user_email             TEXT NOT NULL,
  code_challenge         TEXT NOT NULL,
  code_challenge_method  TEXT NOT NULL,
  resource               TEXT,
  scope                  TEXT,
  expires_at             TIMESTAMPTZ NOT NULL,
  consumed_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS oauth_pending_authorizations_expires_idx
  ON oauth_pending_authorizations (expires_at);
CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expires_idx
  ON oauth_authorization_codes (expires_at);

-- Extend mcp_tokens to support OAuth-issued tokens alongside the existing
-- self-mint flow. Existing rows keep null for these columns (= long-lived
-- static bearer, no audience binding). OAuth-issued rows get expiry +
-- audience + a refresh token hash for rotation.
ALTER TABLE mcp_tokens
  ADD COLUMN IF NOT EXISTS client_id          TEXT,
  ADD COLUMN IF NOT EXISTS audience           TEXT,
  ADD COLUMN IF NOT EXISTS expires_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS mcp_tokens_refresh_idx
  ON mcp_tokens (refresh_token_hash) WHERE refresh_token_hash IS NOT NULL;

-- Service-role only on every new table (no public RLS policies).
ALTER TABLE oauth_clients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_pending_authorizations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_authorization_codes      ENABLE ROW LEVEL SECURITY;
