-- v17: security lockdown. Safe to re-run.
--
-- The browser only uses Supabase for sign-in and knowledge-base uploads; every
-- data read and write goes through the backend with the service-role key, which
-- bypasses these grants and RLS. So signed-in users (and anonymous visitors)
-- get no direct access to any table. This closes, among others:
--   * a user approving their own account (users.access_approved), skipping
--     admin approval, or changing users.email,
--   * a fresh project where public.companies has RLS off (plan, limits,
--     suspension status editable by anyone with the public anon key),
--   * any future table added without a correct RLS policy.

-- 1. No direct table access for browser roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

-- 2. Defence in depth: RLS on every table, even though the grants above already deny access.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- 3. Also protect approval and email in the user row trigger (v5 only covered role and company_id).
create or replace function public.protect_user_sensitive_columns()
returns trigger as $$
begin
  if auth.uid() is not null and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    if new.role is distinct from old.role then
      raise exception 'Permission denied: cannot modify user role directly';
    end if;
    if new.company_id is distinct from old.company_id then
      raise exception 'Permission denied: cannot modify company_id directly';
    end if;
    if new.access_approved is distinct from old.access_approved then
      raise exception 'Permission denied: cannot modify access approval directly';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Permission denied: cannot modify email directly';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 4. Knowledge-base uploads: private bucket, 10 MB per file. (File types are
--    checked by the backend by extension; browsers report CSV MIME types too
--    inconsistently to filter on them here.)
update storage.buckets
set public = false,
    file_size_limit = 10485760
where id = 'knowledge_base';
