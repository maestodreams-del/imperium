-- IMPERIUM — MELDUNEK NA OBIEKCIE
create table if not exists public.work_attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists work_attendance_profile_idx on public.work_attendance(profile_id, started_at desc);
create index if not exists work_attendance_location_idx on public.work_attendance(location_id, started_at desc);
create unique index if not exists work_attendance_one_active_per_user on public.work_attendance(profile_id) where ended_at is null;
alter table public.work_attendance enable row level security;
drop policy if exists attendance_read on public.work_attendance;
create policy attendance_read on public.work_attendance for select to authenticated using (public.is_admin() or profile_id=auth.uid());

create or replace function public.start_work_attendance(p_location_id uuid)
returns public.work_attendance
language plpgsql security definer set search_path=public
as $$
declare v public.work_attendance;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_access_location(p_location_id) then raise exception 'NO_LOCATION_ACCESS'; end if;
  if exists(select 1 from public.work_attendance where profile_id=auth.uid() and ended_at is null) then raise exception 'ACTIVE_ATTENDANCE_EXISTS'; end if;
  insert into public.work_attendance(profile_id,location_id) values(auth.uid(),p_location_id) returning * into v;
  return v;
end;
$$;

create or replace function public.stop_work_attendance()
returns public.work_attendance
language plpgsql security definer set search_path=public
as $$
declare v public.work_attendance;
begin
  update public.work_attendance set ended_at=now()
   where id=(select id from public.work_attendance where profile_id=auth.uid() and ended_at is null order by started_at desc limit 1)
   returning * into v;
  if v.id is null then raise exception 'NO_ACTIVE_ATTENDANCE'; end if;
  return v;
end;
$$;

grant execute on function public.start_work_attendance(uuid) to authenticated;
grant execute on function public.stop_work_attendance() to authenticated;
