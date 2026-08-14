// Fixture-backed stand-in for the Supabase REST calls in lib/supabase.js.
// Active only in MOCK_MODE, and only when VITE_MOCK_SUPABASE !== 'false'.
//
// Why it's separately switchable: the Supabase anon key needs no Google login,
// so with a network connection you can keep the *real* metric catalog and
// dashboards while still faking the PS/BigQuery data. Set
// VITE_MOCK_SUPABASE=false in .env.mock for that. The default is full offline.
//
// Reads of unknown tables return an empty array (logged once), and writes are
// swallowed — nothing in mock mode should ever touch the shared database.

import { MOCK_MODE, MOCK_USER, mockWarn } from './mockMode.js';

export const MOCK_SUPABASE = MOCK_MODE && import.meta.env.VITE_MOCK_SUPABASE !== 'false';

/** Minimal Response stand-in — lib/supabase.js only uses ok/status/json/text. */
function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK (mock)',
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** `table` out of `…/rest/v1/<table>?…`, or null for non-REST URLs. */
function tableOf(url) {
  return String(url).match(/\/rest\/v1\/([A-Za-z0-9_]+)/)?.[1] ?? null;
}

// Tables the mock app has fixtures for. Anything else reads as empty.
const TABLES = {
  users: [MOCK_USER],
};

export async function mockSupabaseFetch(url, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const table = tableOf(url);

  if (method !== 'GET') {
    // Upserting the signed-in user is a normal part of sign-in — answer it with
    // the fixture user instead of warning about it.
    if (table === 'users') return jsonResponse([MOCK_USER]);
    mockWarn(`swallowed ${method} to ${table ?? url} — mock mode never writes`, url);
    return jsonResponse([]);
  }

  if (!table) {
    mockWarn(`unrouted Supabase URL — returning empty`, url);
    return jsonResponse([]);
  }
  const rows = TABLES[table];
  if (!rows) {
    mockWarn(`no fixture for Supabase table "${table}" — returning empty`, url);
    return jsonResponse([]);
  }
  return jsonResponse(rows);
}
