-- Use existing access controls. No global RLS or API hook changes.
begin;
do $$ begin
 if not exists(select 1 from public.imperium_access_control a join public.profiles p on p.id=a.owner_id where a.singleton and p.active and p.role='admin') then raise exception 'Active owner missing'; end if;
end $$;
update public.imperium_access_control set owner_only=true,updated_at=now() where singleton;
update public.profiles set active=false where active and id<>(select owner_id from public.imperium_access_control where singleton);
commit;
select jsonb_build_object('owner_only',(select owner_only from public.imperium_access_control where singleton),'active_profiles',(select jsonb_agg(jsonb_build_object('id',id,'name',full_name)) from public.profiles where active),'blocked_profiles',(select count(*) from public.profiles where not active)) as result;
