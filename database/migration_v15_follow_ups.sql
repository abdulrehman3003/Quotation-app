-- database/migration_v15_follow_ups.sql
-- Run this in your Supabase SQL editor AFTER migration_v14_whatsapp_customer_name.sql.
-- Safe to re-run.
--
-- Automatic follow-ups on WhatsApp and quote expiry reminders. Every automatic
-- message is recorded on the quote (follow_up_log) and in the chat history.
-- Customers who reply STOP are opted out of automatic messages.

alter table public.quotes add column if not exists follow_up_log jsonb not null default '[]'::jsonb;
alter table public.quotes add column if not exists wa_follow_up_sent_at timestamp with time zone;
alter table public.quotes add column if not exists expiry_reminder_sent_at timestamp with time zone;

alter table public.whatsapp_chats add column if not exists opted_out boolean not null default false;
alter table public.whatsapp_chats add column if not exists nudge_sent_at timestamp with time zone;

create index if not exists idx_quotes_open_follow_up on public.quotes (company_id, status) where outcome is null;
