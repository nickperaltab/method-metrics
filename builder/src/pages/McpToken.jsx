import React, { useState } from 'react';

const MCP_ENDPOINT_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co/functions/v1/mcp-metrics';
const MINT_URL = 'https://agkubdpgnpwudzpzcvhs.supabase.co/functions/v1/mint-mcp-token';

const s = {
  layout: { maxWidth: 720, margin: '32px auto', padding: '0 24px', fontFamily: "'DM Sans', sans-serif" },
  h1: { fontSize: 24, fontWeight: 700, color: '#1a1a1a', marginBottom: 8 },
  sub: { fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 },
  card: { background: '#fff', border: '1px solid #e2e5e9', borderRadius: 10, padding: 24, marginBottom: 16 },
  h2: { fontSize: 15, fontWeight: 700, color: '#1a1a1a', marginBottom: 8, letterSpacing: '0.02em' },
  p: { fontSize: 13, color: '#374151', lineHeight: 1.55, marginBottom: 12 },
  code: { fontFamily: "'JetBrains Mono', monospace", fontSize: 12, background: '#f8f9fa', border: '1px solid #e2e5e9', borderRadius: 6, padding: '10px 12px', overflowWrap: 'anywhere', color: '#0f172a' },
  btn: { padding: '10px 18px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" },
  btnSec: { padding: '6px 12px', background: '#fff', border: '1px solid #e2e5e9', borderRadius: 5, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer', color: '#374151' },
  err: { padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13, marginTop: 12 },
  ok: { padding: 12, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, color: '#047857', fontSize: 13, marginTop: 12 },
  ol: { paddingLeft: 20, margin: '8px 0' },
  li: { fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 6 },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6, display: 'block' },
};

function buildDesktopConfig(token) {
  return JSON.stringify({
    mcpServers: {
      'method-metrics': {
        command: 'npx',
        args: ['-y', 'mcp-remote', MCP_ENDPOINT_URL, '--header', `Authorization:Bearer ${token}`],
      },
    },
  }, null, 2);
}

export default function McpToken({ userEmail, bqConnected, onConnect }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);

  async function mint() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const accessToken = localStorage.getItem('bq_access_token');
      if (!accessToken) {
        setError('No Google session found. Click "Connect Google Account" and try again.');
        return;
      }
      const res = await fetch(MINT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ google_access_token: accessToken, note: 'self-service web' }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'not_allowlisted') {
          setError(`Your email (${data.email}) isn't on the MCP allowlist yet. Ask Nic to add you.`);
        } else if (data.error === 'google_token_invalid') {
          setError('Your Google session expired. Reconnect and try again.');
        } else {
          setError(`Server error: ${data.error || 'unknown'}`);
        }
        return;
      }
      setResult(data);
    } catch (e) {
      setError(`Network error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  function copy(text, key) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!bqConnected) {
    return (
      <div style={s.layout}>
        <div style={s.h1}>Get your MCP token</div>
        <div style={s.sub}>Connect your Google account first.</div>
        <button style={s.btn} onClick={onConnect}>Connect Google Account</button>
      </div>
    );
  }

  return (
    <div style={s.layout}>
      <div style={s.h1}>Method Metrics MCP — your token</div>
      <div style={s.sub}>
        Generates a bearer token so Claude Desktop can query our metrics on your behalf.
        Only the people Nic has allowlisted can mint one. Signed in as <strong>{userEmail}</strong>.
      </div>

      <div style={s.card}>
        <div style={s.h2}>1. Generate token</div>
        <div style={s.p}>
          Minting a new token revokes any previous one you had. If you switch machines, just mint a new one.
        </div>
        <button style={s.btn} onClick={mint} disabled={loading}>
          {loading ? 'Generating…' : result ? 'Generate new token' : 'Generate my token'}
        </button>
        {error && <div style={s.err}>{error}</div>}
        {result && (
          <div style={{ marginTop: 16 }}>
            <span style={s.label}>Your token (copy now — we don't show it again)</span>
            <div style={s.code}>{result.token}</div>
            <button
              style={{ ...s.btnSec, marginTop: 8 }}
              onClick={() => copy(result.token, 'tok')}
            >
              {copied === 'tok' ? 'Copied ✓' : 'Copy token'}
            </button>
          </div>
        )}
      </div>

      {result && (
        <>
          <div style={s.card}>
            <div style={s.h2}>2a. Add to Claude Desktop (recommended)</div>
            <ol style={s.ol}>
              <li style={s.li}>Quit Claude Desktop (⌘Q).</li>
              <li style={s.li}>
                Open <code>~/Library/Application Support/Claude/claude_desktop_config.json</code>.
                If it doesn't exist, create it.
              </li>
              <li style={s.li}>Paste this inside (or merge with existing <code>mcpServers</code>):</li>
            </ol>
            <div style={s.code}><pre style={{ margin: 0, fontFamily: 'inherit' }}>{buildDesktopConfig(result.token)}</pre></div>
            <button
              style={{ ...s.btnSec, marginTop: 8 }}
              onClick={() => copy(buildDesktopConfig(result.token), 'cfg')}
            >
              {copied === 'cfg' ? 'Copied ✓' : 'Copy config'}
            </button>
            <ol style={{ ...s.ol, marginTop: 12 }} start={4}>
              <li style={s.li}>Save and reopen Claude Desktop. You should see <code>method-metrics</code> in the tools menu.</li>
            </ol>
          </div>

          <div style={s.card}>
            <div style={s.h2}>2b. Or add via Claude.ai custom connector (Enterprise)</div>
            <ol style={s.ol}>
              <li style={s.li}>Go to claude.ai → Settings → Connectors → Add custom connector.</li>
              <li style={s.li}>Name: <code>Method Metrics</code></li>
              <li style={s.li}>URL: <code>{MCP_ENDPOINT_URL}</code></li>
              <li style={s.li}>Auth: Bearer token → paste your token from above.</li>
            </ol>
          </div>

          <div style={s.card}>
            <div style={s.h2}>3. Try it</div>
            <div style={s.p}>Ask Claude something like <em>"Show me the Marketing Scorecard"</em> or <em>"What were our trials last month?"</em></div>
            <div style={s.p}>Problems? Ping Nic.</div>
          </div>
        </>
      )}
    </div>
  );
}
