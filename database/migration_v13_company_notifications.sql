-- database/migration_v13_company_notifications.sql
-- Run this in your Supabase SQL editor AFTER migration_v12_company_billing.sql.
-- Safe to re-run.
--
-- Messages from the platform admin to a customer company (payment reminders,
-- service notices). Shown in the app's notification bell and, when pinned, as a
-- banner until the admin resolves it (e.g. once the invoice is paid).

create table if not exists public.company_notifications (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null default 'info',            -- 'payment' | 'info' | 'warning'
  title text not null,
  body text not null default '',
  amount numeric(12, 2),
  currency text,
  due_date date,
  payment_link text,
  show_banner boolean not null default false,
  resolved_at timestamp with time zone,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_notifications_kind_check') then
    alter table public.company_notifications add constraint company_notifications_kind_check
      check (kind in ('payment', 'info', 'warning'));
  end if;
end $$;

create index if not exists idx_company_notifications_company on public.company_notifications (company_id, created_at desc);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.company_notifications(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (notification_id, user_id)
);

alter table public.company_notifications enable row level security;
alter table public.notification_reads enable row level security;
-- No policies: only the backend (service role) reads and writes these tables.
