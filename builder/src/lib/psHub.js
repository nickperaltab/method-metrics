import { SUPABASE_URL, headers } from './supabase';

export async function fetchPsAccounts({ ownerEmail, activeOnly, accountType } = {}) {
  const params = ['select=*', 'order=name'];
  if (ownerEmail) params.push(`owner_email=eq.${encodeURIComponent(ownerEmail)}`);
  if (activeOnly) params.push('is_active=eq.true');
  if (accountType) params.push(`account_type=eq.${encodeURIComponent(accountType)}`);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_accounts?${params.join('&')}`, { headers });
  if (!res.ok) throw new Error(`Failed to load accounts (${res.status})`);
  return res.json();
}

// Board cards need the latest call prep / audit / open note count per account.
// One round trip: embed the last 3 of each and reduce client-side rather than
// firing a query per account.
export async function fetchPsBoard({ ownerEmail, activeOnly, accountType } = {}) {
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
}

export async function fetchPsAccount(id) {
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
}

export async function updatePsAccount(id, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_accounts?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Update account failed (${res.status})`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function updateCallPrep(id, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_call_preps?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Update call prep failed (${res.status})`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function updateAudit(id, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_audits?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`Update audit failed (${res.status})`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function createProjectNote({ accountId, title, status, body, dueDate }) {
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
}

export async function updateProjectNote(id, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_project_notes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Update project note failed (${res.status})`);
  const rows = await res.json();
  return rows[0] || null;
}

export async function deleteProjectNote(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_project_notes?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error(`Delete project note failed (${res.status})`);
}
