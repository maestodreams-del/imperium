-- Runs inside a transaction. Only temporary test-device records are added.
-- The real owner_only setting, accounts, roles and announcements are never changed.
savepoint browser_access_checks;
do $$
declare p record; token text; expired_token text; revoked_token text;
 fixtures jsonb:='[]'::jsonb; access_row record; pending integer;
begin
 select owner_id,owner_only into strict access_row from public.imperium_access_control where singleton;
 for p in select id,active from public.profiles loop
  token:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  expired_token:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  revoked_token:=encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex');
  insert into public.imperium_notice_devices(token_hash,profile_id,expires_at) values
   (sha256(convert_to(token,'UTF8')),p.id,now()+interval '1 day'),
   (sha256(convert_to(expired_token,'UTF8')),p.id,now()-interval '1 day');
  select count(*) into pending from public.imperium_announcement_receipts r
   join public.imperium_announcements a on a.id=r.announcement_id
   where r.profile_id=p.id and r.read_at is null and a.archived_at is null and p.active;
  fixtures:=fixtures||jsonb_build_array(jsonb_build_object(
   'id',p.id,'token',token,'expired_token',expired_token,'revoked_token',revoked_token,
   'active',p.active,'owner',p.id=access_row.owner_id,
   'browser',p.active and (not access_row.owner_only or p.id=access_row.owner_id),'unread',pending));
 end loop;
 perform set_config('imperium.browser_fixtures',fixtures::text,true);
end $$;
set local role anon;
do $$
declare f jsonb; result jsonb; invalid text;
begin
 for f in select value from jsonb_array_elements(current_setting('imperium.browser_fixtures')::jsonb) loop
  result:=public.imperium_device_notice(f->>'token');
  if (result->>'active')::boolean is distinct from (f->>'active')::boolean
   or (result->>'browser_allowed')::boolean is distinct from (f->>'browser')::boolean
   or (result->>'owner')::boolean is distinct from (f->>'browser')::boolean
   or (result->>'account_owner')::boolean is distinct from ((f->>'active')::boolean and (f->>'owner')::boolean)
   or (result->>'unread_count')::integer is distinct from (f->>'unread')::integer
  then raise exception 'Device browser authorization failed'; end if;
  -- Exact gate used by already installed Android 6.0/6.1.
  if ((result->>'active')::boolean and (result->>'owner')::boolean) is distinct from (f->>'browser')::boolean
  then raise exception 'Legacy native browser gate failed'; end if;
  foreach invalid in array array[f->>'expired_token',f->>'revoked_token','invalid',null] loop
   result:=public.imperium_device_notice(invalid);
   if result->>'active'<>'false' or result->>'owner'<>'false' or result->>'browser_allowed'<>'false'
    or result->>'account_owner'<>'false' or result->>'unread_count'<>'0'
   then raise exception 'Invalid or expired device credential accepted'; end if;
  end loop;
 end loop;
end $$;
reset role;
set local role authenticated;
do $$
declare f jsonb;
begin
 for f in select value from jsonb_array_elements(current_setting('imperium.browser_fixtures')::jsonb) loop
  perform set_config('request.jwt.claims',jsonb_build_object('sub',f->>'id','role','authenticated')::text,true);
  if public.imperium_is_comms_owner() is distinct from ((f->>'active')::boolean and (f->>'owner')::boolean)
  then raise exception 'Browser access changed actual ownership'; end if;
 end loop;
 perform set_config('request.jwt.claims','{}',true);
end $$;
reset role;
rollback to savepoint browser_access_checks;
release savepoint browser_access_checks;
