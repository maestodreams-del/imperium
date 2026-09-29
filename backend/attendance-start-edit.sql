-- Administrators can correct the start of a worker's attendance record.
create or replace function public.admin_change_attendance_start(p_attendance_id uuid,p_started_at timestamptz)
returns public.work_attendance language plpgsql security definer set search_path='' as $$
declare v public.work_attendance; v_end timestamptz;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if p_started_at is null or p_started_at>now() then raise exception 'START_MUST_BE_IN_THE_PAST'; end if;
  select * into v from public.work_attendance where id=p_attendance_id for update;
  if v.id is null then raise exception 'ATTENDANCE_NOT_FOUND'; end if;
  if v.ended_at is not null and p_started_at>=v.ended_at then raise exception 'START_AFTER_END'; end if;
  v_end:=coalesce(v.ended_at,now());
  if exists(select 1 from public.work_attendance w
     where w.profile_id=v.profile_id and w.id<>v.id
       and w.started_at<v_end and coalesce(w.ended_at,now())>p_started_at)
  then raise exception 'ATTENDANCE_OVERLAP'; end if;
  update public.work_attendance set started_at=p_started_at where id=v.id returning * into v;
  return v;
end $$;
revoke all on function public.admin_change_attendance_start(uuid,timestamptz) from public;
grant execute on function public.admin_change_attendance_start(uuid,timestamptz) to authenticated;
