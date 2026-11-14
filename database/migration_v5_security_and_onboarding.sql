-- database/migration_v5_security_and_onboarding.sql
-- Run this in your Supabase SQL editor AFTER migration_v4.sql.
-- Safe to re-run (idempotent).

-- 1. Add onboarding_completed flag to public.users
alter table public.users add column if not exists onboarding_completed boolean not null default false;

-- 2. Add message_uid to customer_emails to prevent duplicate IMAP email ingestion
alter table public.customer_emails add column if not exists message_uid text;

create unique index if not exists idx_customer_emails_company_message_uid
  on public.customer_emails (company_id, message_uid)
  where message_uid is not null;

-- 3. Fix Multi-Tenant Isolation & Duplicate Email Trigger Error in handle_new_user()
--    Each new signup gets their own isolated company workspace (unless company_id
--    was explicitly provided in user_metadata), and conflicts on id/email are
--    handled safely without aborting auth.users creation.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  target_company_id uuid;
  meta_company_name text;
  meta_full_name text;
begin
  meta_company_name := nullif(trim(coalesce(new.raw_user_meta_data->>'company_name', '')), '');
  meta_full_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')), '');

  -- Check if an explicit company_id was passed in user_metadata
  begin
    if new.raw_user_meta_data->>'company_id' is not null then
      target_company_id := (new.raw_user_meta_data->>'company_id')::uuid;
    end if;
  exception when others then
    target_company_id := null;
  end;

  -- Create a dedicated company tenant for this user if none was specified
  if target_company_id is null then
    insert into public.companies (name)
    values (coalesce(meta_company_name, split_part(new.email, '@', 1) || '''s Workspace'))
    returning id into target_company_id;
  end if;

  insert into public.users (id, email, name, company_id, role, onboarding_completed)
  values (
    new.id,
    lower(trim(new.email)),
    meta_full_name,
    target_company_id,
    'user',
    false
  )
  on conflict (id) do update
    set email = excluded.email,
        name = coalesce(public.users.name, excluded.name),
        company_id = coalesce(public.users.company_id, excluded.company_id);

  return new;
end;
$$ language plpgsql security definer;

-- 4. Security Hardening: Prevent privilege escalation on public.users
--    Authenticated users updating their own row via Supabase client must not be
--    able to change their own `role` (e.g. to 'admin') or hijack another `company_id`.
create or replace function public.protect_user_sensitive_columns()
returns trigger as $$
begin
  -- Allow service_role / postgres admin operations (where auth.uid() is null or role is service_role)
  if auth.uid() is not null and coalesce( current_setting('request.jwt.claim.role', true), '' ) <> 'service_role' then
    if new.role is distinct from old.role then
      raise exception 'Permission denied: cannot modify user role directly';
    end if;
    if new.company_id is distinct from old.company_id then
      raise exception 'Permission denied: cannot modify company_id directly';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists enforce_user_sensitive_columns on public.users;
create trigger enforce_user_sensitive_columns
  before update on public.users
  for each row execute procedure public.protect_user_sensitive_columns();

-- 5. Update whatsapp_messages RLS policies to isolate by company_id
drop policy if exists "Allow users to read messages of their own chats" on public.whatsapp_messages;
drop policy if exists "Allow users to insert messages to their own chats" on public.whatsapp_messages;
drop policy if exists "Allow company users to read whatsapp_messages" on public.whatsapp_messages;
drop policy if exists "Allow company users to insert whatsapp_messages" on public.whatsapp_messages;

create policy "Allow company users to read whatsapp_messages"
  on public.whatsapp_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.whatsapp_chats c
      where c.id = chat_id and c.company_id = public.get_user_company()
    )
  );

create policy "Allow company users to insert whatsapp_messages"
  on public.whatsapp_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.whatsapp_chats c
      where c.id = chat_id and c.company_id = public.get_user_company()
    )
  );
