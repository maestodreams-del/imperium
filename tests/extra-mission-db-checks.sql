set role authenticated;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';
insert into public.extra_missions(profile_id,location_id,title,description) values(auth.uid(),'10000000-0000-0000-0000-000000000001','Repair','Door repaired');
do $$ begin
 if (select count(*) from public.extra_missions)<>1 then raise exception 'Own report missing';end if;
 if exists(select 1 from public.extra_missions where done_on<>(now() at time zone 'Europe/Warsaw')::date) then raise exception 'Wrong local completion date';end if;
 begin insert into public.extra_missions(profile_id,title,description) values('00000000-0000-0000-0000-000000000003','Spoof','Not mine');raise exception 'Reported work for another employee';exception when insufficient_privilege then null;end;
 begin insert into public.extra_missions(profile_id,location_id,title,description) values(auth.uid(),'10000000-0000-0000-0000-000000000002','Forbidden','No access');raise exception 'Forbidden location accepted';exception when insufficient_privilege then null;end;
 begin insert into public.extra_missions(profile_id,title,description,done_on) values(auth.uid(),'Date','Forged','2000-01-01');raise exception 'Forged completion date accepted';exception when insufficient_privilege then null;end;
 begin insert into public.extra_missions(profile_id,title,description,attachments) values(auth.uid(),'File','Foreign attachment','[{"path":"00000000-0000-0000-0000-000000000003/file","name":"file","bucket":"extra-mission-files"}]');raise exception 'Foreign attachment accepted';exception when insufficient_privilege then null;end;
end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000003';
do $$ begin if exists(select 1 from public.extra_missions) then raise exception 'Unrelated worker sees report';end if;end $$;
set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';
do $$ begin if (select count(*) from public.extra_missions)<>1 then raise exception 'Administrator cannot see employee report';end if;end $$;
reset role;
