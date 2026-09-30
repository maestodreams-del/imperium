alter table public.profiles add column role text not null default 'worker';
update public.profiles set active=true;
update public.profiles set role='admin' where id='00000000-0000-0000-0000-000000000002';
create table public.locations(id uuid primary key);
insert into public.locations values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin' and active) $$;
create function public.can_access_location(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$ select public.is_admin() or p_id='10000000-0000-0000-0000-000000000001'::uuid $$;
