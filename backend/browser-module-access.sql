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

notify pgrst,'reload schema';
