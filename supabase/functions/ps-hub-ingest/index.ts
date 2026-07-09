/**
 * ps-hub-ingest — write endpoint for PS Hub call preps, audits, and project
 * notes, called by Claude routines (call-prep, free-hour-audit, ps-call-audit).
 *
 * Auth: static shared secret in `Authorization: Bearer <PS_HUB_ROUTINE_KEY>`.
 * Not per-user — routines run unattended, there's no Google account to check.
 * Writes use the service-role key, bypassing RLS (the ps_* tables have no
 * anon write policies on purpose — this function is the only write path).
 *
 * Body: { resource: "account"|"call_prep"|"audit"|"project_note", ... }
 * Accounts are targeted by `account_id` or `method_customer_id`.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Result = { status: number; body: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}

const ACCOUNT_TYPES = ['DEDICATED', 'PPU', 'FREE'];
const AUDIT_TYPES = ['PPU', 'FREE_HOUR'];
const NOTE_STATUSES = ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE'];

async function resolveAccountId(
  sb: SupabaseClient,
  body: Record<string, unknown>,
): Promise<string | null> {
  if (typeof body.account_id === 'string') return body.account_id;
  if (typeof body.method_customer_id === 'string') {
    const { data } = await sb
      .from('ps_accounts')
      .select('id')
      .eq('method_customer_id', body.method_customer_id)
      .maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

async function upsertAccount(sb: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const { name, method_customer_id, account_type, is_dedicated } = body;

  if (!name || !account_type) {
    return { status: 400, body: { error: 'name and account_type are required' } };
  }
  if (!ACCOUNT_TYPES.includes(account_type as string)) {
    return { status: 400, body: { error: 'invalid account_type' } };
  }

  const data = {
    name,
    account_type,
    is_dedicated: Boolean(is_dedicated),
    updated_at: new Date().toISOString(),
  };

  const query = method_customer_id
    ? sb.from('ps_accounts').upsert({ ...data, method_customer_id }, { onConflict: 'method_customer_id' })
    : sb.from('ps_accounts').insert(data);

  const { data: row, error } = await query.select().single();
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 201, body: { account: row } };
}

async function upsertCallPrep(sb: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const { call_date, summary, content, dep_score, source_doc_url } = body;

  if (!call_date || !summary || !content) {
    return { status: 400, body: { error: 'call_date, summary, and content are required' } };
  }

  const accountId = await resolveAccountId(sb, body);
  if (!accountId) return { status: 404, body: { error: 'account not found' } };

  const { data: row, error } = await sb
    .from('ps_call_preps')
    .upsert(
      {
        account_id: accountId,
        call_date,
        summary,
        content,
        dep_score: dep_score ?? null,
        source_doc_url: source_doc_url ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id,call_date' },
    )
    .select()
    .single();

  if (error) return { status: 500, body: { error: error.message } };
  return { status: 201, body: { call_prep: row } };
}

async function upsertAudit(sb: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const {
    audit_type,
    call_date,
    total_score,
    max_score,
    score_breakdown,
    flags,
    notes,
    transcript_url,
  } = body;

  if (!audit_type || !call_date) {
    return { status: 400, body: { error: 'audit_type and call_date are required' } };
  }
  if (!AUDIT_TYPES.includes(audit_type as string)) {
    return { status: 400, body: { error: 'invalid audit_type' } };
  }

  const accountId = await resolveAccountId(sb, body);
  if (!accountId) return { status: 404, body: { error: 'account not found' } };

  const { data: row, error } = await sb
    .from('ps_audits')
    .upsert(
      {
        account_id: accountId,
        audit_type,
        call_date,
        total_score: total_score ?? null,
        max_score: max_score ?? null,
        score_breakdown: score_breakdown ?? null,
        flags: flags ?? null,
        notes: notes ?? null,
        transcript_url: transcript_url ?? null,
      },
      { onConflict: 'account_id,audit_type,call_date' },
    )
    .select()
    .single();

  if (error) return { status: 500, body: { error: error.message } };
  return { status: 201, body: { audit: row } };
}

async function upsertProjectNote(sb: SupabaseClient, body: Record<string, unknown>): Promise<Result> {
  const { id, title, status, body: noteBody, due_date, action } = body;

  if (action === 'delete') {
    if (!id) return { status: 400, body: { error: 'id is required to delete' } };
    const { error } = await sb.from('ps_project_notes').delete().eq('id', id);
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { ok: true } };
  }

  if (status && !NOTE_STATUSES.includes(status as string)) {
    return { status: 400, body: { error: 'invalid status' } };
  }

  if (id) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (status !== undefined) updates.status = status;
    if (noteBody !== undefined) updates.body = noteBody;
    if (due_date !== undefined) updates.due_date = due_date;

    const { data: row, error } = await sb
      .from('ps_project_notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { project_note: row } };
  }

  if (!title) return { status: 400, body: { error: 'title is required' } };

  const accountId = await resolveAccountId(sb, body);
  if (!accountId) return { status: 404, body: { error: 'account not found' } };

  const { data: row, error } = await sb
    .from('ps_project_notes')
    .insert({
      account_id: accountId,
      title,
      status: status ?? 'OPEN',
      body: noteBody ?? null,
      due_date: due_date ?? null,
    })
    .select()
    .single();

  if (error) return { status: 500, body: { error: error.message } };
  return { status: 201, body: { project_note: row } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const routineKey = Deno.env.get('PS_HUB_ROUTINE_KEY');
  const authHeader = req.headers.get('authorization');
  if (!routineKey || authHeader !== `Bearer ${routineKey}`) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let result: Result;
  switch (body.resource) {
    case 'account':
      result = await upsertAccount(sb, body);
      break;
    case 'call_prep':
      result = await upsertCallPrep(sb, body);
      break;
    case 'audit':
      result = await upsertAudit(sb, body);
      break;
    case 'project_note':
      result = await upsertProjectNote(sb, body);
      break;
    default:
      result = { status: 400, body: { error: 'unknown or missing resource' } };
  }

  return json(result.body, result.status);
});
