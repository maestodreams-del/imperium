do $$ begin
 if (select count(*) from public.salary_compensation)<>5 then raise exception 'Missing employee preset'; end if;
 if exists(select 1 from (values
   ('Zenon',1200000),('Mikalai',1000000),('Mikita',800000),('Dmytro Test',600000)
 ) as expected(name,amount) left join public.profiles p on p.full_name=expected.name
 left join public.salary_compensation s on s.profile_id=p.id
 where s.pay_type is distinct from 'fixed' or s.fixed_grosz is distinct from expected.amount)
 then raise exception 'Incorrect fixed compensation'; end if;
 if not exists(select 1 from public.salary_compensation s join public.profiles p on p.id=s.profile_id where p.full_name='Olena' and s.pay_type='hourly' and s.hourly_grosz=2500)
 then raise exception 'Incorrect hourly compensation'; end if;
end $$;

insert into public.work_attendance(id,profile_id,started_at) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','2026-09-29 06:00+00');
do $$ begin
 if exists(select 1 from public.salary_adjustments) then raise exception 'Open attendance credited'; end if;
end $$;
update public.work_attendance set ended_at='2026-09-29 14:30+00';
update public.work_attendance set ended_at='2026-09-29 14:30+00';
do $$ begin
 if (select count(*) from public.salary_adjustments)<>1 or (select amount_grosz from public.salary_adjustments)<>21250 then raise exception '8.5h credit or deduplication failed'; end if;
end $$;
update public.work_attendance set started_at='2026-09-29 07:00+00';
do $$ begin
 if (select count(*) from public.salary_adjustments)<>1 or (select amount_grosz from public.salary_adjustments)<>18750 then raise exception 'Attendance correction failed'; end if;
end $$;
-- The payroll month follows Warsaw time, even at the UTC month boundary.
insert into public.work_attendance(profile_id,started_at,ended_at) values
 ('00000000-0000-0000-0000-000000000006','2026-09-30 21:00+00','2026-09-30 22:00+00');
do $$ begin
 if not exists(select 1 from public.salary_adjustments where month_start='2026-10-01' and amount_grosz=2500) then raise exception 'Warsaw payroll month failed'; end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.salary_add_adjustment('00000000-0000-0000-0000-000000000002','2026-09-01',15025,'Premia testowa');
select public.salary_add_adjustment('00000000-0000-0000-0000-000000000002','2026-09-01',-20050,'Zaliczka testowa');
do $$ begin
 if (select sum(amount_grosz) from public.salary_adjustments where profile_id='00000000-0000-0000-0000-000000000002')<>-5025 then raise exception 'Signed adjustments failed'; end if;
 begin
   perform public.salary_add_adjustment('00000000-0000-0000-0000-000000000002','2026-09-01',100,' ');
   raise exception 'Empty reason was accepted';
 exception when others then
   if sqlerrm<>'Podaj kwotę, powód i pracownika' then raise; end if;
 end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
do $$ begin
 if (select count(*) from public.salary_compensation)<>1 then raise exception 'Employee can read other pay rules'; end if;
 if (select count(*) from public.salary_adjustments)<>2 then raise exception 'Employee salary visibility failed'; end if;
 begin
   perform public.salary_add_adjustment('00000000-0000-0000-0000-000000000006','2026-09-01',100,'Unauthorized');
   raise exception 'Worker could change salary';
 exception when others then
   if sqlerrm<>'Brak uprawnień' then raise; end if;
 end;
end $$;
reset role;
select 'PASS: fixed presets, hourly checkout, deduplication, corrections, Warsaw month, signed adjustments and private access' as verification;
