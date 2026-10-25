-- Personal planner data is independent of the historical operations tables.
create table if not exists public.planner_projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references public.profiles(id),
 name text not null check(length(btrim(name)) between 1 and 100), color text not null default '#72866b' check(color ~ '^#[0-9a-fA-F]{6}$'),
 archived boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists public.planner_tasks (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references public.profiles(id),
 project_id uuid references public.planner_projects(id) on delete set null,
 title text not null check(length(btrim(title)) between 1 and 300), notes text not null default '' check(length(notes)<=20000),
 due_date date, due_time time, duration_minutes integer not null default 30 check(duration_minutes between 5 and 1440),
 priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 status text not null default 'todo' check(status in ('todo','doing','done')),
 repeat_rule text not null default 'none' check(repeat_rule in ('none','daily','weekdays','weekly','monthly')),
 reminder_minutes integer check(reminder_minutes between 0 and 10080), starred boolean not null default false,
 checklist jsonb not null default '[]' check(jsonb_typeof(checklist)='array' and jsonb_array_length(checklist)<=100),
 tags text[] not null default '{}', source_task_id uuid references public.planner_tasks(id) on delete set null unique,
 completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(due_time is null or due_date is not null), check(reminder_minutes is null or due_date is not null),
 check(repeat_rule='none' or due_date is not null)
);
create table if not exists public.planner_notes (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references public.profiles(id),
 title text not null check(length(btrim(title)) between 1 and 200), body text not null default '' check(length(body)<=100000),
 pinned boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.planner_focus_sessions (
 id uuid primary key, owner_id uuid not null default auth.uid() references public.profiles(id),
 task_id uuid references public.planner_tasks(id) on delete set null,
 duration_minutes integer not null check(duration_minutes between 1 and 240), completed_at timestamptz not null default now()
);
create index if not exists planner_tasks_owner_date on public.planner_tasks(owner_id,due_date);
create index if not exists planner_focus_owner_date on public.planner_focus_sessions(owner_id,completed_at);
-- Existing trusted server-side owner predicate; no user metadata authorization.
do $$ declare t text; begin
 foreach t in array array['planner_projects','planner_tasks','planner_notes','planner_focus_sessions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('drop policy if exists planner_owner_access on public.%I',t);
  execute format('create policy planner_owner_access on public.%I for all to authenticated using (owner_id=(select auth.uid()) and (select public.imperium_is_comms_owner())) with check (owner_id=(select auth.uid()) and (select public.imperium_is_comms_owner()))',t);
 end loop;
end $$;
create or replace function public.planner_touch_updated_at() returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end $$;
revoke all on function public.planner_touch_updated_at() from public,anon,authenticated;
drop trigger if exists planner_tasks_updated on public.planner_tasks;
create trigger planner_tasks_updated before update on public.planner_tasks for each row execute function public.planner_touch_updated_at();
drop trigger if exists planner_notes_updated on public.planner_notes;
create trigger planner_notes_updated before update on public.planner_notes for each row execute function public.planner_touch_updated_at();
-- Completion + next recurrence are atomic, idempotent and subject to RLS.
create or replace function public.planner_complete_task(p_id uuid,p_expected timestamptz) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t public.planner_tasks; n public.planner_tasks; next_date date; next_checklist jsonb;
begin
 select * into t from public.planner_tasks where id=p_id for update;
 if not found then raise insufficient_privilege; end if;
 if t.status='done' then return jsonb_build_object('task',to_jsonb(t),'next',null); end if;
 if t.updated_at is distinct from p_expected then raise exception 'PLANNER_CONFLICT'; end if;
 update public.planner_tasks set status='done',completed_at=now() where id=p_id returning * into t;
 if t.repeat_rule<>'none' then
  next_date:=t.due_date;
  loop
   next_date:=case t.repeat_rule when 'weekly' then next_date+7 when 'monthly' then (next_date+interval '1 month')::date else next_date+1 end;
   if t.repeat_rule='weekdays' then while extract(isodow from next_date)>5 loop next_date:=next_date+1; end loop; end if;
   exit when next_date>(now() at time zone 'Europe/Warsaw')::date;
  end loop;
  select coalesce(jsonb_agg(jsonb_set(x,'{done}','false'::jsonb)),'[]'::jsonb) into next_checklist from jsonb_array_elements(t.checklist) x;
  insert into public.planner_tasks(owner_id,project_id,title,notes,due_date,due_time,duration_minutes,priority,repeat_rule,reminder_minutes,starred,checklist,tags,source_task_id)
  values(t.owner_id,t.project_id,t.title,t.notes,next_date,t.due_time,t.duration_minutes,t.priority,t.repeat_rule,t.reminder_minutes,t.starred,next_checklist,t.tags,t.id)
  on conflict(source_task_id) do nothing returning * into n;
 end if;
 return jsonb_build_object('task',to_jsonb(t),'next',case when n.id is null then null else to_jsonb(n) end);
end $$;
revoke all on function public.planner_complete_task(uuid,timestamptz) from public,anon;
grant execute on function public.planner_complete_task(uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
