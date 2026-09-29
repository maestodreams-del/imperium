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


-- ===== IMPERIUM — MELDUNEK NA OBIEKCIE =====
create table if not exists public.work_attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);

create index if not exists work_attendance_profile_idx
on public.work_attendance(profile_id, started_at desc);

create index if not exists work_attendance_location_idx
on public.work_attendance(location_id, started_at desc);

create unique index if not exists work_attendance_one_active_per_user
on public.work_attendance(profile_id)
where ended_at is null;

alter table public.work_attendance enable row level security;

drop policy if exists attendance_read on public.work_attendance;
create policy attendance_read on public.work_attendance
for select to authenticated
using (public.is_admin() or profile_id=auth.uid());

create or replace function public.start_work_attendance(p_location_id uuid)
returns public.work_attendance
language plpgsql security definer set search_path=public
as $$
declare v public.work_attendance;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if not public.can_access_location(p_location_id) then raise exception 'NO_LOCATION_ACCESS'; end if;
  if exists(select 1 from public.work_attendance where profile_id=auth.uid() and ended_at is null) then
    raise exception 'ACTIVE_ATTENDANCE_EXISTS';
  end if;
  insert into public.work_attendance(profile_id,location_id)
  values(auth.uid(),p_location_id)
  returning * into v;
  return v;
end;
$$;

create or replace function public.stop_work_attendance()
returns public.work_attendance
language plpgsql security definer set search_path=public
as $$
declare v public.work_attendance;
begin
  update public.work_attendance
     set ended_at=now()
   where id=(
     select id from public.work_attendance
      where profile_id=auth.uid() and ended_at is null
      order by started_at desc limit 1
   )
   returning * into v;
  if v.id is null then raise exception 'NO_ACTIVE_ATTENDANCE'; end if;
  return v;
end;
$$;

grant execute on function public.start_work_attendance(uuid) to authenticated;
grant execute on function public.stop_work_attendance() to authenticated;
-- Technical inspection expiry register, separate from timed tasks.
create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  last_inspected date,
  valid_until date not null,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inspections_date_order check (last_inspected is null or last_inspected <= valid_until)
);
create index if not exists inspections_location_valid_until_idx on public.inspections(location_id,valid_until);
alter table public.inspections enable row level security;
drop policy if exists inspections_read on public.inspections;
create policy inspections_read on public.inspections for select to authenticated
  using (public.can_access_location(location_id));
drop policy if exists inspections_admin_insert on public.inspections;
create policy inspections_admin_insert on public.inspections for insert to authenticated
  with check (public.is_admin());
drop policy if exists inspections_admin_update on public.inspections;
create policy inspections_admin_update on public.inspections for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists inspections_admin_delete on public.inspections;
create policy inspections_admin_delete on public.inspections for delete to authenticated
  using (public.is_admin());
grant select,insert,update,delete on public.inspections to authenticated;
-- Rental terms and the correspondence journal for each location.
create table if not exists public.rental_agreements (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  contractor text not null check (char_length(trim(contractor)) between 1 and 160),
  nip text not null default '' check (char_length(nip)<=24),
  contact_person text not null default '' check (char_length(contact_person)<=120),
  phone text not null default '' check (char_length(phone)<=50),
  email text not null default '' check (char_length(email)<=254),
  starts_on date not null,
  ends_on date,
  indefinite boolean not null default false,
  area_sqm numeric(12,2) not null check (area_sqm>0),
  price_sqm_net numeric(12,2) not null check (price_sqm_net>=0),
  price_sqm_gross numeric(12,2) not null check (price_sqm_gross>=0),
  parking_net numeric(12,2) not null default 0 check (parking_net>=0),
  parking_gross numeric(12,2) not null default 0 check (parking_gross>=0),
  internet_net numeric(12,2) not null default 0 check (internet_net>=0),
  internet_gross numeric(12,2) not null default 0 check (internet_gross>=0),
  created_at timestamptz not null default now(),
  constraint rental_term_check check ((indefinite and ends_on is null) or (not indefinite and ends_on>=starts_on))
);
create index if not exists rental_agreements_location_idx on public.rental_agreements(location_id,starts_on desc);

create table if not exists public.rental_correspondence (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  rental_id uuid references public.rental_agreements(id) on delete set null,
  kind text not null check (kind in ('incoming','outgoing','note')),
  subject text not null check (char_length(trim(subject)) between 1 and 160),
  body text not null check (char_length(trim(body)) between 1 and 10000),
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists rental_correspondence_location_idx on public.rental_correspondence(location_id,occurred_at desc);

create or replace function public.validate_rental_correspondence_location()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.rental_id is not null and not exists (
    select 1 from public.rental_agreements r where r.id=new.rental_id and r.location_id=new.location_id
  ) then raise exception 'RENTAL_LOCATION_MISMATCH'; end if;
  return new;
end;
$$;
drop trigger if exists rental_correspondence_location_guard on public.rental_correspondence;
create trigger rental_correspondence_location_guard before insert or update on public.rental_correspondence
for each row execute function public.validate_rental_correspondence_location();

alter table public.rental_agreements enable row level security;
alter table public.rental_correspondence enable row level security;
drop policy if exists rentals_admin on public.rental_agreements;
create policy rentals_admin on public.rental_agreements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists rental_correspondence_admin on public.rental_correspondence;
create policy rental_correspondence_admin on public.rental_correspondence for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select,insert,update,delete on public.rental_agreements,public.rental_correspondence to authenticated;
-- Preserve existing agreements and historical correspondence while replacing
-- the correspondence UI with payer classification and premises details.
alter table public.rental_agreements
  add column if not exists premises_address text not null default '',
  add column if not exists premises_number text not null default '',
  add column if not exists payment_status text;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.rental_agreements'::regclass and conname='rental_premises_address_length') then
    alter table public.rental_agreements add constraint rental_premises_address_length check (char_length(premises_address)<=300);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.rental_agreements'::regclass and conname='rental_premises_number_length') then
    alter table public.rental_agreements add constraint rental_premises_number_length check (char_length(premises_number)<=80);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.rental_agreements'::regclass and conname='rental_payment_status_check') then
    alter table public.rental_agreements add constraint rental_payment_status_check
      check (payment_status is null or payment_status in ('reliable','monitor','problematic'));
  end if;
end $$;
-- Voucher purchases are atomic with the Nikitocoin ledger.
alter table public.coin_transactions drop constraint if exists coin_transactions_transaction_kind_check;
alter table public.coin_transactions add constraint coin_transactions_transaction_kind_check
  check (transaction_kind in ('task_reward','task_bonus','task_penalty','adjustment','voucher_redemption'));

create table if not exists public.coin_vouchers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('hours_2','hours_4','day','bonus_500')),
  cost int not null check (cost in (1000,2000,5000,7500)),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'issued' check (status in ('issued','paid')),
  redeemed_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_by uuid references public.profiles(id),
  check ((kind='bonus_500' and starts_at is null and ends_at is null) or
         (kind<>'bonus_500' and starts_at is not null and ends_at>starts_at))
);
create index if not exists coin_vouchers_profile_idx on public.coin_vouchers(profile_id,redeemed_at desc);
alter table public.coin_vouchers enable row level security;
drop policy if exists coin_vouchers_read on public.coin_vouchers;
create policy coin_vouchers_read on public.coin_vouchers for select to authenticated
  using (profile_id=auth.uid() or public.is_admin());
grant select on public.coin_vouchers to authenticated;
revoke insert,update,delete on public.coin_vouchers from anon,authenticated;

create or replace function public.redeem_coin_voucher(p_kind text,p_start timestamptz default null,p_end timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_cost int; v_balance bigint; v_id uuid; v_now timestamptz:=now();
begin
  if v_user is null then raise exception 'LOGIN_REQUIRED'; end if;
  -- Serialize simultaneous purchases for the same wallet.
  perform 1 from public.profiles where id=v_user and active=true for update;
  if not found then raise exception 'ACCOUNT_INACTIVE'; end if;
  v_cost:=case p_kind when 'hours_2' then 1000 when 'hours_4' then 2000
    when 'day' then 5000 when 'bonus_500' then 7500 else null end;
  if v_cost is null then raise exception 'UNKNOWN_VOUCHER'; end if;
  if p_kind='bonus_500' then
    if p_start is not null or p_end is not null then raise exception 'INVALID_TIME'; end if;
  else
    if p_start is null or p_end is null or p_start<v_now or p_start>v_now+interval '90 days'
       or (p_kind='hours_2' and p_end<>p_start+interval '2 hours')
       or (p_kind='hours_4' and p_end<>p_start+interval '4 hours')
       or (p_kind='day' and (p_start<>(date_trunc('day',p_start at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw')
           or p_end<>((date_trunc('day',p_start at time zone 'Europe/Warsaw')+interval '1 day') at time zone 'Europe/Warsaw')))
    then raise exception 'INVALID_TIME'; end if;
    if exists(select 1 from public.coin_vouchers where profile_id=v_user and kind<>'bonus_500'
      and starts_at<p_end and ends_at>p_start) then raise exception 'VOUCHER_OVERLAP'; end if;
  end if;
  select coalesce(sum(amount),0) into v_balance from public.coin_transactions where profile_id=v_user;
  if v_balance<v_cost then raise exception 'INSUFFICIENT_COINS'; end if;
  insert into public.coin_vouchers(profile_id,kind,cost,starts_at,ends_at)
    values(v_user,p_kind,v_cost,p_start,p_end) returning id into v_id;
  insert into public.coin_transactions(profile_id,transaction_kind,amount,description,created_by)
    values(v_user,'voucher_redemption',-v_cost,
      case p_kind when 'bonus_500' then 'Wniosek o premię 500 zł'
      else 'Voucher: '||p_kind||' ('||p_start::text||' – '||p_end::text||')' end,v_user);
  return v_id;
end; $$;

create or replace function public.mark_voucher_paid(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.coin_vouchers set status='paid',paid_at=now(),paid_by=auth.uid()
    where id=p_id and kind='bonus_500' and status='issued';
  if not found then raise exception 'VOUCHER_NOT_PENDING'; end if;
end; $$;
revoke all on function public.redeem_coin_voucher(text,timestamptz,timestamptz) from public;
revoke all on function public.mark_voucher_paid(uuid) from public;
grant execute on function public.redeem_coin_voucher(text,timestamptz,timestamptz),public.mark_voucher_paid(uuid) to authenticated;
-- Dated shifts in Polish local time. Admins manage shifts; workers read their own.
create table if not exists public.work_shifts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at>starts_at and ends_at<=starts_at+interval '24 hours')
);
create index if not exists work_shifts_profile_time_idx on public.work_shifts(profile_id,starts_at);
alter table public.work_shifts enable row level security;
drop policy if exists work_shifts_read on public.work_shifts;
create policy work_shifts_read on public.work_shifts for select to authenticated
  using (profile_id=auth.uid() or public.is_admin());
grant select on public.work_shifts to authenticated;
revoke insert,update,delete on public.work_shifts from anon,authenticated;

create or replace function public.add_work_shift(p_profile uuid,p_location uuid,p_start timestamptz,p_end timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_start is null or p_end is null or p_start<now()-interval '1 day' or p_start>now()+interval '366 days'
    or p_end<=p_start or p_end>p_start+interval '24 hours' then raise exception 'INVALID_SHIFT'; end if;
  perform 1 from public.profiles where id=p_profile and active=true for update;
  if not found then raise exception 'ACCOUNT_INACTIVE'; end if;
  if not exists(select 1 from public.locations where id=p_location and active=true) then raise exception 'INVALID_LOCATION'; end if;
  if exists(select 1 from public.work_shifts where profile_id=p_profile and starts_at<p_end and ends_at>p_start)
    then raise exception 'SHIFT_OVERLAP'; end if;
  insert into public.work_shifts(profile_id,location_id,starts_at,ends_at,created_by)
    values(p_profile,p_location,p_start,p_end,auth.uid()) returning id into v_id;
  return v_id;
end; $$;

create or replace function public.delete_work_shift(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_shift public.work_shifts;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_shift from public.work_shifts where id=p_id;
  if not found then raise exception 'SHIFT_NOT_FOUND'; end if;
  perform 1 from public.profiles where id=v_shift.profile_id for update;
  if exists(select 1 from public.coin_vouchers v where v.profile_id=v_shift.profile_id
    and v.kind<>'bonus_500' and v.starts_at<v_shift.ends_at and v.ends_at>v_shift.starts_at)
    then raise exception 'SHIFT_HAS_VOUCHER'; end if;
  delete from public.work_shifts where id=p_id;
end; $$;

-- Admin check-in is audited separately from self check-in.
alter table public.work_attendance add column if not exists started_by uuid references public.profiles(id);
alter table public.work_attendance add column if not exists ended_by uuid references public.profiles(id);
create or replace function public.admin_start_attendance(p_profile uuid,p_location uuid)
returns public.work_attendance language plpgsql security definer set search_path='' as $$
declare v public.work_attendance;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  perform 1 from public.profiles where id=p_profile and active=true for update;
  if not found then raise exception 'ACCOUNT_INACTIVE'; end if;
  if not exists(select 1 from public.locations where id=p_location and active=true) then raise exception 'INVALID_LOCATION'; end if;
  if exists(select 1 from public.work_attendance where profile_id=p_profile and ended_at is null)
    then raise exception 'ACTIVE_ATTENDANCE_EXISTS'; end if;
  insert into public.work_attendance(profile_id,location_id,started_by)
    values(p_profile,p_location,auth.uid()) returning * into v;
  return v;
end; $$;
create or replace function public.admin_stop_attendance(p_profile uuid)
returns public.work_attendance language plpgsql security definer set search_path='' as $$
declare v public.work_attendance;
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.work_attendance set ended_at=now(),ended_by=auth.uid()
    where id=(select id from public.work_attendance where profile_id=p_profile and ended_at is null limit 1)
    returning * into v;
  if v.id is null then raise exception 'NO_ACTIVE_ATTENDANCE'; end if;
  return v;
end; $$;

-- Redeem hours only inside an assigned shift; a day voucher must cover a shift on that date.
create or replace function public.redeem_coin_voucher(p_kind text,p_start timestamptz default null,p_end timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_cost int; v_balance bigint; v_id uuid; v_now timestamptz:=now();
begin
  if v_user is null then raise exception 'LOGIN_REQUIRED'; end if;
  perform 1 from public.profiles where id=v_user and active=true for update;
  if not found then raise exception 'ACCOUNT_INACTIVE'; end if;
  v_cost:=case p_kind when 'hours_2' then 1000 when 'hours_4' then 2000
    when 'day' then 5000 when 'bonus_500' then 7500 else null end;
  if v_cost is null then raise exception 'UNKNOWN_VOUCHER'; end if;
  if p_kind='bonus_500' then
    if p_start is not null or p_end is not null then raise exception 'INVALID_TIME'; end if;
  else
    if p_start is null or p_end is null or p_start<v_now or p_start>v_now+interval '90 days'
       or (p_kind='hours_2' and p_end<>p_start+interval '2 hours')
       or (p_kind='hours_4' and p_end<>p_start+interval '4 hours')
       or (p_kind='day' and (p_start<>(date_trunc('day',p_start at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw')
           or p_end<>((date_trunc('day',p_start at time zone 'Europe/Warsaw')+interval '1 day') at time zone 'Europe/Warsaw')))
    then raise exception 'INVALID_TIME'; end if;
    if p_kind='day' then
      if not exists(select 1 from public.work_shifts s where s.profile_id=v_user
        and s.starts_at>=p_start and s.starts_at<p_end) then raise exception 'NO_SCHEDULED_SHIFT'; end if;
    else
      if not exists(select 1 from public.work_shifts s where s.profile_id=v_user
        and s.starts_at<=p_start and s.ends_at>=p_end) then raise exception 'OUTSIDE_WORK_SHIFT'; end if;
    end if;
    if exists(select 1 from public.coin_vouchers where profile_id=v_user and kind<>'bonus_500'
      and starts_at<p_end and ends_at>p_start) then raise exception 'VOUCHER_OVERLAP'; end if;
  end if;
  select coalesce(sum(amount),0) into v_balance from public.coin_transactions where profile_id=v_user;
  if v_balance<v_cost then raise exception 'INSUFFICIENT_COINS'; end if;
  insert into public.coin_vouchers(profile_id,kind,cost,starts_at,ends_at)
    values(v_user,p_kind,v_cost,p_start,p_end) returning id into v_id;
  insert into public.coin_transactions(profile_id,transaction_kind,amount,description,created_by)
    values(v_user,'voucher_redemption',-v_cost,
      case p_kind when 'bonus_500' then 'Wniosek o premię 500 zł'
      else 'Voucher: '||p_kind||' ('||p_start::text||' – '||p_end::text||')' end,v_user);
  return v_id;
end; $$;
revoke all on function public.add_work_shift(uuid,uuid,timestamptz,timestamptz),public.delete_work_shift(uuid),
  public.admin_start_attendance(uuid,uuid),public.admin_stop_attendance(uuid) from public;
grant execute on function public.add_work_shift(uuid,uuid,timestamptz,timestamptz),public.delete_work_shift(uuid),
  public.admin_start_attendance(uuid,uuid),public.admin_stop_attendance(uuid) to authenticated;

-- Delegate rental agreements without granting broad administrator rights.
alter table public.profiles add column if not exists can_manage_rentals boolean not null default false;

create or replace function public.can_manage_rentals()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid()
    and p.active=true and (p.role='admin' or p.can_manage_rentals));
$$;

drop policy if exists rentals_admin on public.rental_agreements;
drop policy if exists rentals_read on public.rental_agreements;
drop policy if exists rentals_insert_delegated on public.rental_agreements;
drop policy if exists rentals_update_delegated on public.rental_agreements;
drop policy if exists rentals_delete_admin on public.rental_agreements;
create policy rentals_read on public.rental_agreements for select to authenticated
  using (public.is_admin() or (public.can_manage_rentals() and public.can_access_location(location_id)));
create policy rentals_insert_delegated on public.rental_agreements for insert to authenticated
  with check (public.can_manage_rentals() and public.can_access_location(location_id));
create policy rentals_update_delegated on public.rental_agreements for update to authenticated
  using (public.can_manage_rentals() and public.can_access_location(location_id))
  with check (public.can_manage_rentals() and public.can_access_location(location_id));
create policy rentals_delete_admin on public.rental_agreements for delete to authenticated
  using (public.is_admin());

-- If exactly one active account is named Zenon, grant him rental access.
-- Location assignments still limit which buildings he can manage.
do $$ begin
  if (select count(*) from public.profiles where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)')=1 then
    update public.profiles set can_manage_rentals=true
    where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)';
  end if;
end $$;

-- Scoped contributor permissions (also applied by auto-update).
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
-- Durable rental plans and personal reminders for the administrator and delegated supervisor.
alter table public.profiles add column if not exists can_view_important boolean not null default false;
create or replace function public.can_view_important()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active=true
    and (p.role='admin' or p.can_view_important));
$$;
create table if not exists public.rental_actions (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.rental_agreements(id) on delete cascade,
  kind text not null check (kind in ('cesja','aneks','wypowiedzenie')),
  due_on date not null,
  notes text not null default '' check (char_length(notes)<=1000),
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists rental_actions_rental_date_idx on public.rental_actions(rental_id,due_on);
alter table public.rental_actions enable row level security;
drop policy if exists rental_actions_read on public.rental_actions;
drop policy if exists rental_actions_insert on public.rental_actions;
drop policy if exists rental_actions_update on public.rental_actions;
drop policy if exists rental_actions_delete on public.rental_actions;
create policy rental_actions_read on public.rental_actions for select to authenticated using (
  exists(select 1 from public.rental_agreements r where r.id=rental_id
    and (public.is_admin() or (public.can_manage_rentals() and public.can_access_location(r.location_id)))));
create policy rental_actions_insert on public.rental_actions for insert to authenticated with check (
  created_by=auth.uid() and exists(select 1 from public.rental_agreements r where r.id=rental_id
    and (public.is_admin() or (public.can_manage_rentals() and public.can_access_location(r.location_id)))));
create policy rental_actions_update on public.rental_actions for update to authenticated using (
  exists(select 1 from public.rental_agreements r where r.id=rental_id
    and (public.is_admin() or (public.can_manage_rentals() and public.can_access_location(r.location_id))))) with check (
  exists(select 1 from public.rental_agreements r where r.id=rental_id
    and (public.is_admin() or (public.can_manage_rentals() and public.can_access_location(r.location_id)))));
create policy rental_actions_delete on public.rental_actions for delete to authenticated using (public.is_admin());
grant select,insert,update,delete on public.rental_actions to authenticated;

create table if not exists public.important_alerts (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('rental_expiry','inspection_expiry','action_14','notice_30')),
  source_id uuid not null,
  due_on date not null,
  title text not null,
  details text not null default '',
  location_id uuid not null references public.locations(id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(recipient_id,kind,source_id,due_on)
);
create index if not exists important_alerts_recipient_idx on public.important_alerts(recipient_id,resolved_at,due_on);
alter table public.important_alerts enable row level security;
drop policy if exists important_alerts_read on public.important_alerts;
create policy important_alerts_read on public.important_alerts for select to authenticated
  using (recipient_id=auth.uid() and public.can_view_important() and public.can_access_location(location_id));
grant select on public.important_alerts to authenticated;
revoke insert,update,delete on public.important_alerts from anon,authenticated;

create or replace function public.complete_important_alert(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.can_view_important() then raise exception 'NO_ACCESS'; end if;
  update public.important_alerts set resolved_at=now()
  where id=p_id and recipient_id=auth.uid() and resolved_at is null and public.can_access_location(location_id);
end $$;
grant execute on function public.complete_important_alert(uuid) to authenticated;

-- Daily, idempotent generation. All dates are interpreted in Warsaw.
create or replace function public.refresh_important_alerts()
returns void language plpgsql security definer set search_path='' as $$
declare today_pl date:=(now() at time zone 'Europe/Warsaw')::date;
begin
  -- Obsolete dates and completed plans must not leave misleading alerts.
  update public.important_alerts a set resolved_at=now() where a.resolved_at is null and (
    (a.kind='rental_expiry' and not exists(select 1 from public.rental_agreements r
      where r.id=a.source_id and r.ends_on=a.due_on and not r.indefinite))
    or (a.kind='inspection_expiry' and not exists(select 1 from public.inspections i
      where i.id=a.source_id and i.valid_until=a.due_on))
    or (a.kind in ('action_14','notice_30') and not exists(select 1 from public.rental_actions x
      where x.id=a.source_id and x.due_on=a.due_on and x.completed_at is null))
  );
  insert into public.important_alerts(recipient_id,kind,source_id,due_on,title,details,location_id)
  select p.id,'rental_expiry',r.id,r.ends_on,'Koniec umowy najmu: '||r.contractor,
    'Umowa wygasa '||r.ends_on::text,r.location_id
  from public.rental_agreements r join public.profiles p on p.active and
    (p.role='admin' or (p.can_view_important and exists(select 1 from public.profile_locations pl
      where pl.profile_id=p.id and pl.location_id=r.location_id)))
  where r.indefinite=false and r.ends_on between today_pl-30 and (today_pl+interval '1 month')::date
  on conflict(recipient_id,kind,source_id,due_on) do nothing;
  insert into public.important_alerts(recipient_id,kind,source_id,due_on,title,details,location_id)
  select p.id,'inspection_expiry',i.id,i.valid_until,'Koniec przeglądu: '||i.name,
    'Ważny do '||i.valid_until::text,i.location_id
  from public.inspections i join public.profiles p on p.active and
    (p.role='admin' or (p.can_view_important and exists(select 1 from public.profile_locations pl
      where pl.profile_id=p.id and pl.location_id=i.location_id)))
  where i.valid_until between today_pl-30 and (today_pl+interval '1 month')::date
  on conflict(recipient_id,kind,source_id,due_on) do nothing;
  insert into public.important_alerts(recipient_id,kind,source_id,due_on,title,details,location_id)
  select p.id,'action_14',x.id,x.due_on,
    'Przygotuj '||case x.kind when 'cesja' then 'cesję' when 'aneks' then 'aneks' else 'wypowiedzenie' end||': '||r.contractor,
    x.notes,r.location_id
  from public.rental_actions x join public.rental_agreements r on r.id=x.rental_id
    join public.profiles p on p.active and
    (p.role='admin' or (p.can_view_important and exists(select 1 from public.profile_locations pl
      where pl.profile_id=p.id and pl.location_id=r.location_id)))
  where x.completed_at is null and x.due_on between today_pl-30 and today_pl+14
  on conflict(recipient_id,kind,source_id,due_on) do nothing;
  insert into public.important_alerts(recipient_id,kind,source_id,due_on,title,details,location_id)
  select p.id,'notice_30',x.id,x.due_on,'Wypowiedzenie za miesiąc: '||r.contractor,
    x.notes,r.location_id
  from public.rental_actions x join public.rental_agreements r on r.id=x.rental_id
    join public.profiles p on p.active and
    (p.role='admin' or (p.can_view_important and exists(select 1 from public.profile_locations pl
      where pl.profile_id=p.id and pl.location_id=r.location_id)))
  where x.kind='wypowiedzenie' and x.completed_at is null
    and x.due_on between today_pl-30 and (today_pl+interval '1 month')::date
  on conflict(recipient_id,kind,source_id,due_on) do nothing;
end $$;
grant execute on function public.refresh_important_alerts() to authenticated;

-- Grant supervisor access to the uniquely matching active Zenon account.
do $$ begin
  if (select count(*) from public.profiles where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)')=1 then
    update public.profiles set can_view_important=true
    where active=true and full_name ~* '(^|[[:space:]])Zenon([[:space:]]|$)';
  end if;
end $$;
select public.refresh_important_alerts();
-- Progress is personal to the recipient; unfinished alerts still stay in Important.
alter table public.important_alerts add column if not exists in_progress_at timestamptz;
create or replace function public.set_important_alert_progress(p_id uuid,p_in_progress boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.can_view_important() then raise exception 'NO_ACCESS'; end if;
  update public.important_alerts
     set in_progress_at=case when p_in_progress then now() else null end
   where id=p_id and recipient_id=auth.uid() and resolved_at is null
     and public.can_access_location(location_id);
end $$;
grant execute on function public.set_important_alert_progress(uuid,boolean) to authenticated;
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
