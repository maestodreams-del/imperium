-- Shared chat. Each sender may delete only their own message.
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.chat_messages enable row level security;
drop policy if exists chat_read_team on public.chat_messages;
drop policy if exists chat_send_own on public.chat_messages;
drop policy if exists chat_delete_own on public.chat_messages;
create policy chat_read_team on public.chat_messages for select to authenticated using (true);
create policy chat_send_own on public.chat_messages for insert to authenticated with check (user_id=auth.uid());
create policy chat_delete_own on public.chat_messages for delete to authenticated using (user_id=auth.uid());
grant select,insert,delete on public.chat_messages to authenticated;

create or replace function public.protect_chat_message_delete() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.user_id<>auth.uid() then raise exception 'Możesz usunąć tylko własną wiadomość'; end if;
  return old;
end $$;
drop trigger if exists chat_message_owner_delete on public.chat_messages;
create trigger chat_message_owner_delete before delete on public.chat_messages
for each row execute function public.protect_chat_message_delete();

create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  created_at timestamptz not null default now()
);
create index if not exists chat_attachments_message_idx on public.chat_attachments(message_id);
alter table public.chat_attachments enable row level security;
drop policy if exists chat_attachments_read on public.chat_attachments;
drop policy if exists chat_attachments_insert on public.chat_attachments;
create policy chat_attachments_read on public.chat_attachments for select to authenticated using (
  exists(select 1 from public.chat_messages m where m.id::text=message_id));
create policy chat_attachments_insert on public.chat_attachments for insert to authenticated with check (
  exists(select 1 from public.chat_messages m where m.id::text=message_id and m.user_id=auth.uid())
  and storage_path like auth.uid()::text||'/%');
grant select,insert on public.chat_attachments to authenticated;

create or replace function public.cleanup_chat_attachments() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.chat_attachments where message_id=old.id::text;
  return old;
end $$;
drop trigger if exists chat_attachments_cleanup on public.chat_messages;
create trigger chat_attachments_cleanup after delete on public.chat_messages
for each row execute function public.cleanup_chat_attachments();

insert into storage.buckets(id,name,public,file_size_limit)
values('chat-media','chat-media',false,52428800)
on conflict(id) do update set public=false,file_size_limit=52428800;
drop policy if exists chat_media_read on storage.objects;
drop policy if exists chat_media_insert on storage.objects;
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_read on storage.objects for select to authenticated
using (bucket_id='chat-media' and (
  name like auth.uid()::text||'/%' or exists (
    select 1 from public.chat_attachments a where a.storage_path=name)));
create policy chat_media_insert on storage.objects for insert to authenticated
with check (bucket_id='chat-media' and name like auth.uid()::text||'/%');
create policy chat_media_delete on storage.objects for delete to authenticated
using (bucket_id='chat-media' and name like auth.uid()::text||'/%');

-- A live broadcast is visible to signed-in colleagues. Offers and answers are private to their peers.
create table if not exists public.chat_live_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create table if not exists public.chat_live_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_live_sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('join','offer','answer','ice','leave')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists chat_live_signals_recipient_idx on public.chat_live_signals(recipient_id,created_at);
alter table public.chat_live_sessions enable row level security;
alter table public.chat_live_signals enable row level security;
drop policy if exists chat_live_sessions_read on public.chat_live_sessions;
drop policy if exists chat_live_sessions_start on public.chat_live_sessions;
drop policy if exists chat_live_sessions_stop on public.chat_live_sessions;
drop policy if exists chat_live_signals_read on public.chat_live_signals;
drop policy if exists chat_live_signals_send on public.chat_live_signals;
create policy chat_live_sessions_read on public.chat_live_sessions for select to authenticated using (true);
create policy chat_live_sessions_start on public.chat_live_sessions for insert to authenticated with check (owner_id=auth.uid());
create policy chat_live_sessions_stop on public.chat_live_sessions for update to authenticated
using (owner_id=auth.uid()) with check (owner_id=auth.uid());
create policy chat_live_signals_read on public.chat_live_signals for select to authenticated
using (recipient_id=auth.uid() or sender_id=auth.uid());
create policy chat_live_signals_send on public.chat_live_signals for insert to authenticated
with check (sender_id=auth.uid() and exists (
  select 1 from public.chat_live_sessions s where s.id=session_id and s.ended_at is null
    and (s.owner_id=sender_id or s.owner_id=recipient_id)));
grant select,insert,update on public.chat_live_sessions to authenticated;
grant select,insert on public.chat_live_signals to authenticated;
