-- Chat attachments, own-message deletion, and authenticated live signalling.
create table if not exists public.chat_messages (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 message text not null, created_at timestamptz not null default now()
);
alter table public.chat_messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.chat_messages enable row level security;
create or replace function public.chat_active() returns boolean language sql stable security definer
 set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and active) $$;
-- Replace legacy chat policies so deletion is always restricted to the author.
do $$ declare p record; begin for p in select policyname from pg_policies where schemaname='public' and tablename='chat_messages' loop execute format('drop policy %I on public.chat_messages',p.policyname); end loop; end $$;
create policy chat_read on public.chat_messages for select to authenticated using(public.chat_active());
create policy chat_insert on public.chat_messages for insert to authenticated with check(public.chat_active() and user_id=auth.uid() and length(message) between 1 and 2000 and jsonb_typeof(attachments)='array' and jsonb_array_length(attachments)<=10);
create policy chat_delete_own on public.chat_messages for delete to authenticated using(public.chat_active() and user_id=auth.uid());
grant select,insert,delete on public.chat_messages to authenticated;
create or replace function public.delete_own_chat_message(p_id text) returns jsonb language plpgsql security invoker set search_path=public as $$
declare a jsonb; begin delete from public.chat_messages where id::text=p_id and user_id=auth.uid() returning attachments into a;
if a is null then raise exception 'Wiadomość nie istnieje lub nie należy do Ciebie'; end if; return a; end $$;
revoke all on function public.delete_own_chat_message(text) from public;
grant execute on function public.delete_own_chat_message(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit) values('chat-files','chat-files',false,52428800) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;
drop policy if exists chat_files_read on storage.objects;
drop policy if exists chat_files_insert on storage.objects;
drop policy if exists chat_files_delete on storage.objects;
create policy chat_files_read on storage.objects for select to authenticated using(bucket_id='chat-files' and public.chat_active());
create policy chat_files_insert on storage.objects for insert to authenticated with check(bucket_id='chat-files' and public.chat_active() and (storage.foldername(name))[1]=auth.uid()::text);
create policy chat_files_delete on storage.objects for delete to authenticated using(bucket_id='chat-files' and public.chat_active() and (storage.foldername(name))[1]=auth.uid()::text);
