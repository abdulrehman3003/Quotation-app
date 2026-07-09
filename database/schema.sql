-- schema.sql
-- Database initialization schema for AXRFLOWS B2B SaaS platform

-- Create public users table to mirror auth.users
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on users table
alter table public.users enable row level security;

-- Policy for users to view/edit their own profile
create policy "Allow users to read their own profile"
  on public.users for select
  to authenticated
  using (id = auth.uid());

create policy "Allow users to update their own profile"
  on public.users for update
  to authenticated
  using (id = auth.uid());

-- Trigger to automatically mirror new auth users into public.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Create leads table representing unstructured client requests
create table public.leads (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null default auth.uid(),
  source text not null default 'manual', -- 'manual', 'email', 'webhook'
  title text not null,
  raw_text text not null,
  status text not null default 'pending', -- 'pending', 'processed', 'failed'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on leads table
alter table public.leads enable row level security;

-- Policies for leads
create policy "Allow authenticated users to read their own leads"
  on public.leads for select
  to authenticated
  using (user_id = auth.uid());

create policy "Allow authenticated users to insert their own leads"
  on public.leads for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Allow authenticated users to update their own leads"
  on public.leads for update
  to authenticated
  using (user_id = auth.uid());

create policy "Allow authenticated users to delete their own leads"
  on public.leads for delete
  to authenticated
  using (user_id = auth.uid());

-- Create quotes table representing AI-generated cost breakdowns and drafts
create table public.quotes (
  id uuid default gen_random_uuid() primary key,
  lead_id uuid references public.leads(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null default auth.uid(),
  material_cost numeric(12, 2) not null default 0.00,
  labor_cost numeric(12, 2) not null default 0.00,
  total_cost numeric(12, 2) not null default 0.00,
  itemized_breakdown jsonb not null default '[]'::jsonb,
  email_draft text not null,
  status text not null default 'draft', -- 'draft', 'dispatched'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on quotes table
alter table public.quotes enable row level security;

-- Policies for quotes
create policy "Allow authenticated users to read their own quotes"
  on public.quotes for select
  to authenticated
  using (user_id = auth.uid());

create policy "Allow authenticated users to insert their own quotes"
  on public.quotes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Allow authenticated users to update their own quotes"
  on public.quotes for update
  to authenticated
  using (user_id = auth.uid());

create policy "Allow authenticated users to delete their own quotes"
  on public.quotes for delete
  to authenticated
  using (user_id = auth.uid());

-- Create knowledge_base table to store parsed spreadsheet/PDF content
create table public.knowledge_base (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade not null default auth.uid(),
  filename text not null,
  file_path text not null, -- path in supabase storage (e.g. "userId/filename")
  content_type text not null, -- 'csv', 'xlsx', 'pdf'
  parsed_content text not null, -- raw text representation for LLM ingestion
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on knowledge_base table
alter table public.knowledge_base enable row level security;

-- Policies for knowledge_base
create policy "Allow authenticated users to read their own knowledge_base"
  on public.knowledge_base for select
  to authenticated
  using (user_id = auth.uid());

create policy "Allow authenticated users to insert their own knowledge_base"
  on public.knowledge_base for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Allow authenticated users to update their own knowledge_base"
  on public.knowledge_base for update
  to authenticated
  using (user_id = auth.uid());

create policy "Allow authenticated users to delete their own knowledge_base"
  on public.knowledge_base for delete
  to authenticated
  using (user_id = auth.uid());

-- Setup Storage Bucket for knowledge base files
-- Note: This requires inserting into storage.buckets table
insert into storage.buckets (id, name, public)
values ('knowledge_base', 'knowledge_base', false)
on conflict (id) do nothing;

-- Create policies for knowledge_base storage bucket
-- Authenticated users can insert/select/delete objects inside their own folder named by their UUID
create policy "Allow authenticated uploads to user folder in knowledge_base"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'knowledge_base'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Allow authenticated read of user folder in knowledge_base"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'knowledge_base'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Allow authenticated delete of user folder in knowledge_base"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'knowledge_base'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Create customer_emails table for simulated email inbox feed
create table public.customer_emails (
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
create table public.whatsapp_chats (
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
create table public.whatsapp_messages (
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

