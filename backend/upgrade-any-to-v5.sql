-- IMPERIUM v5 upgrade: Nikitocoiny
-- Run once in Supabase SQL Editor on an existing IMPERIUM v2/v3/v4 database.

alter table public.tasks add column if not exists reward_coins int not null default 0;
alter table public.tasks add column if not exists penalty_coins int not null default 0;
do $$ begin alter table public.tasks add constraint tasks_reward_coins_check check (reward_coins >= 0); exception when duplicate_object then null; end $$;
do $$ begin alter table public.tasks add constraint tasks_penalty_coins_check check (penalty_coins >= 0); exception when duplicate_object then null; end $$;

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

alter table public.coin_transactions enable row level security;
drop policy if exists coins_read on public.coin_transactions;
drop policy if exists coins_admin_insert on public.coin_transactions;
create policy coins_read on public.coin_transactions for select to authenticated using (public.is_admin() or profile_id=auth.uid());
create policy coins_admin_insert on public.coin_transactions for insert to authenticated with check (public.is_admin() and created_by=auth.uid());

create or replace function public.complete_task_with_coins(p_task_id uuid,p_bonus_coins int default 0)
returns public.tasks language plpgsql security definer set search_path=public as $$
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
    values(v.claimed_by,v.id,'task_reward',v.reward_coins,'Nagroda za wykonanie zadania „'||v.title||'”',auth.uid()) on conflict do nothing;
  end if;
  if coalesce(p_bonus_coins,0) > 0 then
    insert into public.coin_transactions(profile_id,task_id,transaction_kind,amount,description,created_by)
    values(v.claimed_by,v.id,'task_bonus',p_bonus_coins,'Bonus za wzorowe wykonanie zadania „'||v.title||'”',auth.uid()) on conflict do nothing;
  end if;
  return v;
end; $$;

create or replace function public.fail_task_with_coin_penalty(p_task_id uuid,p_reason text default 'Niewykonanie zadania.')
returns public.tasks language plpgsql security definer set search_path=public as $$
declare v public.tasks; v_worker uuid;
begin
  if not public.is_admin() then raise exception 'ADMIN_ONLY'; end if;
  select * into v from public.tasks where id=p_task_id for update;
  if v.id is null then raise exception 'TASK_NOT_FOUND'; end if;
  if v.claimed_by is null or v.status not in ('in_progress','review') then raise exception 'TASK_HAS_NO_ACTIVE_WORKER'; end if;
  if v.penalty_coins <= 0 then raise exception 'NO_COIN_PENALTY_CONFIGURED'; end if;
  v_worker:=v.claimed_by;
  insert into public.coin_transactions(profile_id,task_id,transaction_kind,amount,description,created_by)
  values(v_worker,v.id,'task_penalty',-v.penalty_coins,coalesce(nullif(trim(p_reason),''),'Niewykonanie zadania.'),auth.uid());
  update public.tasks set status='open',claimed_by=null,claimed_at=null,deadline_at=null,report_text=null,report_submitted_at=null,completed_at=null where id=v.id returning * into v;
  return v;
end; $$;

grant execute on function public.complete_task_with_coins(uuid,int) to authenticated;
grant execute on function public.fail_task_with_coin_penalty(uuid,text) to authenticated;
