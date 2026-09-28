-- IMPERIUM v5 — Supabase schema
-- Run the entire file in Supabase SQL Editor on a NEW project.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('admin','worker');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.task_status as enum ('open','in_progress','review','done');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.task_priority as enum ('normal','high','urgent');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Pracownik',
  role public.user_role not null default 'worker',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  city text,
  address text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_locations (
  profile_id uuid references public.profiles(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  primary key(profile_id,location_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  notes text,
  sanction_type text not null default 'none' check (sanction_type in ('none','note','warning','reprimand','other')),
  sanction_text text,
  disciplinary_note text,
  reward_coins int not null default 0 check (reward_coins >= 0),
  penalty_coins int not null default 0 check (penalty_coins >= 0),
  location_id uuid not null references public.locations(id),
  priority public.task_priority not null default 'normal',
  status public.task_status not null default 'open',
  duration_min int not null default 60 check(duration_min >= 5),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  deadline_at timestamptz,
  report_text text,
  report_submitted_at timestamptz,
  completed_at timestamptz,
  rework_count int not null default 0 check(rework_count >= 0)
);

-- Upgrade-safe columns for existing IMPERIUM v2 databases.
alter table public.tasks add column if not exists notes text;
alter table public.tasks add column if not exists sanction_type text not null default 'none';
alter table public.tasks add column if not exists sanction_text text;
alter table public.tasks add column if not exists disciplinary_note text;
alter table public.tasks add column if not exists rework_count int not null default 0;
alter table public.tasks add column if not exists reward_coins int not null default 0;
alter table public.tasks add column if not exists penalty_coins int not null default 0;

do $$ begin
  alter table public.tasks add constraint tasks_sanction_type_check check (sanction_type in ('none','note','warning','reprimand','other'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tasks add constraint tasks_rework_count_check check (rework_count >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tasks add constraint tasks_reward_coins_check check (reward_coins >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.tasks add constraint tasks_penalty_coins_check check (penalty_coins >= 0);
exception when duplicate_object then null; end $$;

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  kind text not null default 'report' check (kind in ('task','report','comment')),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.disciplinary_records (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  record_type text not null check (record_type in ('note','warning','reprimand','other')),
  description text not null check (length(trim(description)) > 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists disciplinary_records_profile_idx on public.disciplinary_records(profile_id,created_at desc);
create index if not exists disciplinary_records_task_idx on public.disciplinary_records(task_id);


create table if not exists public.coin_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  transaction_kind text not null check (transaction_kind in ('task_reward','task_bonus','task_penalty','adjustment')),
  amount int not null check (amount <> 0),
  description text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists coin_transactions_profile_idx on public.coin_transactions(profile_id,created_at desc);
create index if not exists coin_transactions_task_idx on public.coin_transactions(task_id);
create unique index if not exists coin_reward_once_idx on public.coin_transactions(task_id) where transaction_kind='task_reward' and task_id is not null;
create unique index if not exists coin_bonus_once_idx on public.coin_transactions(task_id) where transaction_kind='task_bonus' and task_id is not null;

-- Automatically create a profile after Auth sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.profiles(id,full_name,role,active)
  values(new.id,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),'Pracownik'),'worker',true)
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Helpers
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.active=true);
$$;

create or replace function public.can_access_location(p_location uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select public.is_admin() or exists(
    select 1 from public.profile_locations pl
    join public.profiles p on p.id=pl.profile_id
    where pl.profile_id=auth.uid() and pl.location_id=p_location and p.active=true
  );
$$;

-- The very first registered account can bootstrap itself to administrator.
-- Once an admin exists this function does nothing for everyone else.
create or replace function public.bootstrap_first_admin()
returns boolean
language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then return false; end if;
  if not exists(select 1 from public.profiles where role='admin') then
    update public.profiles set role='admin',active=true where id=auth.uid();
    return true;
  end if;
  return public.is_admin();
end;
$$;

create or replace function public.seed_default_locations()
returns void
language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  insert into public.locations(name,city,address,description) values
    ('Maktronik','Bydgoszcz','',''),
    ('Smolańska','Bydgoszcz','Smolańska, Bydgoszcz',''),
    ('TERIMEX','Pogorzelica','',''),
    ('MEGA','','',''),
    ('Płonia','Szczecin','',''),
    ('Hotel Tur','Szczecin','','')
  on conflict(name) do nothing;
end;
$$;

-- Atomic claim: first eligible person wins.
create or replace function public.claim_task(p_task_id uuid)
returns public.tasks
language plpgsql security definer set search_path=public
as $$
declare v public.tasks;
begin
  update public.tasks t
     set status='in_progress',claimed_by=auth.uid(),claimed_at=now(),deadline_at=now()+make_interval(mins=>duration_min)
   where t.id=p_task_id
     and t.status='open'
     and t.claimed_by is null
     and public.can_access_location(t.location_id)
   returning t.* into v;
  if v.id is null then raise exception 'TASK_ALREADY_CLAIMED_OR_NO_ACCESS'; end if;
  return v;
end;
$$;

-- Worker can submit only their own in-progress task.
create or replace function public.submit_task_report(p_task_id uuid,p_report_text text)
returns public.tasks
language plpgsql security definer set search_path=public
as $$
declare v public.tasks;
begin
  if nullif(trim(p_report_text),'') is null then raise exception 'REPORT_REQUIRED'; end if;
  update public.tasks t
     set report_text=p_report_text,report_submitted_at=now(),status='review'
   where t.id=p_task_id and t.claimed_by=auth.uid() and t.status='in_progress'
   returning t.* into v;
  if v.id is null then raise exception 'TASK_NOT_OWNED'; end if;
  return v;
end;
$$;

-- Admin accepts a reviewed task and atomically settles its Nikitocoin reward.
create or replace function public.complete_task_with_coins(p_task_id uuid,p_bonus_coins int default 0)
returns public.tasks
language plpgsql security definer set search_path=public
as $$
declare v public.tasks;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  if coalesce(p_bonus_coins,0) < 0 then raise exception 'BONUS_MUST_BE_POSITIVE'; end if;
  select * into v from public.tasks where id=p_task_id for update;
  if v.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if v.status <> 'review' or v.claimed_by is null then raise exception 'TASK_NOT_READY_FOR_ACCEPTANCE'; end if;

  update public.tasks set status='done',completed_at=now() where id=p_task_id returning * into v;
  if v.reward_coins > 0 then
    insert into public.coin_transactions(profile_id,task_id,transaction_kind,amount,description,created_by)
    values(v.claimed_by,v.id,'task_reward',v.reward_coins,'Nagroda za wykonanie zadania „'||v.title||'”',auth.uid())
    on conflict do nothing;
  end if;
  if coalesce(p_bonus_coins,0) > 0 then
    insert into public.coin_transactions(profile_id,task_id,transaction_kind,amount,description,created_by)
    values(v.claimed_by,v.id,'task_bonus',p_bonus_coins,'Bonus za wzorowe wykonanie zadania „'||v.title||'”',auth.uid())
    on conflict do nothing;
  end if;
  return v;
end;
$$;

-- Admin marks a task as not completed, charges its configured internal-point penalty and returns it to the open pool.
create or replace function public.fail_task_with_coin_penalty(p_task_id uuid,p_reason text default 'Niewykonanie zadania.')
returns public.tasks
language plpgsql security definer set search_path=public
as $$
declare v public.tasks; v_worker uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select * into v from public.tasks where id=p_task_id for update;
  if v.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if v.claimed_by is null or v.status not in ('in_progress','review') then raise exception 'TASK_HAS_NO_ACTIVE_WORKER'; end if;
  if v.penalty_coins <= 0 then raise exception 'NO_COIN_PENALTY_CONFIGURED'; end if;
  v_worker := v.claimed_by;
  insert into public.coin_transactions(profile_id,task_id,transaction_kind,amount,description,created_by)
  values(v_worker,v.id,'task_penalty',-v.penalty_coins,coalesce(nullif(trim(p_reason),''),'Niewykonanie zadania.'),auth.uid());
  update public.tasks
     set status='open',claimed_by=null,claimed_at=null,deadline_at=null,report_text=null,report_submitted_at=null,completed_at=null
   where id=v.id returning * into v;
  return v;
end;
$$;

-- RLS
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.profile_locations enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_attachments enable row level security;
alter table public.events enable row level security;
alter table public.disciplinary_records enable row level security;
alter table public.coin_transactions enable row level security;

-- Drop old policies if rerunning.
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_admin_write on public.profiles;
drop policy if exists locations_read on public.locations;
drop policy if exists locations_admin_write on public.locations;
drop policy if exists profile_locations_read on public.profile_locations;
drop policy if exists profile_locations_admin_write on public.profile_locations;
drop policy if exists tasks_read on public.tasks;
drop policy if exists tasks_admin_insert on public.tasks;
drop policy if exists tasks_admin_update on public.tasks;
drop policy if exists tasks_admin_delete on public.tasks;
drop policy if exists comments_read on public.task_comments;
drop policy if exists comments_insert on public.task_comments;
drop policy if exists attachments_read on public.task_attachments;
drop policy if exists attachments_insert on public.task_attachments;
drop policy if exists events_read on public.events;
drop policy if exists events_insert on public.events;
drop policy if exists discipline_read on public.disciplinary_records;
drop policy if exists discipline_admin_write on public.disciplinary_records;
drop policy if exists coins_read on public.coin_transactions;
drop policy if exists coins_admin_insert on public.coin_transactions;

create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_admin_write on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy locations_read on public.locations for select to authenticated using (public.is_admin() or public.can_access_location(id));
create policy locations_admin_write on public.locations for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Important: admins must see all assignments; workers need their own assignments for filtering.
create policy profile_locations_read on public.profile_locations for select to authenticated using (profile_id=auth.uid() or public.is_admin());
create policy profile_locations_admin_write on public.profile_locations for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy tasks_read on public.tasks for select to authenticated using (public.can_access_location(location_id));
create policy tasks_admin_insert on public.tasks for insert to authenticated with check (public.is_admin());
create policy tasks_admin_update on public.tasks for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tasks_admin_delete on public.tasks for delete to authenticated using (public.is_admin());
-- Workers intentionally have NO generic UPDATE policy. They use claim_task/submit_task_report RPCs.

create policy comments_read on public.task_comments for select to authenticated using (
  exists(select 1 from public.tasks t where t.id=task_id and public.can_access_location(t.location_id))
);
create policy comments_insert on public.task_comments for insert to authenticated with check (
  author_id=auth.uid() and exists(select 1 from public.tasks t where t.id=task_id and public.can_access_location(t.location_id))
);

create policy attachments_read on public.task_attachments for select to authenticated using (
  exists(select 1 from public.tasks t where t.id=task_id and public.can_access_location(t.location_id))
);
create policy attachments_insert on public.task_attachments for insert to authenticated with check (
  uploaded_by=auth.uid() and exists(
    select 1 from public.tasks t where t.id=task_id and (public.is_admin() or (t.claimed_by=auth.uid() and public.can_access_location(t.location_id)))
  )
);

-- User asked that everybody can see who took/finished work, so event feed is shared with authenticated staff.
create policy events_read on public.events for select to authenticated using (true);
create policy events_insert on public.events for insert to authenticated with check (actor_id=auth.uid() or actor_id is null);

-- Disciplinary history: administrators can manage all records; a worker can read only their own.
create policy discipline_read on public.disciplinary_records for select to authenticated using (public.is_admin() or profile_id=auth.uid());
create policy discipline_admin_write on public.disciplinary_records for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Nikitocoin ledger: workers see their own history; admins see and can append all manual adjustments.
create policy coins_read on public.coin_transactions for select to authenticated using (public.is_admin() or profile_id=auth.uid());
create policy coins_admin_insert on public.coin_transactions for insert to authenticated with check (public.is_admin() and created_by=auth.uid());

-- RPC access.
grant execute on function public.bootstrap_first_admin() to authenticated;
grant execute on function public.seed_default_locations() to authenticated;
grant execute on function public.claim_task(uuid) to authenticated;
grant execute on function public.submit_task_report(uuid,text) to authenticated;
grant execute on function public.complete_task_with_coins(uuid,int) to authenticated;
grant execute on function public.fail_task_with_coin_penalty(uuid,text) to authenticated;

-- Storage bucket. This creates it if it does not yet exist.
insert into storage.buckets(id,name,public,file_size_limit)
values('task-files','task-files',false,52428800)
on conflict(id) do update set public=false,file_size_limit=52428800;

drop policy if exists task_files_read on storage.objects;
drop policy if exists task_files_upload on storage.objects;
drop policy if exists task_files_delete_admin on storage.objects;

-- Metadata table still enforces which task a user can see. Storage itself is authenticated/private.
create policy task_files_read on storage.objects for select to authenticated using (bucket_id='task-files');
create policy task_files_upload on storage.objects for insert to authenticated with check (bucket_id='task-files' and auth.uid() is not null);
create policy task_files_delete_admin on storage.objects for delete to authenticated using (bucket_id='task-files' and public.is_admin());
