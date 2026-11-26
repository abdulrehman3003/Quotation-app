-- database/migration_v9_access_approval.sql
-- Run this in your Supabase SQL editor AFTER migration_v8_mail_oauth.sql.
-- Safe to re-run.
--
-- Closes open sign-up: anyone with the public anon key can create a Supabase Auth
-- account, but the backend now refuses every request from an account that an admin
-- has not approved. Admin-created users and teammates who join through an invite
-- link are approved automatically.

alter table public.users
  add column if not exists access_approved boolean not null default false;

-- Accounts that existed before open sign-up was closed keep working. Only the first
-- run approves anyone; later runs leave the column alone.
do $$
begin
  if not exists (select 1 from public.app_settings where id = 'access_approval_backfilled') then
    update public.users set access_approved = true;
    insert into public.app_settings (id, value) values ('access_approval_backfilled', '{"done": true}'::jsonb);
  end if;
end $$;
