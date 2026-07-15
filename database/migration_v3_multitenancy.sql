-- database/migration_v3_multitenancy.sql
-- Run this in your Supabase SQL editor to enable Multi-Tenant Company Isolation

-- 1. Create the companies table
create table if not exists public.companies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Seed a default company for existing users/data
insert into public.companies (id, name)
values ('00000000-0000-0000-0000-000000000000', 'Default Company')
on conflict (id) do nothing;

-- 2. Add company_id to public.users and associate all existing users with the Default Company
alter table public.users add column if not exists company_id uuid references public.companies(id) on delete set null;
update public.users set company_id = '00000000-0000-0000-0000-000000000000' where company_id is null;

-- Ensure handle_new_user trigger automatically assigns new signups to the Default Company
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, company_id)
  values (new.id, new.email, '00000000-0000-0000-0000-000000000000');
  return new;
end;
$$ language plpgsql security definer;

-- 3. Add company_id to data tables
alter table public.leads add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.quotes add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.knowledge_base add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.customer_emails add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.whatsapp_chats add column if not exists company_id uuid references public.companies(id) on delete cascade;
alter table public.dispatched_quotes add column if not exists company_id uuid references public.companies(id) on delete cascade;

-- 4. Backfill existing records with the Default Company ID
update public.leads set company_id = '00000000-0000-0000-0000-000000000000' where company_id is null;
update public.quotes set company_id = '00000000-0000-0000-0000-000000000000' where company_id is null;
update public.knowledge_base set company_id = '00000000-0000-0000-0000-000000000000' where company_id is null;
update public.customer_emails set company_id = '00000000-0000-0000-0000-000000000000' where company_id is null;
update public.whatsapp_chats set company_id = '00000000-0000-0000-0000-000000000000' where company_id is null;
update public.dispatched_quotes set company_id = '00000000-0000-0000-0000-000000000000' where company_id is null;

-- Set NOT NULL constraint on company_id for strict isolation enforcement
alter table public.leads alter column company_id set not null;
alter table public.quotes alter column company_id set not null;
alter table public.knowledge_base alter column company_id set not null;
alter table public.customer_emails alter column company_id set not null;
alter table public.whatsapp_chats alter column company_id set not null;
alter table public.dispatched_quotes alter column company_id set not null;

-- 5. Helper function to check user's company
create or replace function public.get_user_company()
returns uuid security definer as $$
declare
  comp_id uuid;
begin
  select company_id into comp_id from public.users where id = auth.uid();
  return comp_id;
end;
$$ language plpgsql;

-- 6. Update Row-Level Security (RLS) policies to isolate by company_id instead of user_id

-- Users table policies
drop policy if exists "Allow users to read their own profile" on public.users;
drop policy if exists "Allow users to update their own profile" on public.users;
create policy "Allow users to read profiles in same company"
  on public.users for select to authenticated
  using (company_id = public.get_user_company());
create policy "Allow users to update their own profile"
  on public.users for update to authenticated
  using (id = auth.uid());

-- Leads table policies
drop policy if exists "Allow authenticated users to read their own leads" on public.leads;
drop policy if exists "Allow authenticated users to insert their own leads" on public.leads;
drop policy if exists "Allow authenticated users to update their own leads" on public.leads;
drop policy if exists "Allow authenticated users to delete their own leads" on public.leads;
create policy "Allow company users to read leads"
  on public.leads for select to authenticated
  using (company_id = public.get_user_company());
create policy "Allow company users to insert leads"
  on public.leads for insert to authenticated
  with check (company_id = public.get_user_company());
create policy "Allow company users to update leads"
  on public.leads for update to authenticated
  using (company_id = public.get_user_company());
create policy "Allow company users to delete leads"
  on public.leads for delete to authenticated
  using (company_id = public.get_user_company());

-- Quotes table policies
drop policy if exists "Allow authenticated users to read their own quotes" on public.quotes;
drop policy if exists "Allow authenticated users to insert their own quotes" on public.quotes;
drop policy if exists "Allow authenticated users to update their own quotes" on public.quotes;
drop policy if exists "Allow authenticated users to delete their own quotes" on public.quotes;
create policy "Allow company users to read quotes"
  on public.quotes for select to authenticated
  using (company_id = public.get_user_company());
create policy "Allow company users to insert quotes"
  on public.quotes for insert to authenticated
  with check (company_id = public.get_user_company());
create policy "Allow company users to update quotes"
  on public.quotes for update to authenticated
  using (company_id = public.get_user_company());
create policy "Allow company users to delete quotes"
  on public.quotes for delete to authenticated
  using (company_id = public.get_user_company());

-- Knowledge base table policies
drop policy if exists "Allow authenticated users to read their own knowledge_base" on public.knowledge_base;
drop policy if exists "Allow authenticated users to insert their own knowledge_base" on public.knowledge_base;
drop policy if exists "Allow authenticated users to update their own knowledge_base" on public.knowledge_base;
drop policy if exists "Allow authenticated users to delete their own knowledge_base" on public.knowledge_base;
create policy "Allow company users to read knowledge_base"
  on public.knowledge_base for select to authenticated
  using (company_id = public.get_user_company());
create policy "Allow company users to insert knowledge_base"
  on public.knowledge_base for insert to authenticated
  with check (company_id = public.get_user_company());
create policy "Allow company users to update knowledge_base"
  on public.knowledge_base for update to authenticated
  using (company_id = public.get_user_company());
create policy "Allow company users to delete knowledge_base"
  on public.knowledge_base for delete to authenticated
  using (company_id = public.get_user_company());

-- Customer emails policies
drop policy if exists "Allow users to read their own customer_emails" on public.customer_emails;
drop policy if exists "Allow users to insert/update/delete their own customer_emails" on public.customer_emails;
create policy "Allow company users to read customer_emails"
  on public.customer_emails for select to authenticated
  using (company_id = public.get_user_company());
create policy "Allow company users to manage customer_emails"
  on public.customer_emails for all to authenticated
  using (company_id = public.get_user_company())
  with check (company_id = public.get_user_company());

-- WhatsApp chats policies
drop policy if exists "Allow users to read their own whatsapp_chats" on public.whatsapp_chats;
drop policy if exists "Allow users to manage their own whatsapp_chats" on public.whatsapp_chats;
create policy "Allow company users to read whatsapp_chats"
  on public.whatsapp_chats for select to authenticated
  using (company_id = public.get_user_company());
create policy "Allow company users to manage whatsapp_chats"
  on public.whatsapp_chats for all to authenticated
  using (company_id = public.get_user_company())
  with check (company_id = public.get_user_company());

-- Dispatched quotes policies
drop policy if exists "Allow users to read their own dispatched quotes" on public.dispatched_quotes;
drop policy if exists "Allow users to insert/update their own dispatched quotes" on public.dispatched_quotes;
create policy "Allow company users to read dispatched_quotes"
  on public.dispatched_quotes for select to authenticated
  using (company_id = public.get_user_company());
create policy "Allow company users to manage dispatched_quotes"
  on public.dispatched_quotes for all to authenticated
  using (company_id = public.get_user_company())
  with check (company_id = public.get_user_company());
