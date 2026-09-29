-- Private monthly salary savings. The first administrator is the sole salary manager.
-- Additional managers must be appointed by a database owner, never via the client.
create table if not exists public.salary_managers (
  profile_id uuid primary key references public.profiles(id) on delete cascade
);
insert into public.salary_managers(profile_id)
select id from public.profiles where role='admin' order by created_at,id limit 1
on conflict do nothing;

create or replace function public.salary_is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.salary_managers m
    join public.profiles p on p.id=m.profile_id
    where m.profile_id=auth.uid() and p.active);
$$;

create table if not exists public.salary_pots (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  month_start date not null check (month_start=date_trunc('month',month_start)::date),
  goal_zl integer not null default 0 check (goal_zl between 0 and 10000000),
  unique(profile_id,month_start)
);
create table if not exists public.salary_additions (
  id uuid primary key default gen_random_uuid(),
  pot_id uuid not null references public.salary_pots(id) on delete cascade,
  amount_zl integer not null default 25 check (amount_zl=25),
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists salary_additions_pot_idx on public.salary_additions(pot_id,created_at desc);

alter table public.salary_managers enable row level security;
alter table public.salary_pots enable row level security;
alter table public.salary_additions enable row level security;
drop policy if exists salary_pots_private on public.salary_pots;
create policy salary_pots_private on public.salary_pots for select to authenticated
  using (profile_id=auth.uid() or public.salary_is_manager());
drop policy if exists salary_additions_private on public.salary_additions;
create policy salary_additions_private on public.salary_additions for select to authenticated
  using (exists(select 1 from public.salary_pots p where p.id=pot_id
    and (p.profile_id=auth.uid() or public.salary_is_manager())));
revoke all on public.salary_managers,public.salary_pots,public.salary_additions from anon,authenticated;
grant select on public.salary_pots,public.salary_additions to authenticated;
revoke all on function public.salary_is_manager() from public,anon;
grant execute on function public.salary_is_manager() to authenticated;

create or replace function public.salary_add_25(p_profile uuid,p_month date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_pot uuid;
begin
  if not public.salary_is_manager() then raise exception 'Brak uprawnień'; end if;
  if p_profile is null or p_month is null or p_month<>date_trunc('month',p_month)::date
    or not exists(select 1 from public.profiles where id=p_profile and active)
  then raise exception 'Nieprawidłowy pracownik lub miesiąc'; end if;
  insert into public.salary_pots(profile_id,month_start) values(p_profile,p_month)
    on conflict(profile_id,month_start) do update set goal_zl=public.salary_pots.goal_zl
    returning id into v_pot;
  insert into public.salary_additions(pot_id,amount_zl,added_by)
    values(v_pot,25,auth.uid());
end $$;

create or replace function public.salary_set_goal(p_profile uuid,p_month date,p_goal integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.salary_is_manager() then raise exception 'Brak uprawnień'; end if;
  if p_profile is null or p_month is null or p_month<>date_trunc('month',p_month)::date
    or p_goal is null or p_goal<0 or p_goal>10000000
    or not exists(select 1 from public.profiles where id=p_profile and active)
  then raise exception 'Nieprawidłowe dane'; end if;
  insert into public.salary_pots(profile_id,month_start,goal_zl) values(p_profile,p_month,p_goal)
    on conflict(profile_id,month_start) do update set goal_zl=excluded.goal_zl;
end $$;
revoke all on function public.salary_add_25(uuid,date),public.salary_set_goal(uuid,date,integer) from public,anon;
grant execute on function public.salary_add_25(uuid,date),public.salary_set_goal(uuid,date,integer) to authenticated;

-- Assign every 25 zł addition to a source bag; existing entries remain in the overall total.
alter table public.salary_additions add column if not exists source text not null default 'other';
do $$ begin
  if not exists(select 1 from pg_constraint where conrelid='public.salary_additions'::regclass and conname='salary_additions_source_check') then
    alter table public.salary_additions add constraint salary_additions_source_check
      check(source in ('tur','terimex','bj','maktronik','other'));
  end if;
end $$;
drop function if exists public.salary_add_25(uuid,date);
create or replace function public.salary_add_25(p_profile uuid,p_month date,p_source text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_pot uuid;
begin
  if not public.salary_is_manager() then raise exception 'Brak uprawnień'; end if;
  if p_profile is null or p_month is null or p_month<>date_trunc('month',p_month)::date
    or p_source is null or p_source not in ('tur','terimex','bj','maktronik')
    or not exists(select 1 from public.profiles where id=p_profile and active)
  then raise exception 'Nieprawidłowy pracownik, miesiąc lub źródło'; end if;
  insert into public.salary_pots(profile_id,month_start) values(p_profile,p_month)
    on conflict(profile_id,month_start) do update set goal_zl=public.salary_pots.goal_zl
    returning id into v_pot;
  insert into public.salary_additions(pot_id,amount_zl,added_by,source)
    values(v_pot,25,auth.uid(),p_source);
end $$;
revoke all on function public.salary_add_25(uuid,date,text) from public,anon;
grant execute on function public.salary_add_25(uuid,date,text) to authenticated;
