-- database/migration_v14_whatsapp_customer_name.sql
-- Run this in your Supabase SQL editor AFTER migration_v13_company_notifications.sql.
-- Safe to re-run.
--
-- The WhatsApp assistant asks customers for their name instead of relying on their
-- WhatsApp profile name. Once a customer states it, the chat's customer_name is
-- replaced and marked confirmed, so it is used on quotes and not asked again.

alter table public.whatsapp_chats add column if not exists name_confirmed boolean not null default false;
