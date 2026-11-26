-- database/migration_v11_plans.sql
-- Run this in your Supabase SQL editor AFTER migration_v10_walk_in_customers.sql.
-- Safe to re-run.
--
-- 1. A plan per company (Starter / Growth / Scale), with optional custom limits.
--    Limits are enforced by the backend: users per company and AI-drafted quotes
--    per calendar month. NULL custom limits mean "use the plan's limit".
-- 2. Sign-up no longer trusts a company_id sent by the browser. Before this, anyone
--    holding the public anon key could sign up straight into any company whose id
--    they knew. Joining a company now only happens through the backend, which checks
--    the signed invite link and the plan's user limit.

alter table public.companies add column if not exists plan text not null default 'starter';
alter table public.companies add column if not exists max_users integer;
alter table public.companies add column if not exists max_quotes_per_month integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_plan_check') then
    alter table public.companies add constraint companies_plan_check check (plan in ('starter', 'growth', 'scale'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'companies_limits_check') then
    alter table public.companies add constraint companies_limits_check
      check ((max_users is null or max_users >= 1) and (max_quotes_per_month is null or max_quotes_per_month >= 0));
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger as $$
declare
  target_company_id uuid;
  meta_company_name text;
  meta_full_name text;
begin
  meta_company_name := nullif(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
  meta_full_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), '');

  -- Every sign-up starts in its own workspace. A company_id in the metadata is
  -- ignored; accepting an invite moves the user into the inviting company.
  insert into public.companies (name)
  values (coalesce(meta_company_name, split_part(new.email, '@', 1) || '''s Workspace'))
  returning id into target_company_id;

  insert into public.users (id, email, name, company_id, role, onboarding_completed)
  values (new.id, lower(trim(new.email)), meta_full_name, target_company_id, 'user', false)
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(public.users.name, excluded.name),
        company_id = coalesce(public.users.company_id, excluded.company_id);

  return new;
end;
$$ language plpgsql security definer set search_path = public;
