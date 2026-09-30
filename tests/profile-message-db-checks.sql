insert into public.profiles values('00000000-0000-0000-0000-000000000003',true);
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.profile_messages(sender_id,receiver_id,body) values('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','hello');
do $$ declare ids uuid[]; begin
 if public.profile_message_unread_count()<>0 then raise exception 'Outgoing message counted as unread';end if;
 select array_agg(id) into ids from public.profile_messages;
 perform public.mark_profile_messages_read(ids);
 if exists(select 1 from public.profile_messages where read_at is not null) then raise exception 'Sender marked recipient message read';end if;
 begin insert into public.profile_messages(sender_id,receiver_id,body) values('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','spoof');raise exception 'Sender spoof permitted';exception when insufficient_privilege then null;end;
 begin insert into public.profile_messages(sender_id,receiver_id,body,read_at) values(auth.uid(),'00000000-0000-0000-0000-000000000002','fake receipt',now());raise exception 'Client fabricated receipt';exception when insufficient_privilege then null;end;
end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin if exists(select 1 from public.profile_messages) then raise exception 'Unrelated participant can see private messages';end if;end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ declare ids uuid[]; begin
 if public.profile_message_unread_count()<>1 then raise exception 'Recipient unread missing';end if;
 select array_agg(id) into ids from public.profile_messages;
 perform public.mark_profile_messages_read(ids);
 if public.profile_message_unread_count()<>0 then raise exception 'Read marker failed';end if;
end $$;
reset role;
update public.profiles set active=false where id='00000000-0000-0000-0000-000000000003';
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
do $$ begin
 begin insert into public.profile_messages(sender_id,receiver_id,body) values(auth.uid(),'00000000-0000-0000-0000-000000000003','inactive');raise exception 'Sent to inactive profile';exception when insufficient_privilege then null;end;
end $$;
reset role;
