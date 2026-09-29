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
