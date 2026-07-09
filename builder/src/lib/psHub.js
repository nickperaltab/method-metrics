import { SUPABASE_URL, headers } from './supabase';

export async function fetchPsAccounts() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/ps_accounts?select=*&order=name`, { headers });
  if (!res.ok) throw new Error(`Failed to load accounts (${res.status})`);
  return res.json();
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
