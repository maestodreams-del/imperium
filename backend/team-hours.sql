-- Read access for the administrator and a delegated supervisor, limited to assigned locations.
alter table public.profiles add column if not exists can_view_team_hours boolean not null default false;
create or replace function public.can_view_team_hours()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and p.active=true and (p.role='admin' or p.can_view_team_hours));
$$;
drop policy if exists attendance_read on public.work_attendance;
create policy attendance_read on public.work_attendance for select to authenticated
  using (profile_id=auth.uid() or (public.can_view_team_hours() and public.can_access_location(location_id)));
drop policy if exists work_shifts_read on public.work_shifts;
create policy work_shifts_read on public.work_shifts for select to authenticated
  using (profile_id=auth.uid() or (public.can_view_team_hours() and public.can_access_location(location_id)));
-- Do not grant to another account with the same name by accident.
do $$ begin
  if (select count(*) from public.profiles where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)')=1 then
    update public.profiles set can_view_team_hours=true
    where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)';
  end if;
end $$;
