-- database/migration_v2.sql
-- Run this in your Supabase SQL editor to enable the new features

-- 1. Add new columns to public.users for settings and credentials
alter table public.users add column if not exists name text;
alter table public.users add column if not exists phone_number text;
alter table public.users add column if not exists role text not null default 'user';
alter table public.users add column if not exists encrypted_gemini_key text;
alter table public.users add column if not exists encrypted_gmail_email text;
alter table public.users add column if not exists encrypted_gmail_password text;
alter table public.users add column if not exists encrypted_twilio_sid text;
alter table public.users add column if not exists encrypted_twilio_token text;
alter table public.users add column if not exists encrypted_twilio_phone text;
alter table public.users add column if not exists default_quote_parameters jsonb not null default '{}'::jsonb;

-- Ensure RLS allows reading/updating own settings
-- (existing policies on public.users already check id = auth.uid() so new columns are automatically covered)

-- 2. Create public.system_logs table
create table if not exists public.system_logs (
  id uuid default gen_random_uuid() primary key,
  source text not null, -- 'backend', 'frontend'
  level text not null,  -- 'INFO', 'WARNING', 'ERROR'
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on system_logs
alter table public.system_logs enable row level security;

-- Policies for system_logs
create policy "Allow admins to read all system logs"
  on public.system_logs for select
  to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Allow all users to insert system logs"
  on public.system_logs for insert
  to authenticated
  with check (true);

-- 3. Create public.dispatched_quotes table for quotation tracking and reports
create table if not exists public.dispatched_quotes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null default auth.uid(),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  cost_description text not null,
  quantity integer not null default 1,
  total_amount numeric(12, 2) not null default 0.00,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on dispatched_quotes
alter table public.dispatched_quotes enable row level security;

-- Policies for dispatched_quotes
create policy "Allow users to read their own dispatched quotes"
  on public.dispatched_quotes for select
  to authenticated
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.users
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Allow users to insert/update their own dispatched quotes"
  on public.dispatched_quotes for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Set the first user in the database to admin role for testing purposes (optional/convenient fallback)
update public.users set role = 'admin' where id in (select id from public.users order by created_at asc limit 1);
