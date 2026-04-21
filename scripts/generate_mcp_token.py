"""
Generate a bearer token for the Metrics MCP server.

Usage:
  python3 scripts/generate_mcp_token.py <user_email> [--note "reason"]

Creates a cryptographically random token, stores only its SHA-256 hash in
Supabase `mcp_tokens`, and prints the plaintext once. The plaintext is
never recoverable — capture it now (paste into 1Password) or regenerate.

Requires the SUPABASE_SERVICE_ROLE_KEY env var (service role, not anon — this
script needs to write to a RLS-protected table).

  export SUPABASE_SERVICE_ROLE_KEY=...
  python3 scripts/generate_mcp_token.py nick@method.me --note "desktop"
"""

import argparse
import hashlib
import os
import secrets
import sys

import requests

SUPABASE_URL = "https://agkubdpgnpwudzpzcvhs.supabase.co"


def main():
    parser = argparse.ArgumentParser(description="Mint an MCP bearer token for a user.")
    parser.add_argument("user_email", help="User's email (owner of this token)")
    parser.add_argument("--note", default=None, help="Optional note, e.g. 'laptop'")
    args = parser.parse_args()

    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not service_key:
        sys.exit("Error: set SUPABASE_SERVICE_ROLE_KEY env var (service role, not anon).")

    # token_urlsafe(32) -> ~43 chars, URL-safe, ~256 bits of entropy
    plaintext = f"mcp_{secrets.token_urlsafe(32)}"
    token_hash = hashlib.sha256(plaintext.encode()).hexdigest()

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    body = {
        "user_email": args.user_email,
        "token_hash": token_hash,
        "note": args.note,
    }
    res = requests.post(f"{SUPABASE_URL}/rest/v1/mcp_tokens", headers=headers, json=body)
    if res.status_code >= 300:
        sys.exit(f"Supabase error {res.status_code}: {res.text}")

    row = res.json()[0]
    print("=" * 60)
    print(f"Token ID:    {row['id']}")
    print(f"User:        {row['user_email']}")
    print(f"Created:     {row['created_at']}")
    print("=" * 60)
    print()
    print("PLAINTEXT TOKEN (copy now — not stored, not recoverable):")
    print()
    print(f"  {plaintext}")
    print()
    print("Paste into 1Password. Then hand it to the user to add to their")
    print("Claude Desktop MCP config as the `Authorization: Bearer ...` value.")


if __name__ == "__main__":
    main()
