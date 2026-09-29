-- Scoped permissions for staff who create inspections and tasks.
alter table public.profiles add column if not exists can_add_inspections boolean not null default false;
alter table public.profiles add column if not exists can_create_tasks boolean not null default false;

create or replace function public.can_add_inspections()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and p.active=true and (p.role='admin' or p.can_add_inspections));
$$;
create or replace function public.can_create_tasks()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and p.active=true and (p.role='admin' or p.can_create_tasks));
$$;

drop policy if exists inspections_admin_insert on public.inspections;
drop policy if exists inspections_delegated_insert on public.inspections;
create policy inspections_delegated_insert on public.inspections for insert to authenticated
  with check (public.is_admin() or (public.can_add_inspections() and public.can_access_location(location_id) and created_by=auth.uid()));

drop policy if exists tasks_admin_insert on public.tasks;
drop policy if exists tasks_delegated_insert on public.tasks;
create policy tasks_delegated_insert on public.tasks for insert to authenticated
  with check (public.is_admin() or (
    public.can_create_tasks() and public.can_access_location(location_id)
    and created_by=auth.uid() and status='open' and claimed_by is null
    and claimed_at is null and deadline_at is null
    and reward_coins=0 and penalty_coins=0 and sanction_type='none'
    and coalesce(sanction_text,'')='' and coalesce(disciplinary_note,'')=''
  ));

drop policy if exists attachments_insert on public.task_attachments;
create policy attachments_insert on public.task_attachments for insert to authenticated with check (
  uploaded_by=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and
    (public.is_admin() or (t.claimed_by=auth.uid() and public.can_access_location(t.location_id))
     or (t.created_by=auth.uid() and public.can_create_tasks() and public.can_access_location(t.location_id))))
);

-- Grant only when exactly one active profile matches this name.
do $$ begin
  if (select count(*) from public.profiles where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)')=1 then
    update public.profiles set can_add_inspections=true,can_create_tasks=true
    where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)';
  end if;
end $$;
