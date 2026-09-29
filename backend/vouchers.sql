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
