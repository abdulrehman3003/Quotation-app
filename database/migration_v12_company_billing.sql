-- database/migration_v12_company_billing.sql
-- Run this in your Supabase SQL editor AFTER migration_v11_plans.sql.
-- Safe to re-run.
--
-- Billing and account status per customer company, managed by the platform admin.
-- Payments are invoiced by hand (Payoneer), so the app keeps the dates and notes,
-- and a "suspended" switch that locks a non-paying company out of the app.

alter table public.companies add column if not exists status text not null default 'active';
alter table public.companies add column if not exists next_invoice_date date;
alter table public.companies add column if not exists setup_fee_paid boolean not null default false;
alter table public.companies add column if not exists billing_notes text;
alter table public.companies add column if not exists contact_email text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_status_check') then
    alter table public.companies add constraint companies_status_check check (status in ('active', 'suspended'));
  end if;
end $$;
