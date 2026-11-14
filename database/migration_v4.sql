-- database/migration_v4.sql
-- Run this in your Supabase SQL editor AFTER migration_v3_multitenancy.sql.
-- Safe to re-run.

-- 1. Shared application settings (replaces backend/app/core/global_settings.json,
--    which was per-container and lost on redeploy).
create table if not exists public.app_settings (
  id text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.app_settings enable row level security;
-- No policies: only the backend (service role) reads/writes this table.

insert into public.app_settings (id, value)
values ('global', '{"base_labor_rate": 50.0, "base_material_markup": 1.2}'::jsonb)
on conflict (id) do nothing;

-- 2. Defensive default: derive company_id from user_id when an insert omits it.
--    v3 made company_id NOT NULL without a default, which broke inserts that
--    didn't pass it explicitly (IMAP poller, WhatsApp webhook).
create or replace function public.set_company_id_from_user()
returns trigger as $$
begin
  if new.company_id is null and new.user_id is not null then
    select company_id into new.company_id from public.users where id = new.user_id;
  end if;
  if new.company_id is null then
    new.company_id := '00000000-0000-0000-0000-000000000000';
  end if;
  return new;
end;
$$ language plpgsql security definer;

do $$
declare
  t text;
begin
  foreach t in array array['leads', 'quotes', 'knowledge_base', 'customer_emails', 'whatsapp_chats', 'dispatched_quotes']
  loop
    execute format('drop trigger if exists set_company_id on public.%I', t);
    execute format(
      'create trigger set_company_id before insert on public.%I for each row execute procedure public.set_company_id_from_user()',
      t
    );
  end loop;
end $$;

-- 3. WhatsApp chats are looked up per company, so make the uniqueness match.
alter table public.whatsapp_chats drop constraint if exists unique_user_phone;
alter table public.whatsapp_chats drop constraint if exists unique_company_phone;
alter table public.whatsapp_chats add constraint unique_company_phone unique (company_id, phone_number);

-- 4. Link WhatsApp leads to their originating chat (previously dispatch/reports
--    picked the first chat in the company, showing the wrong customer).
alter table public.leads add column if not exists chat_id uuid references public.whatsapp_chats(id) on delete set null;

-- Backfill chat_id for existing WhatsApp leads using the phone in raw_text ("Phone: +123...").
update public.leads l
set chat_id = c.id
from public.whatsapp_chats c
where l.source = 'whatsapp'
  and l.chat_id is null
  and c.company_id = l.company_id
  and l.raw_text like '%Phone: ' || c.phone_number || '%';
