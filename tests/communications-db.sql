-- Also run in production before activation. Everything here rolls back to savepoint.
savepoint communication_checks;
do $$
declare owner_id uuid; outsider uuid;
begin
 select a.owner_id into owner_id from public.imperium_access_control a;
 select id into outsider from public.profiles where active and id<>owner_id order by created_at limit 1;
 if outsider is null then raise exception 'A second active test recipient is needed'; end if;
 perform set_config('imperium.test_owner',owner_id::text,true);perform set_config('imperium.test_outsider',outsider::text,true);
end $$;
set local role authenticated;
do $$
declare item uuid; feed jsonb; stamp timestamptz; denied boolean; receipt_count integer; token text:=repeat('a',64);
begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.test_owner'),'role','authenticated')::text,true);
 item:=public.imperium_publish_announcement('Test transaction — rolled back','A private announcement fixture.');
 feed:=public.imperium_comms_feed();if not (feed->>'owner')::boolean then raise exception 'Owner flag missing';end if;
 select jsonb_array_length(a->'receipts') into receipt_count from jsonb_array_elements(feed->'announcements') a where a->>'id'=item::text;
 if receipt_count<2 then raise exception 'Recipients missing';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.test_outsider'),'role','authenticated')::text,true);
 perform set_config('request.path','/rpc/imperium_comms_feed',true);perform set_config('request.method','POST',true);perform public.imperium_guard_access();
 feed:=public.imperium_comms_feed();if (feed->>'owner')::boolean then raise exception 'Participant became owner';end if;
 if exists(select 1 from jsonb_array_elements(feed->'announcements') a where jsonb_array_length(a->'receipts')>0) then raise exception 'Participant saw other receipts';end if;
 denied:=false;begin perform public.imperium_publish_announcement('Not allowed','Not allowed');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Participant published';end if;
 denied:=false;begin update public.imperium_announcement_receipts set read_at=now();exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Direct receipts mutation permitted';end if;
 denied:=false;begin perform public.imperium_archive_announcement(item,true);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Participant archived';end if;
 perform public.imperium_register_notice_device(token);
 if (public.imperium_device_notice(token)->>'unread_count')::integer<1 then raise exception 'Device cannot see pending notice count';end if;
 if (public.imperium_device_notice(token)->>'owner')::boolean then raise exception 'Participant device has owner tools';end if;
 if (public.imperium_device_notice(repeat('b',64))->>'active')::boolean then raise exception 'Unknown device accepted';end if;
 stamp:=public.imperium_ack_announcement(item);if public.imperium_ack_announcement(item)<>stamp then raise exception 'Repeat acknowledgement changed timestamp';end if;
 perform public.imperium_revoke_notice_device(token);if (public.imperium_device_notice(token)->>'active')::boolean then raise exception 'Revoked device remained active';end if;
 perform set_config('request.path','/rpc/salary_set_compensation',true);denied:=false;begin perform public.imperium_guard_access();exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Operational access leaked';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.test_owner'),'role','authenticated')::text,true);
 feed:=public.imperium_comms_feed();if not exists(select 1 from jsonb_array_elements(feed->'announcements') a,jsonb_array_elements(a->'receipts') r where a->>'id'=item::text and r->>'profile_id'=current_setting('imperium.test_outsider') and r->>'read_at' is not null) then raise exception 'Owner did not see receipt';end if;
 perform public.imperium_archive_announcement(item,true);
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.test_outsider'),'role','authenticated')::text,true);
 if exists(select 1 from jsonb_array_elements(public.imperium_comms_feed()->'announcements') a where a->>'id'=item::text) then raise exception 'Archived notice still visible';end if;
end $$;
reset role;
rollback to savepoint communication_checks;
release savepoint communication_checks;
