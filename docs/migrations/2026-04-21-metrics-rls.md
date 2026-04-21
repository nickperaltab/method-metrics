# 2026-04-21 — metrics RLS lockdown

Applied via Supabase MCP. Part of Ticket 1 (permissions & destructive-action cleanup).

## Change

Replace the permissive `service_all` policy on `public.metrics` with four role-aware policies backed by `is_admin_request()`, which reads the client-sent `x-method-email` header and looks up role in `public.users`.

## Threat model (Option E)

The header is client-asserted and spoofable — but the anon key is already public and the tool is internal. Primary threat is accidental destructive action by non-admins, which this closes at the database layer. If the threat model changes (external users, customer data), upgrade to Option C (Edge Function proxy with Google token verification) or Option F (Supabase Auth).

## SQL

```sql
create or replace function public.is_admin_request()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_email text;
  v_role text;
begin
  v_email := current_setting('request.headers', true)::jsonb ->> 'x-method-email';
  if v_email is null then return false; end if;
  select role into v_role from public.users where email = v_email;
  return v_role = 'admin';
end;
$$;

drop policy if exists service_all on public.metrics;

create policy metrics_select_live_or_admin
  on public.metrics
  for select
  to anon, authenticated
  using (status = 'live' or public.is_admin_request());

create policy metrics_insert_admin
  on public.metrics
  for insert
  to anon, authenticated
  with check (public.is_admin_request());

create policy metrics_update_admin
  on public.metrics
  for update
  to anon, authenticated
  using (public.is_admin_request())
  with check (public.is_admin_request());

create policy metrics_delete_admin
  on public.metrics
  for delete
  to anon, authenticated
  using (public.is_admin_request());
```

## Prerequisites

Must be applied AFTER the client deploy that adds `x-method-email` to request headers. Otherwise all writes (and non-live reads) from the deployed client fail.

## Rollback

If the new policies cause problems, restore the old permissive behavior:
```sql
drop policy if exists metrics_select_live_or_admin on public.metrics;
drop policy if exists metrics_insert_admin on public.metrics;
drop policy if exists metrics_update_admin on public.metrics;
drop policy if exists metrics_delete_admin on public.metrics;

create policy service_all
  on public.metrics
  for all
  to public
  using (true)
  with check (true);
```

Keep `is_admin_request()` — it's harmless without the policies that reference it.
