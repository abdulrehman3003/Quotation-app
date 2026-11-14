-- database/migration_v8_mail_oauth.sql
-- Run this in your Supabase SQL editor AFTER migration_v7_automation.sql.
-- Safe to re-run (idempotent).

-- Mailboxes connected with "Sign in with Google / Microsoft" instead of an app
-- password. Only an encrypted refresh token is stored; it can be revoked from
-- the Google or Microsoft account at any time.
create table if not exists public.mail_connections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null unique references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('google', 'microsoft')),
  email text not null,
  encrypted_refresh_token text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_mail_connections_company on public.mail_connections (company_id);

alter table public.mail_connections enable row level security;
-- No policies: only the backend (service role) reads/writes this table.
