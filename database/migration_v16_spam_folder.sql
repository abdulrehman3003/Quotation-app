-- v16: emails imported from the mailbox's Spam / Junk folder.
-- The poller also reads unread mail from the last 7 days in the spam folder and
-- marks it from_spam = true; the app shows a "From spam" badge and never
-- auto-drafts it. Safe to re-run.

alter table public.customer_emails add column if not exists from_spam boolean not null default false;
