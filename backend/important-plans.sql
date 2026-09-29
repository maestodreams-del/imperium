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
