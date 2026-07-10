import { SUPABASE_URL, headers } from './supabase';
import * as mock from './psHubMock';

// Local test-data fallback: the ps_accounts/etc. tables don't exist in the
// live Supabase project yet (migration not applied there). Rather than
// blocking UX review on that, every read/write below falls back to
// psHubMock's in-memory fixtures when the real call fails — but only in
// `npm run dev` (import.meta.env.DEV is statically false in production
// builds, so this never masks a real outage once deployed).
let mockMode = false;
export function isPsHubMockMode() { return mockMode; }

async function withFallback(real, fallback) {
  if (!import.meta.env.DEV) return real();
  try {
    const result = await real();
    mockMode = false;
    return result;
  } catch (e) {
    console.warn('[ps-hub] using local test data:', e.message);
    mockMode = true;
    return fallback();
  }
}

export async function fetchPsAccounts({ ownerEmail, activeOnly, accountType } = {}) {
  return withFallback(
    async () => {
      const params = ['select=*', 'order=name'];
      if (ownerEmail) params.push(`owner_email=eq.${encodeURIComponent(ownerEmail)}`);
      if (activeOnly) params.push('is_active=eq.true');
      if (accountType) params.push(`account_type=eq.${encodeURIComponent(accountType)}`);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_accounts?${params.join('&')}`, { headers });
      if (!res.ok) throw new Error(`Failed to load accounts (${res.status})`);
      return res.json();
    },
    () => mock.mockFetchPsBoard({ ownerEmail, activeOnly, accountType }),
  );
}

// Board cards need the latest call prep / audit / open note count per account.
// One round trip: embed the last 3 of each and reduce client-side rather than
// firing a query per account.
export async function fetchPsBoard({ ownerEmail, activeOnly, accountType } = {}) {
  return withFallback(
    async () => {
      const params = [
        'select=*,ps_call_preps(call_date,dep_score),ps_audits(audit_type,call_date,total_score,max_score),ps_project_notes(status)',
        'order=name',
        'ps_call_preps.order=call_date.desc',
        'ps_call_preps.limit=1',
        'ps_audits.order=call_date.desc',
        'ps_audits.limit=1',
      ];
      if (ownerEmail) params.push(`owner_email=eq.${encodeURIComponent(ownerEmail)}`);
      if (activeOnly) params.push('is_active=eq.true');
      if (accountType) params.push(`account_type=eq.${encodeURIComponent(accountType)}`);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_accounts?${params.join('&')}`, { headers });
      if (!res.ok) throw new Error(`Failed to load board (${res.status})`);
      const rows = await res.json();
      return rows.map((a) => ({
        ...a,
        latestCallPrep: a.ps_call_preps?.[0] || null,
        latestAudit: a.ps_audits?.[0] || null,
        openNoteCount: (a.ps_project_notes || []).filter((n) => n.status !== 'DONE').length,
      }));
    },
    () => mock.mockFetchPsBoard({ ownerEmail, activeOnly, accountType }),
  );
}

export async function fetchPsAccount(id) {
  return withFallback(
    async () => {
      const url =
        `${SUPABASE_URL}/rest/v1/ps_accounts` +
        `?id=eq.${encodeURIComponent(id)}` +
        `&select=*,ps_call_preps(*),ps_audits(*),ps_project_notes(*)` +
        `&ps_call_preps.order=call_date.desc&ps_call_preps.limit=10` +
        `&ps_audits.order=call_date.desc&ps_audits.limit=10` +
        `&ps_project_notes.order=updated_at.desc&ps_project_notes.limit=50` +
        `&limit=1`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`Failed to load account (${res.status})`);
      const rows = await res.json();
      return rows[0] || null;
    },
    () => mock.mockFetchPsAccount(id),
  );
}

export async function updatePsAccount(id, updates) {
  return withFallback(
    async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_accounts?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Update account failed (${res.status})`);
      const rows = await res.json();
      return rows[0] || null;
    },
    () => mock.mockUpdatePsAccount(id, updates),
  );
}

export async function updateCallPrep(id, updates) {
  return withFallback(
    async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_call_preps?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Update call prep failed (${res.status})`);
      const rows = await res.json();
      return rows[0] || null;
    },
    () => mock.mockUpdateCallPrep(id, updates),
  );
}

export async function updateAudit(id, updates) {
  return withFallback(
    async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_audits?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`Update audit failed (${res.status})`);
      const rows = await res.json();
      return rows[0] || null;
    },
    () => mock.mockUpdateAudit(id, updates),
  );
}

export async function createProjectNote({ accountId, title, status, body, dueDate }) {
  return withFallback(
    async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_project_notes`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          account_id: accountId,
          title,
          status: status || 'OPEN',
          body: body || null,
          due_date: dueDate || null,
        }),
      });
      if (!res.ok) throw new Error(`Create project note failed (${res.status})`);
      const rows = await res.json();
      return rows[0] || null;
    },
    () => mock.mockCreateProjectNote({ accountId, title, status, body, dueDate }),
  );
}

export async function updateProjectNote(id, updates) {
  return withFallback(
    async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_project_notes?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`Update project note failed (${res.status})`);
      const rows = await res.json();
      return rows[0] || null;
    },
    () => mock.mockUpdateProjectNote(id, updates),
  );
}

export async function deleteProjectNote(id) {
  return withFallback(
    async () => {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_project_notes?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error(`Delete project note failed (${res.status})`);
    },
    () => mock.mockDeleteProjectNote(id),
  );
}
