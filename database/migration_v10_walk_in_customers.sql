-- database/migration_v10_walk_in_customers.sql
-- Run this in your Supabase SQL editor AFTER migration_v9_access_approval.sql.
-- Safe to re-run.
--
-- Customers added by hand (walk-ins, phone calls, trade counter). Customers who
-- were quoted are still derived from their quotes; these rows add the people you
-- met offline, and the details that stay fixed on every quote made for them.

create table if not exists public.customers (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  name text not null,
  company text,
  email text,
  phone text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_customers_company on public.customers (company_id);

alter table public.customers enable row level security;
-- No policies: only the backend (service role) reads and writes this table.

-- A lead created for a saved customer remembers who it is for.
alter table public.leads add column if not exists customer_id uuid references public.customers(id) on delete set null;
