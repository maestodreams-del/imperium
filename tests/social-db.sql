-- Safe for the release database: all test cards/messages/receipts roll back.
savepoint social_checks;
do $$
declare ids uuid[];own uuid;
begin
 select owner_id into own from public.imperium_access_control;
 select array_agg(id order by created_at) into ids from public.profiles where active and id<>own;
 if coalesce(cardinality(ids),0)<2 then raise exception 'Two active participants are required for private-message checks';end if;
 perform set_config('imperium.social_owner',own::text,true);perform set_config('imperium.social_a',ids[1]::text,true);perform set_config('imperium.social_b',ids[2]::text,true);
end $$;
set local role authenticated;
do $$
declare a uuid:=current_setting('imperium.social_a')::uuid;b uuid:=current_setting('imperium.social_b')::uuid;own uuid:=current_setting('imperium.social_owner')::uuid;mid uuid:=gen_random_uuid();other uuid:=gen_random_uuid();ids uuid[]:=array[]::uuid[];denied boolean;data jsonb;page2 jsonb;cursor_row jsonb;stamp text;n integer;old_card jsonb;
begin
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 perform set_config('request.method','POST',true);perform set_config('request.path','/rpc/imperium_social_directory',true);perform public.imperium_guard_access();
 select c into old_card from jsonb_array_elements(public.imperium_social_directory()->'contacts') c where c->>'id'=b::text;
 perform public.imperium_social_save_card('Test role','Private test — rolled back','123456789','fixture@example.test','data:image/jpeg;base64,/9j/AA==');
 select c into data from jsonb_array_elements(public.imperium_social_directory()->'contacts') c where c->>'id'=a::text;
 if data->>'phone'<>'123456789' or data->>'avatar_data'<>'data:image/jpeg;base64,/9j/AA==' then raise exception 'Own card update failed';end if;
 select c into data from jsonb_array_elements(public.imperium_social_directory()->'contacts') c where c->>'id'=b::text;
 if data<>old_card then raise exception 'Someone else card changed';end if;
 denied:=false;begin perform public.imperium_social_save_card('','','','','data:image/svg+xml;base64,PHN2Zz4=');exception when others then denied:=true;end;if not denied then raise exception 'Unsafe avatar accepted';end if;
 denied:=false;begin update public.imperium_contact_cards set phone='spoof';exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Direct card mutation allowed';end if;
 perform public.imperium_social_send(b,'Social fixture: A to B',mid);perform public.imperium_social_send(b,'Social fixture: A to B',mid);
 select count(*) into n from jsonb_array_elements(public.imperium_social_thread(b)->'messages') m where m->>'id'=mid::text;
 if n<>1 then raise exception 'Retry created duplicate message';end if;
 if public.imperium_social_read(array[mid])<>0 then raise exception 'Sender forged read receipt';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',own,'role','authenticated')::text,true);
 if exists(select 1 from jsonb_array_elements(public.imperium_social_thread(a)->'messages') m where m->>'id'=mid::text) then raise exception 'Owner saw third-party conversation';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 if not exists(select 1 from jsonb_array_elements(public.imperium_social_inbox()) m where m->>'peer_id'=a::text and (m->>'unread')::integer>=1) then raise exception 'Inbox unread missing';end if;
 denied:=false;begin perform public.imperium_social_send(a,'Social fixture: A to B',mid);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Client id spoof allowed';end if;
 if public.imperium_social_read(array[mid])<>1 then raise exception 'Receiver could not read own message';end if;
 select m->>'read_at' into stamp from jsonb_array_elements(public.imperium_social_thread(a)->'messages') m where m->>'id'=mid::text;
 if public.imperium_social_read(array[mid])<>0 then raise exception 'Read receipt is not idempotent';end if;
 perform public.imperium_social_send(a,'Social fixture: B reply',other);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 if not exists(select 1 from jsonb_array_elements(public.imperium_social_thread(b)->'messages') m where m->>'id'=mid::text and m->>'read_at'=stamp) then raise exception 'Sender does not see read status';end if;
 for n in 1..52 loop ids:=array_append(ids,gen_random_uuid());perform public.imperium_social_send(b,'Pagination fixture '||n,ids[n]);end loop;
 data:=public.imperium_social_thread(b);if not (data->>'has_more')::boolean or jsonb_array_length(data->'messages')<>50 then raise exception 'Pagination size failed';end if;
 cursor_row:=data->'messages'->0;page2:=public.imperium_social_thread(b,(cursor_row->>'created_at')::timestamptz,(cursor_row->>'id')::uuid);
 if exists(select 1 from jsonb_array_elements(data->'messages') x,jsonb_array_elements(page2->'messages') y where x->>'id'=y->>'id') then raise exception 'Pagination overlaps at equal timestamps';end if;
 select count(distinct m->>'id') into n from jsonb_array_elements((data->'messages')||(page2->'messages')) m where (m->>'id')::uuid=any(ids);
 if n<>52 then raise exception 'Pagination lost same-timestamp messages';end if;
 perform set_config('request.path','/rpc/salary_set_compensation',true);denied:=false;begin perform public.imperium_guard_access();exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Operational access leaked';end if;
end $$;
reset role;
-- Inactive accounts cannot use the shared network.
update public.profiles set active=false where id=current_setting('imperium.social_b')::uuid;
set local role authenticated;
do $$ declare denied boolean:=false;begin
 perform set_config('request.jwt.claims',json_build_object('sub',current_setting('imperium.social_b'),'role','authenticated')::text,true);
 begin perform public.imperium_social_directory();exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Inactive user read contacts';end if;
end $$;
reset role;
rollback to savepoint social_checks;
release savepoint social_checks;
