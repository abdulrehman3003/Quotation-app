-- database/migration_v7_automation.sql
-- Run this in your Supabase SQL editor AFTER migration_v6_quote_lifecycle.sql.
-- Safe to re-run (idempotent).

-- 1. Per-company automation settings (automatic drafts, automatic follow-ups,
--    outbound webhook). Kept out of public.companies because the webhook signing
--    secret must not be readable through the client API.
create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.company_settings enable row level security;
-- No policies: only the backend (service role) reads/writes this table.

-- 2. One automatic follow-up per quote.
alter table public.quotes add column if not exists follow_up_sent_at timestamp with time zone;

-- 3. Lets the WhatsApp rate limit count a chat's recent messages quickly.
create index if not exists idx_whatsapp_messages_chat_created
  on public.whatsapp_messages (chat_id, created_at desc);
