-- Private pay rules and signed adjustments, independent of ordinary admin rights.
create table if not exists public.salary_compensation (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  pay_type text not null default 'none' check (pay_type in ('none','fixed','hourly')),
  fixed_grosz integer not null default 0 check (fixed_grosz between 0 and 1000000000),
  hourly_grosz integer not null default 0 check (hourly_grosz between 0 and 10000000)
);
create table if not exists public.salary_adjustments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  month_start date not null check (month_start=date_trunc('month',month_start)::date),
  amount_grosz integer not null check (amount_grosz between -1000000000 and 1000000000 and amount_grosz<>0),
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  kind text not null check (kind in ('manual','attendance')),
  attendance_id uuid unique references public.work_attendance(id) on delete cascade,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((kind='attendance')=(attendance_id is not null))
);
create index if not exists salary_adjustments_month_idx on public.salary_adjustments(month_start,profile_id);
alter table public.salary_compensation enable row level security;
alter table public.salary_adjustments enable row level security;
drop policy if exists salary_compensation_private on public.salary_compensation;
create policy salary_compensation_private on public.salary_compensation for select to authenticated
  using (profile_id=auth.uid() or public.salary_is_manager());
drop policy if exists salary_adjustments_private on public.salary_adjustments;
create policy salary_adjustments_private on public.salary_adjustments for select to authenticated
  using (profile_id=auth.uid() or public.salary_is_manager());
revoke all on public.salary_compensation,public.salary_adjustments from anon,authenticated;
grant select on public.salary_compensation,public.salary_adjustments to authenticated;

-- Seed by distinctive given names. The salary owner can correct any association in the app.
insert into public.salary_compensation(profile_id,pay_type,fixed_grosz,hourly_grosz)
select id,
  case when full_name ~* '^(Alena|Alona|Aliona|Alyona|Aleona|Alyona|Ал[её]на)( |$)' then 'hourly' else 'fixed' end,
  case
    when full_name ~* '^(Zenon|Zenek|Зенон)( |$)' then 1200000
    when full_name ~* '^(Nikolai|Nikolay|Nikolaj|Николай)( |$)' then 1000000
    when full_name ~* '^(Nikita|Никита)( |$)' then 800000
    when full_name ~* '^(Dima|Dmitry|Dmitriy|Dmytro|Dymitr|Дима|Дмитрий)( |$)' then 600000
    else 0 end,
  case when full_name ~* '^(Alena|Alona|Aliona|Alyona|Aleona|Ал[её]на)( |$)' then 2500 else 0 end
from public.profiles
where full_name ~* '^(Zenon|Zenek|Зенон|Nikolai|Nikolay|Nikolaj|Николай|Nikita|Никита|Dima|Dmitry|Dmitriy|Dmytro|Dymitr|Дима|Дмитрий|Alena|Alona|Aliona|Alyona|Aleona|Ал[её]на)( |$)'
on conflict (profile_id) do nothing;

create or replace function public.salary_set_compensation(p_profile uuid,p_type text,p_fixed_grosz integer,p_hourly_grosz integer)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.salary_is_manager() then raise exception 'Brak uprawnień'; end if;
  if p_type is null or p_type not in ('none','fixed','hourly')
    or p_fixed_grosz is null or p_fixed_grosz<0 or p_fixed_grosz>1000000000
    or p_hourly_grosz is null or p_hourly_grosz<0 or p_hourly_grosz>10000000
    or not exists(select 1 from public.profiles where id=p_profile and active)
  then raise exception 'Nieprawidłowe wynagrodzenie'; end if;
  insert into public.salary_compensation(profile_id,pay_type,fixed_grosz,hourly_grosz)
    values(p_profile,p_type,p_fixed_grosz,p_hourly_grosz)
    on conflict(profile_id) do update set pay_type=excluded.pay_type,
      fixed_grosz=excluded.fixed_grosz,hourly_grosz=excluded.hourly_grosz;
end $$;

create or replace function public.salary_add_adjustment(p_profile uuid,p_month date,p_amount_grosz integer,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.salary_is_manager() then raise exception 'Brak uprawnień'; end if;
  if p_month is null or p_month<>date_trunc('month',p_month)::date
    or p_amount_grosz is null or p_amount_grosz=0 or abs(p_amount_grosz::bigint)>1000000000
    or p_reason is null or char_length(trim(p_reason)) not between 1 and 500
    or not exists(select 1 from public.profiles where id=p_profile and active)
  then raise exception 'Podaj kwotę, powód i pracownika'; end if;
  insert into public.salary_adjustments(profile_id,month_start,amount_grosz,reason,kind,created_by)
    values(p_profile,p_month,p_amount_grosz,trim(p_reason),'manual',auth.uid());
end $$;
revoke all on function public.salary_set_compensation(uuid,text,integer,integer),
  public.salary_add_adjustment(uuid,date,integer,text) from public,anon;
grant execute on function public.salary_set_compensation(uuid,text,integer,integer),
  public.salary_add_adjustment(uuid,date,integer,text) to authenticated;

-- One row per finished attendance. Recalculate when a completed start time is corrected.
create or replace function public.salary_credit_attendance() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_rate integer; v_amount integer; v_month date;
begin
  if new.ended_at is null then return new; end if;
  if tg_op='UPDATE' and old.ended_at is not distinct from new.ended_at
     and old.started_at is not distinct from new.started_at then return new; end if;
  select hourly_grosz into v_rate from public.salary_compensation
    where profile_id=new.profile_id and pay_type='hourly';
  if v_rate is null or v_rate=0 then return new; end if;
  v_amount:=round(extract(epoch from (new.ended_at-new.started_at))::numeric*v_rate/3600)::integer;
  if v_amount<=0 then return new; end if;
  v_month:=date_trunc('month',new.ended_at at time zone 'Europe/Warsaw')::date;
  insert into public.salary_adjustments(profile_id,month_start,amount_grosz,reason,kind,attendance_id)
    values(new.profile_id,v_month,v_amount,'Godziny pracy · '||to_char(new.ended_at at time zone 'Europe/Warsaw','DD.MM.YYYY'),'attendance',new.id)
    on conflict(attendance_id) do update set month_start=excluded.month_start,
      amount_grosz=excluded.amount_grosz,reason=excluded.reason;
  return new;
end $$;
drop trigger if exists salary_attendance_credit on public.work_attendance;
create trigger salary_attendance_credit after update of started_at,ended_at on public.work_attendance
  for each row execute function public.salary_credit_attendance();
