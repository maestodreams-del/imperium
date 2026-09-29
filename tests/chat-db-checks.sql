insert into public.chat_messages(id,user_id,message) values(1,'00000000-0000-0000-0000-000000000001','own'),(2,'00000000-0000-0000-0000-000000000002','other');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
select public.delete_own_chat_message('1');
do $$ begin
 if exists(select 1 from public.chat_messages where id=1) then raise exception 'Own deletion failed'; end if;
 begin perform public.delete_own_chat_message('2');raise exception 'Deleted another author';exception when others then if sqlerrm='Deleted another author' then raise;end if;end;
 if not exists(select 1 from public.chat_messages where id=2) then raise exception 'Other author was deleted';end if;
 begin insert into public.chat_messages(id,user_id,message) values(3,'00000000-0000-0000-0000-000000000002','spoof');raise exception 'Author spoof allowed';exception when insufficient_privilege then null;end;
 insert into storage.objects(bucket_id,name) values('chat-files','00000000-0000-0000-0000-000000000001/file');
 begin insert into storage.objects(bucket_id,name) values('chat-files','00000000-0000-0000-0000-000000000002/file');raise exception 'Foreign folder allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.profiles set active=false where id='00000000-0000-0000-0000-000000000001';
set role authenticated;
do $$ begin if exists(select 1 from public.chat_messages) then raise exception 'Inactive account can read chat';end if;end $$;
reset role;
