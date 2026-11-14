-- database/migration_v6_quote_lifecycle.sql
-- Run this in your Supabase SQL editor AFTER migration_v5_security_and_onboarding.sql.
-- Safe to re-run (idempotent).
--
-- Adds what a quote needs after the AI has drafted it: a number, a recipient,
-- discount/tax, a validity date, a customer-facing link, view tracking and a
-- won/lost outcome. The backend keeps working without this migration (it falls
-- back to the old columns), but none of the new features are stored until it runs.

alter table public.quotes add column if not exists quote_number text;
alter table public.quotes add column if not exists currency text not null default 'USD';
alter table public.quotes add column if not exists subtotal numeric(12, 2);
alter table public.quotes add column if not exists discount_percent numeric(5, 2) not null default 0;
alter table public.quotes add column if not exists tax_percent numeric(5, 2) not null default 0;
alter table public.quotes add column if not exists valid_until date;

-- Who the quote goes to. Extracted by the AI, editable before sending.
alter table public.quotes add column if not exists customer_name text;
alter table public.quotes add column if not exists customer_email text;
alter table public.quotes add column if not exists customer_phone text;
alter table public.quotes add column if not exists customer_company text;

-- Things a human should check before sending.
alter table public.quotes add column if not exists review_notes jsonb not null default '[]'::jsonb;

-- Customer-facing link and what happened after sending.
alter table public.quotes add column if not exists public_token text;
alter table public.quotes add column if not exists sent_at timestamp with time zone;
alter table public.quotes add column if not exists first_viewed_at timestamp with time zone;
alter table public.quotes add column if not exists last_viewed_at timestamp with time zone;
alter table public.quotes add column if not exists view_count integer not null default 0;
alter table public.quotes add column if not exists outcome text;            -- null | 'accepted' | 'declined'
alter table public.quotes add column if not exists outcome_source text;     -- 'customer' | 'staff'
alter table public.quotes add column if not exists responded_at timestamp with time zone;
alter table public.quotes add column if not exists customer_comment text;

alter table public.quotes drop constraint if exists quotes_outcome_check;
alter table public.quotes add constraint quotes_outcome_check
  check (outcome is null or outcome in ('accepted', 'declined'));

create unique index if not exists idx_quotes_public_token
  on public.quotes (public_token)
  where public_token is not null;

create index if not exists idx_quotes_company_status
  on public.quotes (company_id, status, created_at desc);

-- Backfill: quotes sent before this migration get a sent_at so that reports and
-- response-time figures include them.
update public.quotes
set sent_at = created_at
where status = 'dispatched' and sent_at is null;

update public.quotes
set subtotal = total_cost
where subtotal is null;
