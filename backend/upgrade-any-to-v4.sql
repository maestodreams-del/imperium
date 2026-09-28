-- IMPERIUM -> v4: uwagi/sankcje + karta pracownika + historia dyscyplinarna
-- Ten plik można uruchomić na istniejącej bazie v2 lub v3.

alter table public.tasks add column if not exists notes text;
alter table public.tasks add column if not exists sanction_type text not null default 'none';
alter table public.tasks add column if not exists sanction_text text;
alter table public.tasks add column if not exists disciplinary_note text;
alter table public.tasks add column if not exists rework_count int not null default 0;

do $$ begin
  alter table public.tasks add constraint tasks_sanction_type_check
  check (sanction_type in ('none','note','warning','reprimand','other'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.tasks add constraint tasks_rework_count_check
  check (rework_count >= 0);
exception when duplicate_object then null; end $$;

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

alter table public.disciplinary_records enable row level security;

drop policy if exists discipline_read on public.disciplinary_records;
drop policy if exists discipline_admin_write on public.disciplinary_records;

create policy discipline_read on public.disciplinary_records
for select to authenticated
using (public.is_admin() or profile_id=auth.uid());

create policy discipline_admin_write on public.disciplinary_records
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
