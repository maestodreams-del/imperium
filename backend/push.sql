-- FCM tokens belong to authenticated users; private dispatch deduplication.
create table if not exists public.device_push_tokens (
  token text primary key check (char_length(token) between 20 and 4096),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default now()
);
create index if not exists device_push_tokens_profile_idx on public.device_push_tokens(profile_id);
alter table public.device_push_tokens enable row level security;
drop policy if exists push_tokens_owner_read on public.device_push_tokens;
create policy push_tokens_owner_read on public.device_push_tokens for select to authenticated
  using (profile_id=auth.uid());

create table if not exists public.push_dispatches (
  event_id uuid primary key references public.events(id) on delete cascade,
  dispatched_at timestamptz not null default now()
);
alter table public.push_dispatches enable row level security;

create or replace function public.register_push_token(p_token text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or char_length(p_token) not between 20 and 4096 then
    raise exception 'INVALID_PUSH_TOKEN';
  end if;
  insert into public.device_push_tokens(token,profile_id,updated_at)
    values (p_token,auth.uid(),now())
    on conflict (token) do update set profile_id=auth.uid(),updated_at=now();
end; $$;

create or replace function public.unregister_push_token(p_token text)
returns void language sql security definer set search_path=public as $$
  delete from public.device_push_tokens where token=p_token and profile_id=auth.uid();
$$;
grant execute on function public.register_push_token(text),public.unregister_push_token(text) to authenticated;
revoke all on public.push_dispatches from anon,authenticated;
