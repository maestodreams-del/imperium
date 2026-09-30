create table if not exists public.profile_messages(
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references public.profiles(id),
 receiver_id uuid not null references public.profiles(id),
 body text not null check(length(btrim(body)) between 1 and 2000),
 created_at timestamptz not null default now(), read_at timestamptz,
 check(sender_id<>receiver_id)
);
create index if not exists profile_messages_inbox on public.profile_messages(receiver_id,created_at desc);
create index if not exists profile_messages_sent on public.profile_messages(sender_id,created_at desc);
create index if not exists profile_messages_unread on public.profile_messages(receiver_id) where read_at is null;
alter table public.profile_messages enable row level security;
create or replace function public.profile_message_active(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=p_id and active) $$;
drop policy if exists profile_message_read on public.profile_messages;
drop policy if exists profile_message_insert on public.profile_messages;
create policy profile_message_read on public.profile_messages for select to authenticated using(public.profile_message_active(auth.uid()) and (sender_id=auth.uid() or receiver_id=auth.uid()));
create policy profile_message_insert on public.profile_messages for insert to authenticated with check(sender_id=auth.uid() and public.profile_message_active(auth.uid()) and public.profile_message_active(receiver_id) and read_at is null);
grant select on public.profile_messages to authenticated;
revoke insert,update,delete on public.profile_messages from authenticated;
grant insert(sender_id,receiver_id,body) on public.profile_messages to authenticated;
create or replace function public.profile_message_unread_count() returns bigint language sql stable security invoker set search_path=public as $$ select count(*) from public.profile_messages where receiver_id=auth.uid() and read_at is null $$;
create or replace function public.mark_profile_messages_read(p_ids uuid[]) returns void language sql security definer set search_path=public as $$ update public.profile_messages set read_at=now() where receiver_id=auth.uid() and public.profile_message_active(auth.uid()) and id=any(p_ids) and read_at is null $$;
revoke all on function public.profile_message_unread_count(),public.mark_profile_messages_read(uuid[]) from public;
grant execute on function public.profile_message_unread_count(),public.mark_profile_messages_read(uuid[]) to authenticated;
