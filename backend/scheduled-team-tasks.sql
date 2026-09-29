-- A team assignment is represented by linked task rows: one report and status per worker.
alter table public.tasks add column if not exists scheduled_start timestamptz;
alter table public.tasks add column if not exists scheduled_end timestamptz;
alter table public.tasks add column if not exists assigned_to uuid references public.profiles(id);
alter table public.tasks add column if not exists assignment_group_id uuid;
create index if not exists tasks_assignment_group_idx on public.tasks(assignment_group_id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='tasks_schedule_window_check') then
    alter table public.tasks add constraint tasks_schedule_window_check check
      ((scheduled_start is null and scheduled_end is null) or
       (scheduled_start is not null and scheduled_end is not null and scheduled_end>scheduled_start));
  end if;
end $$;
-- Existing tasks that were assigned before this feature keep their claimed owner and current status.
create or replace function public.claim_task(p_task_id uuid)
returns public.tasks language plpgsql security definer set search_path=public as $$
declare v public.tasks;
begin
  update public.tasks t
     set status='in_progress',claimed_by=auth.uid(),claimed_at=now(),
         deadline_at=coalesce(t.scheduled_end,now()+make_interval(mins=>t.duration_min))
   where t.id=p_task_id and t.status='open' and t.claimed_by is null
     and (t.assigned_to is null or t.assigned_to=auth.uid())
     and (t.scheduled_start is null or t.scheduled_start<=now())
     and (t.scheduled_end is null or t.scheduled_end>now())
     and public.can_access_location(t.location_id)
   returning t.* into v;
  if v.id is null then raise exception 'TASK_NOT_AVAILABLE_YET_OR_NO_ACCESS'; end if;
  return v;
end;
$$;
create or replace function public.worker_assigned_to_location(p_worker uuid,p_location uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join public.profile_locations pl on pl.profile_id=p.id
    where p.id=p_worker and p.active=true and p.role='worker' and pl.location_id=p_location);
$$;
-- A delegated creator may assign only an active worker already assigned to their location.
drop policy if exists tasks_delegated_insert on public.tasks;
create policy tasks_delegated_insert on public.tasks for insert to authenticated
  with check (public.is_admin() or (
    public.can_create_tasks() and public.can_access_location(location_id)
    and created_by=auth.uid() and status='open' and claimed_by is null
    and claimed_at is null and deadline_at is null
    and reward_coins=0 and penalty_coins=0 and sanction_type='none'
    and coalesce(sanction_text,'')='' and coalesce(disciplinary_note,'')=''
    and (assigned_to is null or public.worker_assigned_to_location(assigned_to,location_id))
  ));
-- Supervisors need to see which workers are assigned to their locations in the task picker.
drop policy if exists profile_locations_read on public.profile_locations;
create policy profile_locations_read on public.profile_locations for select to authenticated
  using (profile_id=auth.uid() or public.is_admin() or
    ((public.can_create_tasks() or public.can_view_team_hours()) and public.can_access_location(location_id)));
