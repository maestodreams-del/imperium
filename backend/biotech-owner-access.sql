-- Temporary owner-only access. Does not delete or deactivate any employee account.
-- Apply atomically with the update activation (psql --single-transaction).
create table if not exists public.imperium_access_control (
  singleton boolean primary key default true check (singleton),
  owner_id uuid not null references public.profiles(id),
  owner_only boolean not null default true,
  updated_at timestamptz not null default now()
);
revoke all on public.imperium_access_control from public,anon,authenticated;

do $$
declare resolved_owner uuid; owner_count integer;
begin
  -- Reuse the sole salary owner already used by the management-notice release.
  select count(*),(array_agg(p.id))[1] into owner_count,resolved_owner
    from public.salary_managers m join public.profiles p on p.id=m.profile_id
    join auth.users u on u.id=p.id where p.active and p.role='admin';
  if owner_count<>1 then raise exception 'Owner account is ambiguous; no access changes applied'; end if;
  if exists(select 1 from public.imperium_access_control where owner_id<>resolved_owner)
    then raise exception 'Existing owner mapping differs; no access changes applied'; end if;
  insert into public.imperium_access_control(singleton,owner_id,owner_only)
    values(true,resolved_owner,true)
    on conflict(singleton) do update set owner_only=true,updated_at=now();
end $$;

create or replace function public.imperium_access_status() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.imperium_access_control a
    join public.profiles p on p.id=auth.uid()
    where a.singleton and p.active and (not a.owner_only or a.owner_id=p.id)
  );
$$;
revoke all on function public.imperium_access_status() from public;
grant execute on function public.imperium_access_status() to anon,authenticated,service_role;

-- Pre-request checks also cover SECURITY DEFINER RPCs invoked by old clients.
create or replace function public.imperium_guard_access() returns void
language plpgsql security invoker set search_path='' as $$
declare request_path text:=current_setting('request.path',true);
        request_method text:=current_setting('request.method',true);
begin
  if auth.role()='service_role' or public.imperium_access_status() then return; end if;
  if auth.uid() is not null and (
    (request_method='POST' and request_path='/rpc/imperium_access_status') or
    (request_method='GET' and request_path in ('/app_updates','/profiles'))
  ) then return; end if;
  raise sqlstate '42501' using message='IMPERIUM_OWNER_ONLY: Dostęp wyłącznie dla właściciela.';
end $$;
revoke all on function public.imperium_guard_access() from public;
grant execute on function public.imperium_guard_access() to anon,authenticated,service_role;

-- Restrictive policies combine with existing application policies. They protect
-- table access, Storage and Realtime; the request hook additionally guards RPCs.
do $$
declare r record; read_expression text;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p')
  loop
    read_expression:='public.imperium_access_status()';
    if r.relname='profiles' then read_expression:=read_expression||' OR id=auth.uid()'; end if;
    if r.relname='app_updates' then read_expression:=read_expression||' OR auth.uid() IS NOT NULL'; end if;
    execute format('alter table public.%I enable row level security',r.relname);
    execute format('drop policy if exists imperium_owner_read on public.%I',r.relname);
    execute format('create policy imperium_owner_read on public.%I as restrictive for select to anon,authenticated using (%s)',r.relname,read_expression);
    execute format('drop policy if exists imperium_owner_insert on public.%I',r.relname);
    execute format('create policy imperium_owner_insert on public.%I as restrictive for insert to anon,authenticated with check (public.imperium_access_status())',r.relname);
    execute format('drop policy if exists imperium_owner_update on public.%I',r.relname);
    execute format('create policy imperium_owner_update on public.%I as restrictive for update to anon,authenticated using (public.imperium_access_status()) with check (public.imperium_access_status())',r.relname);
    execute format('drop policy if exists imperium_owner_delete on public.%I',r.relname);
    execute format('create policy imperium_owner_delete on public.%I as restrictive for delete to anon,authenticated using (public.imperium_access_status())',r.relname);
  end loop;
end $$;
drop policy if exists imperium_owner_read on storage.objects;
create policy imperium_owner_read on storage.objects as restrictive for select to anon,authenticated
  using (public.imperium_access_status() or (bucket_id='app-updates' and auth.uid() is not null));
drop policy if exists imperium_owner_insert on storage.objects;
create policy imperium_owner_insert on storage.objects as restrictive for insert to anon,authenticated with check(public.imperium_access_status());
drop policy if exists imperium_owner_update on storage.objects;
create policy imperium_owner_update on storage.objects as restrictive for update to anon,authenticated using(public.imperium_access_status()) with check(public.imperium_access_status());
drop policy if exists imperium_owner_delete on storage.objects;
create policy imperium_owner_delete on storage.objects as restrictive for delete to anon,authenticated using(public.imperium_access_status());

do $$ begin
  if exists(select 1 from pg_db_role_setting r cross join unnest(r.setconfig) config
    where r.setrole=(select oid from pg_roles where rolname='authenticator')
      and config like 'pgrst.db_pre_request=%'
      and config not in ('pgrst.db_pre_request=','pgrst.db_pre_request=public.imperium_guard_access'))
  then raise exception 'A different API request hook is already configured; refusing to replace it'; end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.imperium_guard_access';
notify pgrst,'reload config';
notify pgrst,'reload schema';
