-- Private operating modules remain owner-only. Announcements are shared with
-- explicit publication-time recipients; read receipts cannot be forged for others.
create table if not exists public.imperium_announcements (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 160),
 body text not null check(length(body) between 1 and 20000), created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), archived_at timestamptz, system_notice boolean not null default false
);
create table if not exists public.imperium_announcement_receipts (
 announcement_id uuid not null references public.imperium_announcements(id), profile_id uuid not null references public.profiles(id),
 name_snapshot text not null, read_at timestamptz, primary key(announcement_id,profile_id)
);
create table if not exists public.imperium_notice_devices (
 token_hash bytea primary key, profile_id uuid not null references public.profiles(id), expires_at timestamptz not null
);
alter table public.imperium_announcements enable row level security;
alter table public.imperium_announcement_receipts enable row level security;
alter table public.imperium_notice_devices enable row level security;
revoke all on public.imperium_announcements,public.imperium_announcement_receipts,public.imperium_notice_devices from public,anon,authenticated;

create or replace function public.imperium_is_comms_owner() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.imperium_access_control a join public.profiles p on p.id=a.owner_id where a.singleton and p.active and p.id=auth.uid());
$$;
create or replace function public.imperium_comms_feed() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare mine uuid:=auth.uid(); is_owner boolean:=public.imperium_is_comms_owner(); result jsonb;
begin
 if mine is null or not exists(select 1 from public.profiles where id=mine and active) then raise insufficient_privilege using message='Konto nieaktywne.'; end if;
 select jsonb_build_object('active',true,'owner',is_owner,'announcements',coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb)) into result from (
  select a.created_at,jsonb_build_object('id',a.id,'title',a.title,'body',a.body,'created_at',a.created_at,'archived_at',a.archived_at,'system_notice',a.system_notice,
   'author',p.full_name,'read_at',r.read_at,'is_recipient',r.profile_id is not null,
   'receipts',case when is_owner then (select coalesce(jsonb_agg(jsonb_build_object('profile_id',rr.profile_id,'name',rr.name_snapshot,'active',pp.active,'read_at',rr.read_at) order by rr.read_at nulls first,rr.name_snapshot),'[]'::jsonb) from public.imperium_announcement_receipts rr join public.profiles pp on pp.id=rr.profile_id where rr.announcement_id=a.id) else '[]'::jsonb end) item
  from public.imperium_announcements a join public.profiles p on p.id=a.created_by
  left join public.imperium_announcement_receipts r on r.announcement_id=a.id and r.profile_id=mine
  where is_owner or (r.profile_id=mine and a.archived_at is null)
 ) q;
 return result;
end $$;
create or replace function public.imperium_publish_announcement(p_title text,p_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare item uuid;
begin
 if not public.imperium_is_comms_owner() then raise insufficient_privilege; end if;
 if p_title is null or p_body is null or length(btrim(p_title)) not between 1 and 160 or length(btrim(p_body)) not between 1 and 20000 then raise exception 'Podaj tytuł i treść ogłoszenia.'; end if;
 insert into public.imperium_announcements(title,body,created_by) values(btrim(p_title),btrim(p_body),auth.uid()) returning id into item;
 insert into public.imperium_announcement_receipts(announcement_id,profile_id,name_snapshot,read_at)
 select item,id,full_name,case when id=auth.uid() then now() end from public.profiles where active;
 return item;
end $$;
create or replace function public.imperium_ack_announcement(p_id uuid) returns timestamptz language plpgsql security definer set search_path='' as $$
declare stamp timestamptz;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active) then raise insufficient_privilege; end if;
 update public.imperium_announcement_receipts r set read_at=coalesce(r.read_at,now()) where r.announcement_id=p_id and r.profile_id=auth.uid()
 and exists(select 1 from public.imperium_announcements a where a.id=p_id and a.archived_at is null) returning r.read_at into stamp;
 if stamp is null then raise insufficient_privilege using message='To ogłoszenie nie jest dostępne.'; end if;
 return stamp;
end $$;
create or replace function public.imperium_archive_announcement(p_id uuid,p_archived boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.imperium_is_comms_owner() then raise insufficient_privilege; end if;
 update public.imperium_announcements set archived_at=case when p_archived then now() end where id=p_id;
end $$;
-- A device credential can only read the number of unread notices. It cannot read
-- posts, acknowledge them, or access any operational data. No login tokens stored natively.
create or replace function public.imperium_register_notice_device(p_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active) or p_token !~ '^[a-f0-9]{64}$' then raise insufficient_privilege; end if;
 if exists(select 1 from public.imperium_notice_devices where token_hash=sha256(convert_to(p_token,'UTF8')) and profile_id<>auth.uid()) then raise insufficient_privilege; end if;
 delete from public.imperium_notice_devices where expires_at<now();
 insert into public.imperium_notice_devices values(sha256(convert_to(p_token,'UTF8')),auth.uid(),now()+interval '90 days')
 on conflict(token_hash) do update set expires_at=excluded.expires_at;
end $$;
create or replace function public.imperium_revoke_notice_device(p_token text) returns void language plpgsql security definer set search_path='' as $$
begin delete from public.imperium_notice_devices where token_hash=sha256(convert_to(p_token,'UTF8')) and profile_id=auth.uid(); end $$;
-- Android 6.0/6.1 use the legacy "owner" field only as the native browser gate.
-- Keep that wire contract while naming browser authorization explicitly.
-- Real ownership remains separate in account_owner and imperium_is_comms_owner().
create or replace function public.imperium_device_notice(p_token text)
returns jsonb language sql stable security definer set search_path='' as $$
 with device as (
  select d.profile_id
  from public.imperium_notice_devices d
  join public.profiles p on p.id=d.profile_id and p.active
  where d.token_hash=sha256(convert_to(p_token,'UTF8')) and d.expires_at>now()
 ), access as (
  select
   exists(select 1 from device) as active,
   exists(select 1 from device d join public.imperium_access_control c
     on c.singleton and c.owner_id=d.profile_id) as account_owner,
   exists(select 1 from device d join public.imperium_access_control c
     on c.singleton and (not c.owner_only or c.owner_id=d.profile_id)) as browser_allowed
 )
 select jsonb_build_object(
  'unread_count',(select count(*) from device d
    join public.imperium_announcement_receipts r on r.profile_id=d.profile_id and r.read_at is null
    join public.imperium_announcements a on a.id=r.announcement_id and a.archived_at is null),
  'active',access.active,
  'account_owner',access.account_owner,
  'browser_allowed',access.browser_allowed,
  'owner',access.browser_allowed
 ) from access;
$$;
revoke all on function public.imperium_is_comms_owner(),public.imperium_comms_feed(),public.imperium_publish_announcement(text,text),public.imperium_ack_announcement(uuid),public.imperium_archive_announcement(uuid,boolean),public.imperium_register_notice_device(text),public.imperium_revoke_notice_device(text),public.imperium_device_notice(text) from public;
grant execute on function public.imperium_is_comms_owner(),public.imperium_comms_feed(),public.imperium_publish_announcement(text,text),public.imperium_ack_announcement(uuid),public.imperium_archive_announcement(uuid,boolean),public.imperium_register_notice_device(text),public.imperium_revoke_notice_device(text) to authenticated;
grant execute on function public.imperium_device_notice(text) to anon,authenticated;

create or replace function public.imperium_guard_access() returns void language plpgsql security invoker set search_path='' as $$
declare request_path text:=current_setting('request.path',true); request_method text:=current_setting('request.method',true);
begin
 if auth.role()='service_role' or public.imperium_access_status() then return; end if;
 if request_method='POST' and request_path='/rpc/imperium_device_notice' then return; end if;
 if auth.uid() is not null and (
 (request_method='POST' and request_path in ('/rpc/imperium_access_status','/rpc/imperium_comms_feed','/rpc/imperium_ack_announcement','/rpc/imperium_register_notice_device','/rpc/imperium_revoke_notice_device')) or
 (request_method='GET' and request_path in ('/app_updates','/profiles'))
 ) then return; end if;
 raise sqlstate '42501' using message='IMPERIUM_OWNER_ONLY: Dostęp wyłącznie dla właściciela.';
end $$;
revoke all on function public.imperium_guard_access() from public;
grant execute on function public.imperium_guard_access() to anon,authenticated,service_role;
notify pgrst,'reload schema';
