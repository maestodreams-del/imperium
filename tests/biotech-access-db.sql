-- Runs in the same transaction as the migration; any failed assertion rolls back.
do $$
declare owner_id uuid; outsider_id uuid;
begin
  select a.owner_id into owner_id from public.imperium_access_control a;
  select id into outsider_id from public.profiles where id<>owner_id order by created_at limit 1;
  outsider_id:=coalesce(outsider_id,'00000000-0000-4000-8000-000000000001'::uuid);
  perform set_config('imperium.test_owner',owner_id::text,true);
  perform set_config('imperium.test_outsider',outsider_id::text,true);
end $$;
set local role authenticated;
do $$
declare unexpected_allow boolean:=false;
begin
  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.test_owner'),'role','authenticated')::text,true);
  if not public.imperium_access_status() then raise exception 'Owner cannot access application'; end if;
  perform set_config('request.path','/rpc/salary_set_compensation',true);
  perform set_config('request.method','POST',true);
  perform public.imperium_guard_access();
  if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'Owner profile unreadable'; end if;

  perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.test_outsider'),'role','authenticated')::text,true);
  if public.imperium_access_status() then raise exception 'Non-owner was authorized'; end if;
  begin
    perform public.imperium_guard_access();unexpected_allow:=true;
  exception when insufficient_privilege then null; end;
  if unexpected_allow then raise exception 'Non-owner RPC not blocked'; end if;
  perform set_config('request.path','/tasks',true);
  perform set_config('request.method','GET',true);
  unexpected_allow:=false;
  begin
    perform public.imperium_guard_access();unexpected_allow:=true;
  exception when insufficient_privilege then null; end;
  if unexpected_allow then raise exception 'Non-owner REST read not blocked'; end if;
  if exists(select 1 from public.tasks) then raise exception 'RLS leaked tasks'; end if;
  if exists(select 1 from public.profiles where id<>auth.uid()) then raise exception 'RLS leaked other profiles'; end if;
  if exists(select 1 from storage.objects where bucket_id<>'app-updates') then raise exception 'RLS leaked stored files'; end if;
  perform set_config('request.path','/app_updates',true);
  perform public.imperium_guard_access();
  perform set_config('request.path','/rpc/imperium_access_status',true);
  perform set_config('request.method','POST',true);
  perform public.imperium_guard_access();
end $$;
reset role;
do $$ begin perform set_config('request.jwt.claims','{}',true); end $$;
