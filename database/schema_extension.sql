-- schema_extension.sql
-- Run this in your Supabase SQL editor to add simulated Emails and WhatsApp support.

-- Create customer_emails table for simulated email inbox feed
create table if not exists public.customer_emails (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null default auth.uid(),
  sender_email text not null,
  subject text not null,
  body text not null,
  status text not null default 'unread', -- 'unread', 'imported', 'replied'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on customer_emails
alter table public.customer_emails enable row level security;

create policy "Allow users to read their own customer_emails"
  on public.customer_emails for select
  to authenticated
  using (user_id = auth.uid());

create policy "Allow users to insert/update/delete their own customer_emails"
  on public.customer_emails for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Create whatsapp_chats table for session tracking
create table if not exists public.whatsapp_chats (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null default auth.uid(),
  phone_number text not null,
  customer_name text not null,
  status text not null default 'active_ai', -- 'active_ai', 'human_required'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  constraint unique_user_phone unique(user_id, phone_number)
);

-- Enable RLS on whatsapp_chats
alter table public.whatsapp_chats enable row level security;

create policy "Allow users to read their own whatsapp_chats"
  on public.whatsapp_chats for select
  to authenticated
  using (user_id = auth.uid());

create policy "Allow users to manage their own whatsapp_chats"
  on public.whatsapp_chats for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Create whatsapp_messages table for chat history
create table if not exists public.whatsapp_messages (
  id uuid default gen_random_uuid() primary key,
  chat_id uuid references public.whatsapp_chats(id) on delete cascade not null,
  sender text not null, -- 'customer', 'system', 'agent'
  text text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on whatsapp_messages
alter table public.whatsapp_messages enable row level security;

create policy "Allow users to read messages of their own chats"
  on public.whatsapp_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.whatsapp_chats c 
      where c.id = chat_id and c.user_id = auth.uid()
    )
  );

create policy "Allow users to insert messages to their own chats"
  on public.whatsapp_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.whatsapp_chats c 
      where c.id = chat_id and c.user_id = auth.uid()
    )
  );

-- Seed initial mock emails for testing if table is empty
insert into public.customer_emails (user_id, sender_email, subject, body, status)
values 
  ((select id from public.users limit 1), 'procurement@apexindustrial.com', 'Request for Quote: Custom Steel Bracket Fabrication', 'Hello AXRFLOWS Sales Team,\n\nWe need a price quote for a batch of custom steel brackets. Specifications are:\n- Material: Structural Carbon Steel A36\n- Dimensions: 150mm x 150mm x 6mm thick\n- Quantity: 500 units\n- Finish: Zinc plated coating\n- Delivery Timeline: Within 4 weeks to Chicago warehouse.\n\nCould you send over an itemized pricing sheet and delivery details?\n\nThank you,\nMark Robinson\nProcurement Manager, Apex Industrial', 'unread'),
  ((select id from public.users limit 1), 'jessica.k@buildwest.org', 'Urgent quotation: 1200 sq ft structural glass panels', 'Hi there,\n\nI need an immediate price estimate for supplying 1,200 square feet of structural tempered laminated glass panels. We have a project starting next month and need these delivered to Denver.\n\nPlease include shipping and lead times in the quotation.\n\nThanks,\nJessica K.\nBuildWest Contractors', 'unread')
on conflict do nothing;
